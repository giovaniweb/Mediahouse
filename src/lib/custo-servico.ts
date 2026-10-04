import { randomUUID } from "node:crypto"
import type { PrismaClient } from "@prisma/client"
import { comOrg } from "@/lib/org-contexto"
import { registrarAuditoria } from "@/lib/auditoria"

/** Fato de conclusão não comprova quantidade de diárias nem total contratado.
 * Cria pendência rastreável, sem converter diária atual em preço do serviço.
 * Parcelas/diárias manuais continuam fatos separados e não são deduplicadas aqui.
 */
export async function registrarServicoPendente(db: PrismaClient, organizacaoId: string, demandaId: string, videomakerId: string) {
  return comOrg(organizacaoId, () => db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM demandas WHERE id=${demandaId} AND "organizacaoId"=${organizacaoId} FOR UPDATE`
    const d = await tx.demanda.findFirst({where:{id:demandaId,organizacaoId,videomakerId,statusVisivel:"finalizado"}})
    if(!d) return null
    const fatoOrigem=`conclusao:${demandaId}:${videomakerId}`
    const anterior=await tx.custoVideomaker.findFirst({where:{organizacaoId,demandaId,videomakerId}})
    if(anterior) return anterior
    const custo=await tx.custoVideomaker.create({data:{organizacaoId,demandaId,videomakerId,fatoOrigem,
      tipo:"projeto",valor:0,valorConfirmadoEm:null,pago:false,statusPagamento:"pendente_nf",
      descricao:`Valor a confirmar — ${d.codigo}: ${d.titulo}`,dataReferencia:d.finalizadaEm ?? new Date()}})
    await registrarAuditoria(tx,{organizacaoId,tecnico:"conclusao.servico"},{acao:"manutencao.custos",recurso:"custo_videomaker",recursoId:custo.id,correlationId:randomUUID(),depois:{operacao:"criar",alterados:1}})
    return custo
  }))
}
