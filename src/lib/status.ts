import type { StatusInterno, StatusVisivel } from "@prisma/client"

// Mapeamento: StatusInterno → StatusVisivel (coluna kanban)
export const STATUS_PARA_COLUNA: Record<StatusInterno, StatusVisivel> = {
  pedido_criado:                   "entrada",
  aguardando_aprovacao_interna:    "entrada",
  aguardando_triagem:              "entrada",
  urgencia_pendente_aprovacao: "entrada",
  urgencia_aprovada:           "producao",
  planejamento:                "producao",
  videomaker_notificado:       "producao",
  videomaker_aceitou:          "producao",
  videomaker_recusou:          "producao",
  captacao_agendada:           "producao",
  captacao_realizada:          "producao",
  brutos_enviados:             "producao",
  editor_atribuido:            "edicao",
  fila_edicao:                 "edicao",
  editando:                    "edicao",
  edicao_finalizada:           "aprovacao",
  revisao_pendente:            "aprovacao",
  ajuste_solicitado:           "aprovacao",
  impedimento:                 "aprovacao",
  aprovado:                    "para_postar",
  postagem_pendente:           "para_postar",
  postado:                     "finalizado",
  entregue_cliente:            "finalizado",
  contagem_15_dias_iniciada:   "finalizado",
  lembrete_15_dias_enviado:    "finalizado",
  expirado:                    "finalizado",
  encerrado:                   "finalizado",
}

export const COLUNAS_LABEL: Record<StatusVisivel, string> = {
  entrada:     "Entrada",
  producao:    "Produção",
  edicao:      "Edição",
  aprovacao:   "Aprovação",
  para_postar: "Para Postar",
  finalizado:  "Finalizado",
}

export const COLUNAS_ORDER: StatusVisivel[] = [
  "entrada",
  "producao",
  "edicao",
  "aprovacao",
  "para_postar",
  "finalizado",
]

// Status internos disponíveis para transição manual por coluna
export const TRANSICOES_VALIDAS: Partial<Record<StatusInterno, StatusInterno[]>> = {
  pedido_criado:               ["aguardando_triagem", "planejamento", "urgencia_pendente_aprovacao"],
  aguardando_triagem:          ["planejamento", "urgencia_pendente_aprovacao"],
  urgencia_pendente_aprovacao: ["urgencia_aprovada", "planejamento", "encerrado"],
  urgencia_aprovada:           ["planejamento"],
  planejamento:                ["videomaker_notificado", "editor_atribuido"],
  videomaker_notificado:       ["videomaker_aceitou", "videomaker_recusou", "captacao_agendada"],
  videomaker_aceitou:          ["captacao_agendada"],
  videomaker_recusou:          ["videomaker_notificado"],
  captacao_agendada:           ["captacao_realizada"],
  captacao_realizada:          ["brutos_enviados"],
  brutos_enviados:             ["editor_atribuido", "fila_edicao"],
  editor_atribuido:            ["fila_edicao", "editando"],
  fila_edicao:                 ["editando"],
  editando:                    ["edicao_finalizada", "impedimento"],
  edicao_finalizada:           ["revisao_pendente"],
  revisao_pendente:            ["aprovado", "ajuste_solicitado", "impedimento"],
  ajuste_solicitado:           ["editando", "impedimento"],
  impedimento:                 ["editando", "revisao_pendente", "encerrado"],
  aprovado:                    ["postagem_pendente"],
  postagem_pendente:           ["postado"],
  postado:                     ["entregue_cliente"],
  entregue_cliente:            ["contagem_15_dias_iniciada"],
  contagem_15_dias_iniciada:   ["lembrete_15_dias_enviado", "expirado"],
  lembrete_15_dias_enviado:    ["expirado"],
  expirado:                    ["encerrado"],
  encerrado:                   [],
}

// ── Atraso ──────────────────────────────────────────────────────────────────
// Colunas onde o prazo não conta mais: a bola está com o cliente (aprovação) ou
// com quem posta, não com quem produz — marcar como atraso puniria o executor
// por espera alheia — e "finalizado", porque uma demanda já entregue não é algo
// a resolver hoje (era o critério que o contador do dashboard já usava, e sem
// ele o card pulsava vermelho na coluna Concluído).
export const STATUS_PRAZO_PAUSADO = ["aprovacao", "para_postar", "finalizado"]

/** Regra única de atraso — usada pelo card e pela ordenação do kanban. */
export function estaAtrasada(d: { dataLimite?: string | Date | null; statusVisivel?: string | null }): boolean {
  if (!d.dataLimite) return false
  if (STATUS_PRAZO_PAUSADO.includes(d.statusVisivel ?? "")) return false
  return new Date(d.dataLimite) < new Date()
}

/**
 * Dias inteiros de atraso, ou null quando o número não é confiável. O banco tem
 * datas corrompidas (ano 0001, ano 0026) que renderizariam "atrasada há 700 mil
 * dias" — nesses casos o chamador mostra só "ATRASADA".
 */
export function diasDeAtraso(d: { dataLimite?: string | Date | null; statusVisivel?: string | null }): number | null {
  if (!estaAtrasada(d)) return null
  const dias = Math.floor((Date.now() - new Date(d.dataLimite!).getTime()) / 86_400_000)
  return dias > 0 && dias < 3650 ? dias : null
}
