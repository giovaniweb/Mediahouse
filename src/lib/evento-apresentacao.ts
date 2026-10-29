export const TIPO_EVENTO_LABEL: Record<string, string> = {
  cafe: "Café", jantar: "Jantar", webinar: "Webinar", congresso: "Congresso",
  feira: "Feira", ativacao: "Ativação", unyque_experience: "Unyque Experience",
  treinamento: "Treinamento", lancamento: "Lançamento", evento_interno: "Evento Interno",
  evento_medicos: "Evento com Médicos", evento_fornecedores: "Evento com Fornecedores", outro: "Outro",
}

// Sem "Ideia": o status existe no banco desde o começo, mas aqui não há
// pré-agenda — a empresa executa o que já foi contratado (Giovani, 29/10/2026).
export const STATUS_EVENTO_STYLE: Record<string, { label: string; cls: string }> = {
  planejamento: { label: "Planejamento", cls: "bg-blue-900/60 text-blue-300 border border-blue-700/50" },
  orcamento: { label: "Orçamento", cls: "bg-amber-900/60 text-amber-300 border border-amber-700/50" },
  aprovacao: { label: "Aprovação", cls: "bg-purple-900/60 text-purple-300 border border-purple-700/50" },
  producao: { label: "Produção", cls: "bg-indigo-900/60 text-indigo-300 border border-indigo-700/50" },
  execucao: { label: "Execução", cls: "bg-cyan-900/60 text-cyan-300 border border-cyan-700/50" },
  finalizado: { label: "Finalizado", cls: "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50" },
  cancelado: { label: "Cancelado", cls: "bg-red-900/60 text-red-300 border border-red-700/50" },
}

/**
 * As colunas do quadro de eventos: uma para cada status, na ordem do caminho.
 * Sem a Lista (29/10/2026), evento num status sem coluna sumiria da página.
 */
export const COLUNAS_EVENTO = Object.keys(STATUS_EVENTO_STYLE)

/** Status que se pode gravar num evento (o "ideia" do banco não entra). */
export function ehStatusDeEvento(v: unknown): v is string {
  return typeof v === "string" && COLUNAS_EVENTO.includes(v)
}

/** A coluna do evento no quadro. Evento antigo em "ideia" aparece em Planejamento. */
export function colunaDoEvento(status: string): string {
  return status === "ideia" ? "planejamento" : status
}

