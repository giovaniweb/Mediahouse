import { createHash } from "node:crypto"
import type { Demanda, Evento, CustoVideomaker, Prisma } from "@prisma/client"
import { dataCalendario, dataEmSaoPaulo, somarDias } from "@/lib/datas"

export const VERSAO_REGRAS = 1
export const hashRegra = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")
export type RegraDemanda = "prazo_vencido" | "prazo_proximo" | "sem_movimento" | "aprovacao_pendente" | "sem_final" | "captacao"
type DemandaRegra = Pick<Demanda,"statusInterno"|"statusVisivel"|"updatedAt"|"dataLimite"|"area"|"linkFinal"|"dataCaptacao">
export function demandaAberta(d: Pick<Demanda,"statusInterno"|"statusVisivel">) {
  return d.statusVisivel !== "finalizado" && !["encerrado","expirado","videomaker_recusou","postado","entregue_cliente"].includes(d.statusInterno)
}
export function regrasDemanda(d: DemandaRegra, temArquivoFinal: boolean, agora: Date): RegraDemanda[] {
  const regras: RegraDemanda[] = [], aberta = demandaAberta(d), hoje = dataEmSaoPaulo(agora)
  const prazo = d.dataLimite && dataCalendario(d.dataLimite)
  if (aberta && prazo && prazo < hoje) regras.push("prazo_vencido")
  if (aberta && prazo && prazo >= hoje && prazo <= somarDias(hoje,1)) regras.push("prazo_proximo")
  if (aberta && agora.getTime()-d.updatedAt.getTime() >= 3*86400_000) regras.push("sem_movimento")
  if (aberta && ["aguardando_aprovacao_interna","urgencia_pendente_aprovacao"].includes(d.statusInterno)) regras.push("aprovacao_pendente")
  if (d.area === "audiovisual" && d.statusVisivel === "finalizado" && !d.linkFinal?.trim() && !temArquivoFinal) regras.push("sem_final")
  if (aberta && d.dataCaptacao && d.dataCaptacao > agora && d.dataCaptacao.getTime()-agora.getTime() <= 86400_000) regras.push("captacao")
  return regras
}
export const revisaoEvento = (e: Evento) => hashRegra([e.inicio,e.fim,e.lembreteMinutos,e.usuarioId,e.editorId,e.videomakerId,e.status,e.titulo,e.local,e.privado])
export function lembreteVigente(e: Pick<Evento,"inicio"|"lembreteMinutos"|"status">, agora: Date) {
  return ["agendado","confirmado"].includes(e.status) && e.inicio > agora &&
    e.inicio.getTime()-Math.max(0,e.lembreteMinutos)*60000 <= agora.getTime()
}
/** Custo é uma obrigação da empresa com o profissional. Cobrar apenas NF pendente, nunca pagamento do credor. */
export function cobrancaValida(c: Pick<CustoVideomaker,"pago"|"statusPagamento"|"dataVencimento">, agora: Date) {
  return !c.pago && c.statusPagamento === "pendente_nf" && !!c.dataVencimento && dataCalendario(c.dataVencimento)! <= dataEmSaoPaulo(agora)
}
export type ContextoRegra = { tipo: "demanda"|"evento"|"custo"|"gestor"; id: string; revisao: string; regra: string }
export async function contextoRegraValido(tx: Prisma.TransactionClient, org: string, c: ContextoRegra, agora: Date) {
  const empresa = await tx.organizacao.findUnique({where:{id:org},select:{ativo:true,ambienteTeste:true}})
  if (!empresa?.ativo || empresa.ambienteTeste) return false
  if (c.tipo === "demanda") {
    const d = await tx.demanda.findFirst({where:{id:c.id,organizacaoId:org},include:{arquivos:{where:{tipoArquivo:"final"},select:{id:true},take:1}}})
    return !!d && d.updatedAt.toISOString() === c.revisao && regrasDemanda(d,d.arquivos.length>0,agora).includes(c.regra as RegraDemanda)
  }
  if (c.tipo === "evento") {
    const e = await tx.evento.findFirst({where:{id:c.id,organizacaoId:org}})
    return !!e && revisaoEvento(e) === c.revisao && lembreteVigente(e,agora)
  }
  if (c.tipo === "custo") {
    const custo = await tx.custoVideomaker.findFirst({where:{id:c.id,organizacaoId:org}})
    return !!custo && custo.updatedAt.toISOString() === c.revisao && cobrancaValida(custo,agora)
  }
  if (c.tipo === "gestor") {
    const membro = await tx.usuarioOrganizacao.findFirst({where:{organizacaoId:org,usuarioId:c.id,papel:{in:["admin","gestor"]},usuario:{status:"ativo"}}})
    return !!membro && c.revisao === dataEmSaoPaulo(agora)
  }
  return false
}
