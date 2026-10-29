import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { registrarAuditoria } from "@/lib/auditoria"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { marcadorConclusao } from "@/lib/job-transicoes"
import { foiAprovada } from "@/lib/job-fase"
import { whereDoQuadro } from "@/lib/quadro-do-card-server"
import { etapaDaGravacao, perguntaCobranca } from "@/lib/etapas-da-gravacao"
import { dadosDaGravacao, enfileirarAvisos } from "@/lib/avisos-gravacao"
import { mensagensDoCancelamento } from "@/lib/avisos-gravacao-textos"

// Cancelar a gravação (Giovani, 29/10/2026). A empresa executa o que já foi
// contratado, mas o cliente pode cancelar — chuva, doutora indisponível.
//
//   - Antes de o videomaker confirmar: só encerra, não houve contratação. O
//     convite pendente deixa de valer, e o convidado é avisado.
//   - Videomaker confirmado, material ainda não chegou: pergunta se ele cobra
//     pelo cancelamento (uns cobram a agenda separada, outros não). Cobra: nasce
//     o pedido da nota e ele recebe no WhatsApp o link para mandar a nota da
//     taxa; daí é o caminho de sempre (falta a nota → compras → paga). Não
//     cobra: só o aviso, para liberar a agenda.
//   - Material já chegou: o trabalho foi feito, e a nota já foi pedida.
//
// A gravação vai para Concluído como encerrada, com o motivo no histórico.

type Tx = Prisma.TransactionClient

export class CancelamentoInvalido extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

export async function cancelarGravacao(tx: Tx, e: {
  organizacaoId: string
  usuarioId: string
  demandaId: string
  motivo: string
  /** O videomaker cobra pelo cancelamento. Obrigatório quando perguntaCobranca. */
  cobra?: boolean
}): Promise<{ mensagem: string; avisos: number }> {
  const motivo = e.motivo.trim()
  if (motivo.length < 3) throw new CancelamentoInvalido("Diga o motivo do cancelamento.", 400)
  if (motivo.length > 300) throw new CancelamentoInvalido("O motivo passa de 300 caracteres.", 400)

  await tx.$queryRaw`SELECT id FROM demandas WHERE id=${e.demandaId} AND "organizacaoId"=${e.organizacaoId} FOR UPDATE`
  // Só gravação externa: a mesma regra do quadro (lib/quadro-do-card.ts).
  const d = await tx.demanda.findFirst({ where: { id: e.demandaId, organizacaoId: e.organizacaoId, AND: [whereDoQuadro("jobs", e.organizacaoId)] } })
  if (!d) throw new CancelamentoInvalido("Gravação não encontrada.", 404)
  if (!foiAprovada(d)) throw new CancelamentoInvalido("O pedido ainda está em aprovação: recuse em Aprovações.")
  const etapa = etapaDaGravacao(d)
  if (etapa === "concluido") throw new CancelamentoInvalido("Esta gravação já foi concluída.")

  const pergunta = perguntaCobranca(d)
  if (pergunta && e.cobra === undefined) throw new CancelamentoInvalido("Diga se o videomaker vai cobrar pelo cancelamento.", 400)
  const cobra = pergunta && e.cobra === true
  // Quem separou a agenda fica sabendo: o convidado (convite sem resposta) e o
  // confirmado. Quem recusou, não.
  const avisaVideomaker = !!d.videomakerId && d.statusInterno !== "videomaker_recusou"

  const visivel = STATUS_PARA_COLUNA.encerrado
  await tx.demanda.update({
    where: { id: d.id, organizacaoId: e.organizacaoId },
    data: { statusInterno: "encerrado", statusVisivel: visivel, ...marcadorConclusao(d, visivel) },
  })
  await tx.historicoStatus.create({
    data: {
      demandaId: d.id, statusAnterior: d.statusInterno, statusNovo: "encerrado", usuarioId: e.usuarioId, origem: "manual",
      observacao: `Gravação cancelada: ${motivo}${pergunta ? (cobra ? " · o videomaker cobra o cancelamento" : " · o videomaker não cobra") : ""}`,
    },
  })
  // O convite sem resposta deixa de valer: não se aceita gravação cancelada.
  await tx.conviteVideomaker.updateMany({ where: { demandaId: d.id, status: "pendente" }, data: { status: "expirado" } })

  let linkNota: string | null = null
  if (cobra && d.videomakerId) {
    const nf = await tx.notaFiscalUpload.findFirst({ where: { demandaId: d.id, videomakerId: d.videomakerId } })
      ?? await tx.notaFiscalUpload.create({ data: { demandaId: d.id, videomakerId: d.videomakerId } })
    const base = process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") || "https://nuflow.space"
    linkNota = `${base}/nf-upload/${encodeURIComponent(nf.token)}`
  }

  await registrarAuditoria(tx, { organizacaoId: e.organizacaoId, usuarioId: e.usuarioId }, {
    acao: "gravacao.cancelar", recurso: "demanda", recursoId: d.id, correlationId: randomUUID(),
    depois: { cobra, avisaVideomaker },
  })

  const g = await dadosDaGravacao(tx, e.organizacaoId, d.id)
  const avisos = g ? await enfileirarAvisos(tx, {
    organizacaoId: e.organizacaoId, gravacao: g, motivo: "cancelada", autorUsuarioId: e.usuarioId,
    mensagens: mensagensDoCancelamento(g, { motivo, avisaVideomaker, linkNota }),
  }) : 0

  return {
    mensagem: cobra ? "Gravação cancelada. O videomaker recebeu o link para mandar a nota."
      : avisaVideomaker ? "Gravação cancelada. O videomaker foi avisado."
      : "Gravação cancelada.",
    avisos,
  }
}
