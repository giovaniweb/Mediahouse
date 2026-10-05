import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import type { Prisma, Prioridade, StatusInterno } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"
import { comOrg } from "@/lib/org-contexto"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { registrarAuditoria } from "@/lib/auditoria"
import { resolverAlertas } from "@/lib/alertas"
import { emSegundoPlano } from "@/lib/notificar"
import { STATUS_PARA_COLUNA, EVENTO_EDICAO } from "@/lib/status"
import { marcadorConclusao } from "@/lib/job-transicoes"
import { AGUARDANDO_APROVACAO, TIPO_COBERTURA, conversaoDeFluxo, fluxoAtual } from "@/lib/job-fase"

// "Transferir para Demandas (audiovisual)" — o caminho de volta de um card que
// caiu em Jobs por engano.
//
// Job é só entrega externa: captação feita por videomaker de fora. Quem cria o
// card escolhendo "cobertura" sem ser cobertura manda o pedido para a esteira
// errada. Transferir é o MESMO registro trocando de quadro, como a conversão de
// ida (`/api/jobs/[id]/converter`): id, briefing, arquivos, comentários e
// histórico ficam onde estão.
//
// O que a conversão antiga não fazia, e esta faz:
//   1. leva o card ao INÍCIO do fluxo de Demandas, em vez de deixá-lo numa
//      etapa da escala do videomaker que não diz nada no outro quadro;
//   2. recusa quando o Job já é de verdade — alguém de fora aceitou, ou já há
//      custo lançado. Desfazer isso calado deixaria um profissional confirmado
//      e uma conta a pagar presos a uma demanda interna;
//   3. cancela os convites ainda pendentes, para ninguém aceitar um card que
//      saiu da fila dele;
//   4. só admin e gestor podem (decidir de qual esteira é o card é gestão);
//   5. grava histórico E auditoria na mesma transação da troca.
//
// Nenhuma coluna nova: a classificação, os convites e os custos já existem.

type Tx = Prisma.TransactionClient

/** Decidir de qual esteira o card é: gestão, não execução. */
export const PAPEIS_QUE_TRANSFEREM = ["admin", "gestor"] as const
export function podeTransferir(papel: string | null | undefined): boolean {
  return PAPEIS_QUE_TRANSFEREM.includes(String(papel ?? "").toLowerCase() as (typeof PAPEIS_QUE_TRANSFEREM)[number])
}

export class TransferenciaInvalida extends Error {
  constructor(message: string, public status = 409, public extra: Record<string, unknown> = {}) {
    super(message)
  }
}

export type Impedimento = {
  codigo: "videomaker_escalado" | "convite_aceito" | "custo_lancado" | "etapa_avancada"
  mensagem: string
}

/** Ainda no portão de aprovação: transferir não pula a aprovação. */
const NO_PORTAO: StatusInterno[] = ["pedido_criado", ...AGUARDANDO_APROVACAO]

/**
 * Aprovado, mas antes de alguém de fora começar a captar: triagem, urgência,
 * planejamento e a escala do videomaker (convite enviado ou recusado). É aqui
 * que o card errado costuma ser notado.
 */
const ANTES_DA_CAPTACAO: StatusInterno[] = [
  "aguardando_triagem",
  "urgencia_aprovada",
  "planejamento",
  "videomaker_notificado",
  "videomaker_recusou",
]

/**
 * Para onde o status vai — ou `null` quando a etapa já é de execução.
 *
 * O início do quadro de Demandas é o mesmo que a aprovação usa
 * (`/api/demandas/[id]/aprovar`): `aguardando_triagem`, ou `urgencia_aprovada`
 * para urgente. Quem ainda espera aprovação continua esperando — e a recusa
 * (`encerrado` na coluna de entrada, ver `foiAprovada`) continua recusa.
 */
export function statusAoTransferir(d: {
  statusInterno: StatusInterno
  statusVisivel?: string | null
  prioridade?: Prioridade | string | null
}): StatusInterno | null {
  if (NO_PORTAO.includes(d.statusInterno)) return d.statusInterno
  if (d.statusInterno === "encerrado" && d.statusVisivel === "entrada") return d.statusInterno
  if (!ANTES_DA_CAPTACAO.includes(d.statusInterno)) return null
  const urgente = d.statusInterno === "urgencia_aprovada" || d.prioridade === "urgente"
  return urgente ? "urgencia_aprovada" : "aguardando_triagem"
}

/** O que impede a transferência. Lista vazia = pode. */
export function impedimentosDaTransferencia(
  d: {
    statusInterno: StatusInterno
    statusVisivel?: string | null
    prioridade?: Prioridade | string | null
    videomakerId?: string | null
  },
  c: { convitesAceitos: number; custos: number }
): Impedimento[] {
  const lista: Impedimento[] = []
  if (d.videomakerId) {
    lista.push({
      codigo: "videomaker_escalado",
      mensagem: "Há videomaker escalado neste Job. Tire o videomaker antes de transferir.",
    })
  }
  if (c.convitesAceitos > 0) {
    lista.push({
      codigo: "convite_aceito",
      mensagem: "Um videomaker já aceitou o convite deste Job.",
    })
  }
  if (c.custos > 0) {
    lista.push({
      codigo: "custo_lancado",
      mensagem: "Há custo lançado para este Job. Resolva o custo em Custos antes de transferir.",
    })
  }
  if (statusAoTransferir(d) === null) {
    lista.push({
      codigo: "etapa_avancada",
      mensagem: "Este Job já passou da escala do videomaker. A transferência só vale até essa etapa.",
    })
  }
  return lista
}

export type AvaliacaoDaTransferencia = {
  jaEstava: boolean
  impedimentos: Impedimento[]
  convitesPendentes: number
  statusAtual: StatusInterno
  statusDestino: StatusInterno | null
}

async function lerSituacao(tx: Tx, organizacaoId: string, demandaId: string) {
  const demanda = await tx.demanda.findFirst({
    where: { id: demandaId, organizacaoId },
    select: {
      id: true, codigo: true, area: true, statusInterno: true, statusVisivel: true, prioridade: true,
      departamento: true, tipoVideo: true, videomakerId: true, finalizadaEm: true,
    },
  })
  if (!demanda) throw new TransferenciaInvalida("Não encontrado", 404)
  const agora = new Date()
  const [convitesAceitos, convitesPendentes, custos] = await Promise.all([
    tx.conviteVideomaker.count({ where: { demandaId, status: "aceito" } }),
    tx.conviteVideomaker.count({ where: { demandaId, status: "pendente", expiresAt: { gt: agora } } }),
    tx.custoVideomaker.count({ where: { demandaId, organizacaoId } }),
  ])
  return { demanda, convitesAceitos, convitesPendentes, custos }
}

/** Prévia para a tela: o que vai acontecer, ou o que impede. Não grava nada. */
export async function avaliarTransferencia(tx: Tx, organizacaoId: string, demandaId: string): Promise<AvaliacaoDaTransferencia> {
  const s = await lerSituacao(tx, organizacaoId, demandaId)
  const jaEstava = fluxoAtual(s.demanda) === "demanda"
  return {
    jaEstava,
    impedimentos: jaEstava ? [] : impedimentosDaTransferencia(s.demanda, s),
    convitesPendentes: s.convitesPendentes,
    statusAtual: s.demanda.statusInterno,
    statusDestino: statusAoTransferir(s.demanda),
  }
}

export type ResultadoDaTransferencia = {
  jaEstava: boolean
  statusInterno: StatusInterno
  statusVisivel: string
  departamento: string | null
  tipoVideo: string | null
  convitesCancelados: number
}

/**
 * Executa a transferência dentro do `tx` do chamador. Lança
 * `TransferenciaInvalida` (com o status HTTP) quando não pode.
 *
 * A linha da demanda é travada antes de ler: um convite aceito no mesmo
 * instante disputa a mesma trava (`lib/convites.ts`), então ou o aceite vem
 * antes e a transferência é recusada, ou a transferência vem antes e o convite
 * chega cancelado.
 */
export async function transferirParaDemandas(
  tx: Tx,
  ator: { organizacaoId: string; usuarioId: string },
  demandaId: string,
  opcoes: { tipoVideo?: string | null } = {}
): Promise<ResultadoDaTransferencia> {
  await tx.$queryRaw`SELECT id FROM demandas WHERE id=${demandaId} AND "organizacaoId"=${ator.organizacaoId} FOR UPDATE`
  const { demanda, convitesAceitos, custos } = await lerSituacao(tx, ator.organizacaoId, demandaId)

  // Já é Demanda: sucesso sem gravar (clique duplo, duas abas). Converter duas
  // vezes não pode fazer efeito duas vezes.
  if (fluxoAtual(demanda) === "demanda") {
    return {
      jaEstava: true, statusInterno: demanda.statusInterno, statusVisivel: demanda.statusVisivel,
      departamento: demanda.departamento, tipoVideo: demanda.tipoVideo, convitesCancelados: 0,
    }
  }

  const impedimentos = impedimentosDaTransferencia(demanda, { convitesAceitos, custos })
  if (impedimentos.length > 0) {
    throw new TransferenciaInvalida(impedimentos.map((i) => i.mensagem).join(" "), 409, { impedimentos })
  }

  // Escolher "cobertura" como tipo de destino não faz sentido: cai no neutro.
  const tipoVideo = opcoes.tipoVideo === TIPO_COBERTURA ? null : opcoes.tipoVideo
  const mudanca = conversaoDeFluxo(demanda, "demanda", { departamento: null, tipoVideo })!
  const statusNovo = statusAoTransferir(demanda)!
  const statusVisivelNovo = STATUS_PARA_COLUNA[statusNovo]
  const mudouStatus = statusNovo !== demanda.statusInterno

  const cancelados = await tx.conviteVideomaker.updateMany({
    where: { demandaId, status: "pendente" },
    // "expirado" e não um estado novo: é o que a página pública do convite já
    // sabe explicar ao videomaker ("fale com a equipe").
    data: { status: "expirado", respondidoEm: new Date() },
  })

  const atualizada = await tx.demanda.update({
    where: { id: demandaId, organizacaoId: ator.organizacaoId },
    data: {
      ...mudanca,
      statusInterno: statusNovo,
      statusVisivel: statusVisivelNovo,
      ...marcadorConclusao(demanda, statusVisivelNovo),
    },
  })

  const de = `${demanda.departamento ?? "—"} / ${demanda.tipoVideo ?? "—"}`
  const partes = [`Transferido de Jobs para Demandas (audiovisual) — antes: ${de}`]
  if (mudouStatus) partes.push(`voltou ao início do quadro de Demandas`)
  if (cancelados.count > 0) partes.push(`${cancelados.count} convite(s) pendente(s) cancelado(s)`)

  await tx.historicoStatus.create({
    data: {
      demandaId,
      statusAnterior: demanda.statusInterno,
      // Se a etapa mudou, a linha é uma transição de verdade — as métricas de
      // tempo por etapa leem `statusNovo`. Se não mudou, é edição de campo.
      statusNovo: mudouStatus ? statusNovo : EVENTO_EDICAO,
      usuarioId: ator.usuarioId,
      origem: "manual",
      observacao: partes.join("; "),
    },
  })

  await registrarAuditoria(tx, ator, {
    acao: "demanda.transferir",
    recurso: "demanda",
    recursoId: demandaId,
    correlationId: randomUUID(),
    antes: { campos: ["departamento", "tipoVideo", "status"] },
    depois: { operacao: "editar", alterados: cancelados.count },
  })

  return {
    jaEstava: false,
    statusInterno: atualizada.statusInterno,
    statusVisivel: atualizada.statusVisivel,
    departamento: atualizada.departamento,
    tipoVideo: atualizada.tipoVideo,
    convitesCancelados: cancelados.count,
  }
}

type Sessao = { user: { id: string; organizacaoId?: string | null } }

/**
 * A rota inteira, compartilhada por `/api/jobs/[id]/transferir` e pelo ramo
 * `para: "demanda"` de `/api/jobs/[id]/converter` — dois caminhos com a mesma
 * regra, para a conversão antiga não virar atalho que pula o bloqueio.
 */
export async function responderTransferencia(
  session: Sessao,
  demandaId: string,
  body: { confirmar?: unknown; tipoVideo?: unknown }
): Promise<NextResponse> {
  const guard = await requireDemandaOrg(session, demandaId)
  if (guard instanceof NextResponse) return guard
  const { organizacaoId } = guard

  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  // Fail-closed, como a guarda de transição.
  if (!vinculo) {
    return NextResponse.json({ error: "Não foi possível determinar suas permissões nesta empresa." }, { status: 403 })
  }
  if (!podeTransferir(vinculo.papel)) {
    return NextResponse.json({ error: "Só admin ou gestor pode transferir um Job para Demandas." }, { status: 403 })
  }
  // A tela sempre pergunta antes; a rota não aceita o clique sem a resposta.
  if (body.confirmar !== true) {
    return NextResponse.json({ error: "Confirme a transferência." }, { status: 400 })
  }
  const tipoVideo = typeof body.tipoVideo === "string" ? body.tipoVideo.slice(0, 80) : null

  try {
    const r = await comOrg(organizacaoId, () =>
      prisma.$transaction((tx) => transferirParaDemandas(tx, { organizacaoId, usuarioId: session.user.id }, demandaId, { tipoVideo }))
    )
    // A etapa mudou: alerta de prazo ou de escala do Job antigo deixa de valer.
    if (!r.jaEstava) {
      emSegundoPlano(() => comOrg(organizacaoId, () => resolverAlertas(organizacaoId, demandaId)), "resolver-alertas")
    }
    return NextResponse.json({ fluxo: "demanda", ...r })
  } catch (e) {
    if (e instanceof TransferenciaInvalida) {
      return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status })
    }
    throw e
  }
}
