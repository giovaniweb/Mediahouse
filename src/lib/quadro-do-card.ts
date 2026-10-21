// Em que quadro um card do audiovisual mora: Jobs ou Demandas. Regra única,
// lida pelos dois quadros e pelo detalhe (07/10/2026).
//
// O pedido do Giovani: "tudo que for card de gravação externa de videomaker vai
// para Job". Job é entrega externa — captação feita por videomaker de fora
// (lib/transferir-para-demandas.ts já dizia isso). Então:
//
//   videomaker escalado, contrato EXTERNO  → Jobs
//   videomaker escalado, contrato INTERNO  → Demandas
//   sem videomaker ainda                   → a marca de cobertura decide
//                                            (tipoVideo = cobertura_evento OU
//                                            departamento = eventos)
//
// O furo que isto fecha: o quadro de Jobs buscava só pelo tipo, e o de Demandas
// escondia tudo com departamento = eventos. Card marcado só pelo departamento
// não aparecia em nenhum dos dois. Agora um é o complemento exato do outro.
//
// O contrato é o da empresa com o profissional (videomaker_organizacao), com o
// do cadastro global como reserva; contrato que não seja "interno" conta como
// externo (o padrão do cadastro é "externo"). Nada é gravado: a regra é só de
// leitura, e nenhum dado de produção muda.
//
// Sem import de runtime do Prisma: este módulo vai para o navegador. A mesma
// regra em forma de consulta está em quadro-do-card-server.ts.
import { ehSolicitacaoDeCobertura } from "./job-fase"

export type QuadroDoCard = "jobs" | "demandas"

export const CONTRATO_INTERNO = "interno"

export function quadroDoCard(card: {
  tipoVideo?: string | null
  departamento?: string | null
  videomakerId?: string | null
  /** Contrato EFETIVO do videomaker escalado nesta empresa. */
  contratoVideomaker?: string | null
}): QuadroDoCard {
  if (card.videomakerId) return card.contratoVideomaker === CONTRATO_INTERNO ? "demandas" : "jobs"
  return ehSolicitacaoDeCobertura(card) ? "jobs" : "demandas"
}

/** O contrato que vale: o da empresa; sem vínculo, o do cadastro global. */
export function contratoEfetivo(vinculoDaEmpresa: string | null | undefined, global: string | null | undefined): string | null {
  return vinculoDaEmpresa ?? global ?? null
}
