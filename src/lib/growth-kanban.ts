// Growth (gestão de conteúdos) — camada de mapeamento do kanban.
//
// Decisão MVP segura: NÃO alterar os enums do Prisma. O Growth reutiliza a mesma
// Demanda do audiovisual (area="design" internamente) e dirige seu kanban pelo
// `statusInterno` (rico: 27 valores), agrupando-os nas 8 colunas do Growth.
// O audiovisual segue intacto (kanban por statusVisivel).
import type { StatusInterno } from "@prisma/client"
import { entregaPecaVisual } from "./growth-conteudo"

export type GrowthColunaId =
  | "backlog" | "conteudos" | "para_fazer" | "fazendo"
  | "para_aprovacao" | "programado" | "finalizado" | "impedimento"

// Colunas do kanban de Growth (na ordem de exibição).
export const GROWTH_COLUNAS: { id: GrowthColunaId; label: string; color: string; dot: string }[] = [
  { id: "backlog",        label: "Backlog",        color: "border-t-zinc-500",    dot: "bg-zinc-400" },
  { id: "conteudos",      label: "Briefing",       color: "border-t-sky-500",     dot: "bg-sky-500" },
  { id: "para_fazer",     label: "Para fazer",     color: "border-t-indigo-500",  dot: "bg-indigo-500" },
  { id: "fazendo",        label: "Fazendo",        color: "border-t-violet-500",  dot: "bg-violet-500" },
  { id: "para_aprovacao", label: "Para aprovação", color: "border-t-amber-500",   dot: "bg-amber-500" },
  { id: "programado",     label: "Programado",     color: "border-t-cyan-500",    dot: "bg-cyan-500" },
  { id: "finalizado",     label: "Finalizado",     color: "border-t-emerald-500", dot: "bg-emerald-500" },
  { id: "impedimento",    label: "Impedimento",    color: "border-t-rose-500",    dot: "bg-rose-500" },
]

// Coluna → statusInterno canônico aplicado ao mover o card (todos existem em
// STATUS_PARA_COLUNA, então o PATCH /status aceita).
export const GROWTH_COLUNA_PARA_STATUS: Record<GrowthColunaId, StatusInterno> = {
  backlog:        "pedido_criado",
  conteudos:      "aguardando_triagem",
  para_fazer:     "fila_edicao",
  fazendo:        "editando",
  para_aprovacao: "revisao_pendente",
  programado:     "postagem_pendente",
  finalizado:     "entregue_cliente",
  impedimento:    "impedimento",
}

// statusInterno → coluna do Growth (agrupa os 27 estados nas 8 colunas).
// Default (qualquer estado não mapeado) cai em "backlog".
export const STATUS_INTERNO_PARA_GROWTH_COLUNA: Record<StatusInterno, GrowthColunaId> = {
  // Backlog — entrada / aprovação interna
  pedido_criado:                "backlog",
  aguardando_aprovacao_interna: "backlog",
  urgencia_pendente_aprovacao:  "backlog",
  urgencia_aprovada:            "backlog",
  // Conteúdos — triado / em planejamento
  aguardando_triagem:           "conteudos",
  planejamento:                 "conteudos",
  // Para fazer — atribuído / na fila / pré-produção
  videomaker_notificado:        "para_fazer",
  videomaker_aceitou:           "para_fazer",
  captacao_agendada:            "para_fazer",
  captacao_realizada:           "para_fazer",
  brutos_enviados:              "para_fazer",
  editor_atribuido:             "para_fazer",
  fila_edicao:                  "para_fazer",
  // Fazendo — em produção / ajuste
  editando:                     "fazendo",
  ajuste_solicitado:            "fazendo",
  // Para aprovação
  edicao_finalizada:            "para_aprovacao",
  revisao_pendente:             "para_aprovacao",
  // Programado — aprovado, aguardando publicação
  aprovado:                     "programado",
  postagem_pendente:            "programado",
  postado:                      "programado",
  // Finalizado
  entregue_cliente:             "finalizado",
  contagem_15_dias_iniciada:    "finalizado",
  lembrete_15_dias_enviado:     "finalizado",
  expirado:                     "finalizado",
  encerrado:                    "finalizado",
  // Impedimento
  impedimento:                  "impedimento",
  videomaker_recusou:           "impedimento",
}

// Resolve a coluna de Growth de uma demanda a partir do seu statusInterno.
export function growthColunaDe(statusInterno: string): GrowthColunaId {
  return STATUS_INTERNO_PARA_GROWTH_COLUNA[statusInterno as StatusInterno] ?? "backlog"
}

// ── O card que não foi enviado ao cliente ──────────────────────────────────
//
// Substitui a trava que exigia a arte antes de "Para aprovação" (16–25/08/2026).
// A trava caía sobre o caminho normal — 10 dos 10 cards em "Fazendo" estavam sem
// arte — e travar a maioria é vivido como sistema quebrado, não como cuidado.
//
// O problema real que ela tentava resolver era outro: um card em "Para
// aprovação" que ninguém mandou parecia igual a um que foi mandado. Isso não
// precisa de recusa, precisa de sinal. Um card sem `linkCliente` é, por
// definição, um que não saiu por aqui — e esse dado já chega na tela.
//
// Só vale para tipo que entrega peça: campanha de e-mail e landing page nunca
// geram link de aprovação, então marcá-las seria marcar todo mundo, que é o
// mesmo que não marcar ninguém.
export function naoEnviadoAoCliente(d: {
  statusInterno?: string | null
  tipoVideo?: string | null
  linkCliente?: string | null
}): boolean {
  if (!["revisao_pendente", "edicao_finalizada"].includes(d.statusInterno ?? "")) return false
  if (!entregaPecaVisual(d.tipoVideo)) return false
  return !d.linkCliente
}
