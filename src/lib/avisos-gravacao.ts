import { createHash } from "node:crypto"
import { after } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { dataEmSaoPaulo } from "@/lib/datas"
import { criarSaida, destinoAutorizado, processarSaidas } from "@/lib/whatsapp-outbox"
import { telefoneCompleto } from "@/lib/whatsapp-identidade"
import {
  mensagensDoEvento,
  type DadosDoAviso,
  type EventoDaGravacao,
  type Mensagens,
  type PapelDoAviso,
} from "@/lib/avisos-gravacao-textos"

// Quem envia os avisos das Gravações Externas (os textos e a tabela de quem
// recebe o quê estão em lib/avisos-gravacao-textos.ts).
//
// Tudo passa pela fila do WhatsApp (criarSaida), com chave por gravação,
// evento, papel e telefone: o mesmo aviso não sai duas vezes no mesmo dia.
// Quem fez a mudança não é avisado dela, e a mesma pessoa em dois papéis
// recebe uma mensagem só. O cliente entra como destino da própria gravação
// (whatsapp-outbox → destinoCliente).
//
// Aviso nunca derruba o que o gerou: avisarGravacao engole o erro e registra.

type Tx = Prisma.TransactionClient

const telefones = (lista: { telefone: string | null }[]) =>
  [...new Set(lista.map((u) => telefoneCompleto(u.telefone)).filter((t): t is string => !!t))]

/** Gestão: admin, gestor e quem recebe todos os avisos. Recebe só o que trava. */
export async function telefonesDaGestao(tx: Pick<Tx, "usuario">, organizacaoId: string) {
  return telefones(await tx.usuario.findMany({
    where: { status: "ativo", telefone: { not: null },
      organizacoes: { some: { organizacaoId, OR: [{ papel: { in: ["admin", "gestor"] } }, { recebeTodosAvisos: true }] } } },
    select: { telefone: true },
  }))
}

/**
 * Operação: quem tem "Opera Gravações Externas" (a Débora). Sem ninguém
 * marcado, a gestão faz o papel — o aviso do dia a dia não pode se perder.
 */
export async function telefonesDaOperacao(tx: Pick<Tx, "usuario">, organizacaoId: string) {
  const operam = telefones(await tx.usuario.findMany({
    where: { status: "ativo", telefone: { not: null }, organizacoes: { some: { organizacaoId, operaGravacoes: true } } },
    select: { telefone: true },
  }))
  return operam.length ? operam : telefonesDaGestao(tx, organizacaoId)
}

type GravacaoDoAviso = DadosDoAviso & {
  id: string
  videomakerTelefone: string | null
  clienteTelefone: string | null
  solicitanteTelefones: string[]
}

export async function dadosDaGravacao(tx: Tx, organizacaoId: string, demandaId: string): Promise<GravacaoDoAviso | null> {
  const d = await tx.demanda.findFirst({
    where: { id: demandaId, organizacaoId },
    include: {
      videomaker: { select: { nome: true, telefone: true } },
      solicitante: { select: { telefone: true } },
      convites: { where: { status: { in: ["aceito", "pendente"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { token: true, videomakerId: true } },
    },
  })
  if (!d) return null
  const base = process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") || "https://nuflow.space"
  const convite = d.convites.find((c) => c.videomakerId === d.videomakerId)
  return {
    ...d,
    linkEntrega: convite ? `${base}/convite/${convite.token}` : null,
    videomakerTelefone: telefoneCompleto(d.videomaker?.telefone),
    clienteTelefone: telefoneCompleto(d.clienteFinalTelefone),
    solicitanteTelefones: [...new Set([d.solicitante?.telefone, d.telefoneSolicitante].map(telefoneCompleto).filter((t): t is string => !!t))],
  }
}

// O primeiro papel que alcança um telefone é o que fala com ele.
const ORDEM: PapelDoAviso[] = ["videomaker", "cliente", "operacao", "gestao", "solicitante"]

/** Põe na fila, dentro da transação de quem chama. Devolve quantos avisos entraram. */
export async function enfileirarAvisos(tx: Tx, e: {
  organizacaoId: string
  gravacao: GravacaoDoAviso
  /** O que é este aviso (evento ou regra), para a chave de não repetir. */
  motivo: string
  mensagens: Mensagens
  /** Quem fez a mudança: não recebe o aviso dela. */
  autorUsuarioId?: string | null
}): Promise<number> {
  const g = e.gravacao
  const autor = e.autorUsuarioId
    ? telefoneCompleto((await tx.usuario.findUnique({ where: { id: e.autorUsuarioId }, select: { telefone: true } }))?.telefone)
    : null
  const ja = new Set<string>(autor ? [autor] : [])
  const destinos: Record<PapelDoAviso, () => Promise<string[]>> = {
    videomaker: async () => (g.videomakerTelefone ? [g.videomakerTelefone] : []),
    cliente: async () => (g.clienteTelefone ? [g.clienteTelefone] : []),
    operacao: () => telefonesDaOperacao(tx, e.organizacaoId),
    gestao: () => telefonesDaGestao(tx, e.organizacaoId),
    solicitante: async () => g.solicitanteTelefones,
  }
  const dia = dataEmSaoPaulo(new Date())
  let n = 0
  for (const papel of ORDEM) {
    const texto = e.mensagens[papel]
    if (!texto) continue
    for (const telefone of await destinos[papel]()) {
      if (ja.has(telefone)) continue
      ja.add(telefone)
      // Quem não é pessoa cadastrada não recebe — a fila recusa número solto.
      if (papel !== "cliente" && !await destinoAutorizado(tx, e.organizacaoId, telefone)) continue
      const hash = createHash("sha256").update(telefone).digest("hex").slice(0, 12)
      await criarSaida(tx, {
        organizacaoId: e.organizacaoId, origem: "manual", referencia: g.id,
        chave: `grav:${g.id}:${e.motivo}:${dia}:${papel}:${hash}`.slice(0, 128),
        telefone, texto, expiraEm: new Date(Date.now() + 86400_000),
        ...(papel === "cliente" ? { clienteDe: g.id } : {}),
      })
      n++
    }
  }
  return n
}

/**
 * Avisa um evento da gravação. Para chamar em segundo plano (emSegundoPlano):
 * abre a própria transação e nunca lança.
 */
export async function avisarGravacao(organizacaoId: string, demandaId: string, evento: EventoDaGravacao, autorUsuarioId?: string | null) {
  try {
    const n = await comOrg(organizacaoId, () => prisma.$transaction(async (tx) => {
      const g = await dadosDaGravacao(tx, organizacaoId, demandaId)
      if (!g) return 0
      return enfileirarAvisos(tx, { organizacaoId, gravacao: g, motivo: evento, mensagens: mensagensDoEvento(evento, g), autorUsuarioId })
    }))
    if (n > 0) {
      try { after(async () => { await processarSaidas(organizacaoId).catch(() => undefined) }) } catch { /* o consumidor da fila retoma */ }
    }
    return n
  } catch (e) {
    console.error("[Avisos de gravação] falhou", { evento, erro: e instanceof Error ? e.message : String(e) })
    return 0
  }
}
