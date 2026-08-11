// Tipos e regras compartilhados pelas três visões do quadro (Kanban, Lista e
// Tabela).
//
// Por que três: o time trabalha de três jeitos e o sistema só oferecia um. Quem
// se organiza em planilha por semana precisa de tabela; quem vem de Trello/ClickUp
// prefere lista agrupada; quem já se acostumou com o quadro fica no kanban. É a
// mesma consulta e o mesmo conjunto de dados — muda só o desenho.

import { estaAtrasada, diasDeAtraso } from "@/lib/status"

export type Visao = "kanban" | "lista" | "tabela"
export type AbaRapida = "todos" | "minhas" | "criadas" | "atrasadas"

export interface DemandaLista {
  id: string
  codigo: string
  titulo: string
  departamento: string
  tipoVideo: string
  prioridade: "urgente" | "alta" | "normal" | "baixa"
  statusVisivel: string
  statusInterno: string
  dataLimite?: string | null
  createdAt?: string
  finalizadaEm?: string | null
  updatedAt?: string
  posicaoKanban?: number | null
  videomakerId?: string | null
  editor?: { nome: string } | null
  designer?: { nome: string } | null
  videomaker?: { nome: string } | null
  responsavel?: { id: string; nome: string } | null
  responsaveis?: { usuario: { id: string; nome: string } }[]
  solicitante?: { id: string; nome: string } | null
  produtos?: { produto: { nome: string } }[]
  eventoGestao?: { id: string; nome: string } | null
  _count?: { comentarios: number; arquivos: number }
}

/** Rótulo curto da coluna, na linguagem que já aparece no kanban. */
export const LABEL_STATUS: Record<string, string> = {
  entrada: "Entrada",
  producao: "Produção",
  edicao: "Edição",
  aprovacao: "Aprovação",
  para_postar: "Para postar",
  finalizado: "Concluído",
}

/**
 * Quem responde pela demanda, em uma linha. A M2M é a fonte da verdade (ver
 * src/lib/responsaveis.ts); o escalar e os papéis de produção entram como
 * fallback para não deixar a coluna vazia numa demanda antiga.
 */
export function responsavelResumo(d: DemandaLista): { nome: string; extras: number } | null {
  const daM2M = (d.responsaveis ?? []).map((r) => r.usuario?.nome).filter(Boolean) as string[]
  if (daM2M.length > 0) return { nome: daM2M[0], extras: daM2M.length - 1 }
  const unico = d.responsavel?.nome ?? d.designer?.nome ?? d.editor?.nome ?? d.videomaker?.nome
  return unico ? { nome: unico, extras: 0 } : null
}

/** Iniciais para o avatar redondo das listas. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase()
}

/**
 * Agrupamento da visão Lista. Ordena por urgência real em vez de por coluna do
 * kanban: quem abre a lista quer saber o que fazer agora, não onde o card está.
 */
export const GRUPOS_LISTA = [
  { id: "atrasadas", titulo: "Atrasadas", tom: "vermelho" as const },
  { id: "hoje", titulo: "Vencem hoje", tom: "ambar" as const },
  { id: "andamento", titulo: "Em andamento", tom: "azul" as const },
  { id: "aprovacao", titulo: "Aguardando aprovação", tom: "ambar" as const },
  { id: "concluidas", titulo: "Concluídas recentes", tom: "verde" as const },
]

function venceHoje(d: DemandaLista): boolean {
  if (!d.dataLimite) return false
  const prazo = new Date(d.dataLimite)
  const hoje = new Date()
  return prazo.toDateString() === hoje.toDateString()
}

export function grupoDaDemanda(d: DemandaLista): string {
  if (d.statusVisivel === "finalizado") return "concluidas"
  if (estaAtrasada(d)) return "atrasadas"
  if (venceHoje(d)) return "hoje"
  if (d.statusVisivel === "aprovacao") return "aprovacao"
  return "andamento"
}

/** Contadores do topo — calculados sobre o que já está carregado, sem ida extra à API. */
export function calcularKpis(demandas: DemandaLista[]) {
  const hoje = new Date().toDateString()
  return {
    abertas: demandas.filter((d) => d.statusVisivel !== "finalizado").length,
    atrasadas: demandas.filter(estaAtrasada).length,
    aprovacao: demandas.filter((d) => d.statusVisivel === "aprovacao").length,
    // finalizadaEm é a data de entrega; demandas antigas não têm e caem no
    // updatedAt, que é quando foram movidas para Concluído.
    concluidasHoje: demandas.filter((d) => {
      if (d.statusVisivel !== "finalizado") return false
      const quando = d.finalizadaEm ?? d.updatedAt
      return !!quando && new Date(quando).toDateString() === hoje
    }).length,
  }
}

export { estaAtrasada, diasDeAtraso }
