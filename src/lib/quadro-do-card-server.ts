// A regra de quadro-do-card.ts em forma de consulta, para /api/demandas filtrar
// no banco (a lista é paginada; filtrar depois no navegador quebraria a conta).
//
// Mantenha as duas em sincronia: tests/integration/quadro-do-card.spec.ts
// compara a consulta com a função pura, card a card.
//
// O contrato é lido na empresa ATIVA de quem vê o quadro. Para os cards da
// própria empresa é o vínculo de quem escalou. No card executado por
// espelhamento quem escala o videomaker é a executora, que vê o próprio vínculo;
// a dona, sem vínculo com aquele profissional, cai no contrato do cadastro.
import type { Prisma } from "@prisma/client"
import { DEPARTAMENTO_COBERTURA, TIPO_COBERTURA } from "./job-fase"
import { CONTRATO_INTERNO, type QuadroDoCard } from "./quadro-do-card"

export function whereDoQuadro(quadro: QuadroDoCard, organizacaoId: string): Prisma.DemandaWhereInput {
  // Videomaker interno NESTA empresa: o vínculo diz interno, ou não há vínculo
  // e o cadastro global diz interno.
  const interno: Prisma.VideomakerWhereInput = {
    OR: [
      { vinculos: { some: { organizacaoId, tipoContrato: CONTRATO_INTERNO } } },
      { tipoContrato: CONTRATO_INTERNO, vinculos: { none: { organizacaoId } } },
    ],
  }
  const jobs: Prisma.DemandaWhereInput = {
    OR: [
      { videomakerId: { not: null }, NOT: { videomaker: interno } },
      { videomakerId: null, OR: [{ tipoVideo: TIPO_COBERTURA }, { departamento: DEPARTAMENTO_COBERTURA }] },
    ],
  }
  return quadro === "jobs" ? jobs : { NOT: jobs }
}

/** O contrato efetivo do videomaker escalado, para o detalhe saber em que quadro o card mora. */
export function selectContrato(organizacaoId: string) {
  return {
    tipoContrato: true,
    vinculos: { where: { organizacaoId }, select: { tipoContrato: true }, take: 1 },
  } satisfies Prisma.VideomakerSelect
}
