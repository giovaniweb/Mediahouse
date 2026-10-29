// "Minhas notas fiscais" do videomaker (Giovani, 29/10/2026): só as gravações
// externas dele em que a nota foi PEDIDA — o material chegou, ou o
// cancelamento foi cobrado — e ainda não foi mandada, ou voltou para refazer.
// Card antigo sem pedido de nota e demanda de outro quadro ficam de fora. Uma
// nota pode cobrir várias gravações: quem tira nota do mês junta tudo de uma vez.
import { situacaoDaNota } from "./etapas-da-gravacao"

export type EstadoDaNotaDoVideomaker = "falta" | "refazer" | "recebida" | "compras" | "paga"

export type GravacaoDaNota = {
  statusInterno: string
  notasFiscais: { status: string }[]
  custos: { statusPagamento: string; pago: boolean }[]
}

/** Em que pé está a nota desta gravação para o videomaker; null = nada a mostrar. */
export function estadoDaNotaDoVideomaker(g: GravacaoDaNota, videomakerId: string): EstadoDaNotaDoVideomaker | null {
  const s = situacaoDaNota({ ...g, videomakerId })
  if (!s) return null
  if (s.etapa === "contestada") return "refazer"
  // "Falta" só com o pedido aberto: sem ele, é card antigo que nunca pediu nota.
  if (s.etapa === "falta") return g.notasFiscais.some((n) => n.status === "pendente") ? "falta" : null
  return s.etapa
}

/** A gravação espera a nota dele agora. */
export const pedeNota = (e: EstadoDaNotaDoVideomaker | null) => e === "falta" || e === "refazer"

export const ROTULO_DA_NOTA: Record<EstadoDaNotaDoVideomaker, string> = {
  falta: "Falta a nota",
  refazer: "Nota a refazer",
  recebida: "Nota recebida",
  compras: "Em compras",
  paga: "Paga",
}
