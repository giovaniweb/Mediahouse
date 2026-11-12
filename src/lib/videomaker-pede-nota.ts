import type { Prisma } from "@prisma/client"
import { CONTRATO_INTERNO, contratoEfetivo } from "@/lib/quadro-do-card"

// Só o videomaker EXTERNO manda nota fiscal (Giovani, 12/11/2026: "eu como
// videomaker interno não tenho que receber ou enviar notas, somente os
// videomakers externos precisam disso").
//
// Interno ou externo é o contrato efetivo nesta empresa — o vínculo
// (videomaker_organizacao.tipoContrato) e, sem vínculo, o cadastro global —, a
// mesma régua que decide se o card mora em Jobs ou em Demandas
// (lib/quadro-do-card.ts). Vale para: pedido de nota, link /nf-upload, receber
// a nota, custo "aguardando nota", cobrança de nota, avisos da nota ao
// videomaker e a página Notas fiscais.

type Tx = Pick<Prisma.TransactionClient, "videomaker">

/** Este videomaker manda nota fiscal nesta empresa? (externo: sim; interno: nunca) */
export async function videomakerPedeNota(tx: Tx, organizacaoId: string, videomakerId: string | null | undefined): Promise<boolean> {
  if (!videomakerId) return false
  const v = await tx.videomaker.findUnique({
    where: { id: videomakerId },
    select: { tipoContrato: true, vinculos: { where: { organizacaoId }, select: { tipoContrato: true }, take: 1 } },
  })
  if (!v) return false
  return contratoEfetivo(v.vinculos[0]?.tipoContrato, v.tipoContrato) !== CONTRATO_INTERNO
}

/** O filtro de consulta: videomaker que manda nota (não interno nesta empresa). */
export function whereVideomakerPedeNota(organizacaoId: string): Prisma.VideomakerWhereInput {
  return {
    NOT: {
      OR: [
        { vinculos: { some: { organizacaoId, tipoContrato: CONTRATO_INTERNO } } },
        { tipoContrato: CONTRATO_INTERNO, vinculos: { none: { organizacaoId } } },
      ],
    },
  }
}
