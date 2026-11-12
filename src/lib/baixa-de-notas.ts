import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { registrarAuditoria } from "@/lib/auditoria"
import { EVENTO_NOTA } from "@/lib/status"
import { whereVideomakerPedeNota } from "@/lib/videomaker-pede-nota"

// Baixa nas notas (Giovani, 12/11/2026): "o Gabriel emite nota por mês…
// talvez a pessoa mandou pelo WhatsApp, eu já subi isso para compra… então eu
// tenho como dar uma baixa". Serve principalmente para as gravações antigas,
// resolvidas por fora do NuFlow.
//
// Dar baixa = a nota fica PAGA (com quem e quando), de qualquer estado
// (pendente, enviada, cadastrada, a refazer). É só gerenciamento: NÃO avisa
// ninguém — nem WhatsApp, nem e-mail, nem sino ("isso pode ser só um
// gerenciamento para a gente"). Os botões "Cadastrada" e "Paga" continuam
// avisando o videomaker.
//
// Sem lançamento do videomaker na gravação, nasce um (valor a confirmar, como
// o de quando a nota chega) já pago, para a gravação sair da lista de
// pendências. Videomaker interno nunca entra (lib/videomaker-pede-nota.ts).

export const LIMITE_DA_BAIXA = 200

type Ator = { organizacaoId: string; usuarioId: string }
export type ResultadoDaBaixa = {
  /** Códigos das que tiveram baixa agora. */
  baixadas: string[]
  /** Códigos das que já estavam pagas (quem pagou não muda). */
  jaPagas: string[]
  recusadas: { codigo: string; motivo: string }[]
  /** As gravações que agora estão pagas (baixadas + já pagas): a tela tira da seleção só estas. */
  resolvidas: string[]
}

export async function darBaixaNasNotas(ator: Ator, demandaIds: string[]): Promise<ResultadoDaBaixa> {
  const r: ResultadoDaBaixa = { baixadas: [], jaPagas: [], recusadas: [], resolvidas: [] }
  for (const demandaId of [...new Set(demandaIds)]) {
    // Uma transação por gravação: uma que não passa não desfaz as outras.
    const s = await comOrg(ator.organizacaoId, () => prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM demandas WHERE id=${demandaId} AND "organizacaoId"=${ator.organizacaoId} FOR UPDATE`
      const d = await tx.demanda.findFirst({
        where: { id: demandaId, organizacaoId: ator.organizacaoId, videomakerId: { not: null }, videomaker: whereVideomakerPedeNota(ator.organizacaoId) },
        select: { id: true, codigo: true, statusInterno: true, videomakerId: true, finalizadaEm: true, dataCaptacao: true, dataEvento: true },
      })
      if (!d?.videomakerId) return { estado: "recusada" as const, codigo: demandaId, motivo: "Gravação não encontrada ou sem videomaker externo." }
      const custos = await tx.custoVideomaker.findMany({ where: { organizacaoId: ator.organizacaoId, demandaId: d.id, videomakerId: d.videomakerId }, take: 2 })
      if (custos.length > 1) return { estado: "recusada" as const, codigo: d.codigo, motivo: "Há vários lançamentos nesta gravação. Resolva em Custos." }
      const [c] = custos
      if (c && (c.pago || c.statusPagamento === "pago")) return { estado: "jaPaga" as const, codigo: d.codigo, id: d.id }

      const agora = new Date()
      const pago = {
        statusPagamento: "pago" as const, pago: true, dataPagamento: agora, pagoPorId: ator.usuarioId,
        cadastradoPagamentoEm: c?.cadastradoPagamentoEm ?? agora, cadastradoPagamentoPorId: c?.cadastradoPagamentoPorId ?? ator.usuarioId,
      }
      // Condicional: o botão "Paga" pode confirmar o pagamento entre a leitura
      // acima e esta gravação (ele não trava o card). Só grava se ainda não
      // está paga; se já está, quem pagou não muda (revisão do #148).
      if (c) {
        const n = await tx.custoVideomaker.updateMany({
          where: { id: c.id, organizacaoId: ator.organizacaoId, pago: false, statusPagamento: { not: "pago" } }, data: pago,
        })
        if (n.count === 0) return { estado: "jaPaga" as const, codigo: d.codigo, id: d.id }
      }
      const custo = c
        ? c
        : await tx.custoVideomaker.create({ data: {
            organizacaoId: ator.organizacaoId, demandaId: d.id, videomakerId: d.videomakerId, fatoOrigem: `baixa:${d.id}:${d.videomakerId}`,
            tipo: "projeto", valor: 0, valorConfirmadoEm: null, descricao: `Valor a confirmar — ${d.codigo} (baixa na nota)`,
            dataReferencia: d.finalizadaEm ?? d.dataCaptacao ?? d.dataEvento ?? agora, ...pago,
          } })
      await tx.alertaIA.updateMany({
        where: { organizacaoId: ator.organizacaoId, demandaId: d.id, status: "ativo", tipoAlerta: { in: ["pagamento_pendente", "nf_recebida"] } },
        data: { status: "resolvido", resolvedAt: agora },
      })
      await tx.historicoStatus.create({ data: {
        demandaId: d.id, statusAnterior: d.statusInterno, statusNovo: EVENTO_NOTA, usuarioId: ator.usuarioId, origem: "manual",
        observacao: "Baixa na nota: resolvida por fora, sem aviso ao videomaker",
      } })
      await registrarAuditoria(tx, ator, {
        acao: "manutencao.custos", recurso: "custo", recursoId: custo.id, correlationId: randomUUID(),
        depois: { operacao: c ? "editar" : "criar", alterados: 1, decisao: "finalizado" },
      })
      return { estado: "baixada" as const, codigo: d.codigo, id: d.id }
    }))
    if (s.estado === "recusada") { r.recusadas.push({ codigo: s.codigo, motivo: s.motivo }); continue }
    if (s.estado === "baixada") r.baixadas.push(s.codigo)
    else r.jaPagas.push(s.codigo)
    r.resolvidas.push(s.id)
  }
  return r
}
