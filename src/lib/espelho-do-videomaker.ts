// Espelho AUTOMÁTICO do videomaker que trabalha por uma empresa (12/11/2026).
//
// A Contourline escala o Gabriel; no cadastro dele na Contourline está "Empresa
// dele: GH Produção", e as duas empresas têm parceria aceita. Então o card
// aparece sozinho no quadro da GH, que escolhe quem da equipe dela faz. Para a
// Contourline, o responsável continua sendo o Gabriel.
//
// Este arquivo só CRIA ou REATIVA o espelho, e é idempotente: chamar duas vezes
// não faz nada a mais. Tirar o card da GH é do banco — os gatilhos da migration
// 20261120010000 revogam quando o videomaker do card muda ou quando a "Empresa
// dele" muda, e ao revogar apagam o executor e avisam a GH.
//
// Quais cards: os ABERTOS (não finalizados). Os concluídos ficam só na dona.
import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { emSegundoPlano } from "@/lib/notificar"
import { getWhatsappConfig, sendWhatsappMessage } from "@/lib/whatsapp"
import { EVENTO_ESPELHO_CONCEDIDO } from "@/lib/status"

type Db = Prisma.TransactionClient | PrismaClient

/** Quem cria o espelho automático: o sistema, não uma pessoa. Sem FK (como nos outros "PorId"). */
export const AUTOR_ESPELHO_AUTOMATICO = "sistema:empresa-do-videomaker"

/** Parceria aceita e não encerrada entre as duas, em qualquer sentido. */
export async function temParceriaAceita(db: Db, a: string, b: string): Promise<boolean> {
  const n = await db.parceriaOrganizacao.count({
    where: {
      status: "aceita",
      encerradaEm: null,
      OR: [
        { organizacaoConvidanteId: a, organizacaoConvidadaId: b },
        { organizacaoConvidanteId: b, organizacaoConvidadaId: a },
      ],
    },
  })
  return n > 0
}

export type EspelhoGarantido = { demandaId: string; destinoId: string; novo: boolean }

/**
 * Garante que o card esteja na "Empresa dele" do videomaker escalado.
 *
 * Devolve `null` quando não há o que fazer: sem videomaker, card finalizado,
 * sem "Empresa dele", sem parceria aceita, ou já espelhado. `novo` diz se o card
 * acabou de chegar lá (e por isso a GH foi avisada).
 */
export async function garantirEspelhoDoVideomaker(
  demandaId: string,
  opcoes: { db?: Db; avisar?: boolean } = {}
): Promise<EspelhoGarantido | null> {
  const db = opcoes.db ?? prisma
  const d = await db.demanda.findUnique({
    where: { id: demandaId },
    select: { id: true, organizacaoId: true, videomakerId: true, statusVisivel: true, codigo: true, titulo: true },
  })
  if (!d?.videomakerId || d.statusVisivel === "finalizado") return null

  const vinculo = await db.videomakerOrganizacao.findUnique({
    where: { organizacaoId_videomakerId: { organizacaoId: d.organizacaoId, videomakerId: d.videomakerId } },
    select: { organizacaoExecutoraId: true, videomaker: { select: { nome: true } } },
  })
  const destinoId = vinculo?.organizacaoExecutoraId
  if (!destinoId) return null
  if (!(await temParceriaAceita(db, d.organizacaoId, destinoId))) return null

  const existente = await db.demandaCompartilhamento.findUnique({
    where: { demandaId_organizacaoDestinoId: { demandaId, organizacaoDestinoId: destinoId } },
    select: { id: true, revogadoEm: true },
  })
  // Já está lá (automático ou terceirizado à mão): nada a fazer.
  if (existente && existente.revogadoEm === null) return null

  const aresta = existente
    ? await db.demandaCompartilhamento.update({
        where: { id: existente.id },
        data: {
          revogadoEm: null, revogadoPorId: null, escopo: "executar", porVideomakerId: d.videomakerId,
          criadoEm: new Date(), criadoPorId: AUTOR_ESPELHO_AUTOMATICO,
        },
        select: { nomeDestino: true },
      })
    : await db.demandaCompartilhamento.create({
        data: {
          demandaId, organizacaoDestinoId: destinoId, escopo: "executar", porVideomakerId: d.videomakerId,
          // Origem e rótulos são derivados pelo gatilho.
          organizacaoOrigemId: d.organizacaoId, nomeOrigem: "", nomeDestino: "",
          criadoPorId: AUTOR_ESPELHO_AUTOMATICO,
        },
        select: { nomeDestino: true },
      })

  await db.historicoStatus.create({
    data: {
      demandaId, statusNovo: EVENTO_ESPELHO_CONCEDIDO, usuarioId: null, origem: "automacao",
      observacao: `${vinculo?.videomaker.nome ?? "O videomaker"} faz esta gravação pela ${aresta.nomeDestino}: o card aparece lá.`,
    },
  })

  if (opcoes.avisar !== false) {
    emSegundoPlano(() => avisarChegadaNaEmpresaDele({ demandaId, codigo: d.codigo, titulo: d.titulo, destinoId }), "aviso-espelho-chegou")
  }
  return { demandaId, destinoId, novo: true }
}

/**
 * O backfill: espelha os cards ABERTOS da dona escalados para este videomaker.
 * Chamado quando a "Empresa dele" é gravada com parceria já aceita, e quando a
 * parceria é aceita. Os concluídos ficam só na dona.
 */
export async function espelharGravacoesAbertas(donaId: string, videomakerId: string, opcoes: { avisar?: boolean } = {}): Promise<EspelhoGarantido[]> {
  const abertos = await prisma.demanda.findMany({
    where: { organizacaoId: donaId, videomakerId, statusVisivel: { not: "finalizado" } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  })
  const feitos: EspelhoGarantido[] = []
  for (const { id } of abertos) {
    const r = await garantirEspelhoDoVideomaker(id, { avisar: opcoes.avisar })
    if (r) feitos.push(r)
  }
  return feitos
}

/** Depois que a parceria entre as duas é aceita: todo videomaker de uma com "Empresa dele" na outra. */
export async function espelharPelaParceria(a: string, b: string): Promise<number> {
  const vinculos = await prisma.videomakerOrganizacao.findMany({
    where: {
      OR: [
        { organizacaoId: a, organizacaoExecutoraId: b },
        { organizacaoId: b, organizacaoExecutoraId: a },
      ],
    },
    select: { organizacaoId: true, videomakerId: true },
  })
  let n = 0
  for (const v of vinculos) n += (await espelharGravacoesAbertas(v.organizacaoId, v.videomakerId)).length
  return n
}

/**
 * Avisa a gestão da empresa dele que chegou uma gravação: o sino de cada admin
 * e gestor e, só se o WhatsApp DELA estiver conectado (QR lido), a mensagem.
 * Sem QR nada é enfileirado — o envio não pode sair pelo número de outra empresa.
 */
export async function avisarChegadaNaEmpresaDele(a: { demandaId: string; codigo: string; titulo: string; destinoId: string }): Promise<void> {
  await comOrg(a.destinoId, async () => {
    const gestao = await prisma.usuarioOrganizacao.findMany({
      where: { organizacaoId: a.destinoId, papel: { in: ["admin", "gestor"] }, usuario: { status: "ativo" } },
      select: { usuarioId: true, usuario: { select: { telefone: true } } },
    })
    const mensagem = `Chegou a gravação ${a.codigo} — ${a.titulo}. Escolha quem da equipe vai fazer.`
    for (const g of gestao) {
      await prisma.alertaIA.create({
        data: {
          organizacaoId: a.destinoId, demandaId: a.demandaId, usuarioId: g.usuarioId,
          tipoAlerta: "espelho_chegou", mensagem, severidade: "aviso", acaoSugerida: "Escolher quem vai fazer",
        },
      })
    }
    if (!(await whatsappConectado(a.destinoId))) return
    const base = process.env.NEXTAUTH_URL || "https://nuflow.space"
    for (const g of gestao) {
      if (g.usuario.telefone) {
        await sendWhatsappMessage(g.usuario.telefone, `📋 *NuFlow* — ${mensagem}\n${base}/jobs?abrir=${a.demandaId}`, a.demandaId, a.destinoId)
      }
    }
  })
}

/** O WhatsApp da empresa está conectado (QR lido)? `ativo` só fica true com a conexão "open". */
export async function whatsappConectado(organizacaoId: string): Promise<boolean> {
  return !!(await getWhatsappConfig(organizacaoId))
}
