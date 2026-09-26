export const TIPO_EVENTO_LABEL: Record<string, string> = {
  cafe: "Café", jantar: "Jantar", webinar: "Webinar", congresso: "Congresso",
  feira: "Feira", ativacao: "Ativação", unyque_experience: "Unyque Experience",
  treinamento: "Treinamento", lancamento: "Lançamento", evento_interno: "Evento Interno",
  evento_medicos: "Evento com Médicos", evento_fornecedores: "Evento com Fornecedores", outro: "Outro",
}

export const STATUS_EVENTO_STYLE: Record<string, { label: string; cls: string }> = {
  ideia: { label: "Ideia", cls: "bg-zinc-700 text-zinc-300" },
  planejamento: { label: "Planejamento", cls: "bg-blue-900/60 text-blue-300 border border-blue-700/50" },
  orcamento: { label: "Orçamento", cls: "bg-amber-900/60 text-amber-300 border border-amber-700/50" },
  aprovacao: { label: "Aprovação", cls: "bg-purple-900/60 text-purple-300 border border-purple-700/50" },
  producao: { label: "Produção", cls: "bg-indigo-900/60 text-indigo-300 border border-indigo-700/50" },
  execucao: { label: "Execução", cls: "bg-cyan-900/60 text-cyan-300 border border-cyan-700/50" },
  finalizado: { label: "Finalizado", cls: "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50" },
  cancelado: { label: "Cancelado", cls: "bg-red-900/60 text-red-300 border border-red-700/50" },
}

