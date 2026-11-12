// Página "Notas fiscais" (Giovani, 12/11/2026): "ter uma página com checklist
// dos videomakers que já enviaram a nota fiscal; hoje eu não sei quem enviou a
// nota fiscal e se foi cadastrada no sistema para pagamento".
//
// Uma linha por gravação externa com videomaker que já passou do agendado
// (material entregue ou concluída). O estado sai do que já existe — custo do
// videomaker (statusPagamento, pago) e o pedido de nota (notas_fiscais) — pela
// mesma régua da ficha (situacaoDaNota), mais o "cadastrada para pagamento".
//
// "sem_pedido": gravação concluída em que a nota nunca foi pedida (as 40
// importadas da planilha em 04/11 são assim). Fica fora da lista por padrão,
// mas conta no retrato, para ninguém achar que sumiu.
import { situacaoDaNota } from "@/lib/etapas-da-gravacao"

export type EstadoNoPainel = "pendente" | "enviada" | "cadastrada" | "paga" | "sem_pedido"

export const ROTULO_NO_PAINEL: Record<EstadoNoPainel, string> = {
  pendente: "Nota pendente",
  enviada: "Nota enviada",
  cadastrada: "Cadastrada para pagamento",
  paga: "Paga",
  sem_pedido: "Sem pedido de nota",
}

export const ORDEM_NO_PAINEL: EstadoNoPainel[] = ["pendente", "enviada", "cadastrada", "paga", "sem_pedido"]

export type GravacaoNoPainel = {
  statusInterno: string
  videomakerId: string | null
  custos: { statusPagamento: string; pago: boolean; cadastradoPagamentoEm: Date | string | null }[]
  notasFiscais: { status: string }[]
}

/** Em que pé está a nota desta gravação, na régua da página. */
export function estadoNoPainel(g: GravacaoNoPainel): EstadoNoPainel {
  const s = situacaoDaNota(g)
  if (!s) return "sem_pedido"
  if (s.etapa === "paga") return "paga"
  if (s.etapa === "falta" || s.etapa === "contestada") return "pendente"
  if (g.custos.some((c) => c.cadastradoPagamentoEm && !c.pago && c.statusPagamento !== "pago")) return "cadastrada"
  return "enviada"
}

/** Quantas em cada estado: o retrato do topo da página. */
export function retratoDasNotas(estados: EstadoNoPainel[]): Record<EstadoNoPainel, number> & { total: number } {
  const r = { pendente: 0, enviada: 0, cadastrada: 0, paga: 0, sem_pedido: 0, total: estados.length }
  for (const e of estados) r[e]++
  return r
}
