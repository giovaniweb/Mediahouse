// Pessoas & Acessos — mapeamento do `tipo` legado para as dimensões da membership
// (categoria / função profissional / áreas de atuação). Fonte única reutilizada por
// promover, criação de profissionais, criação de pessoa na UI e backfill.
import type { CategoriaPessoa, AreaAtuacao, TipoUsuario } from "@prisma/client"

export interface DimensoesPessoa {
  categoria: CategoriaPessoa
  funcaoProfissional: string | null
  areas: AreaAtuacao[]
}

export function dimensoesParaTipo(tipo: string): DimensoesPessoa {
  switch (tipo) {
    case "solicitante":     return { categoria: "solicitante", funcaoProfissional: null, areas: [] }
    case "videomaker":      return { categoria: "externo", funcaoProfissional: "videomaker", areas: ["audiovisual"] }
    case "editor":          return { categoria: "interna", funcaoProfissional: "editor", areas: ["audiovisual"] }
    case "designer":        return { categoria: "interna", funcaoProfissional: "designer", areas: ["growth"] }
    case "social":          return { categoria: "interna", funcaoProfissional: "social", areas: ["growth"] }
    case "analista_crm":    return { categoria: "interna", funcaoProfissional: "analista_crm", areas: ["growth"] }
    case "gestor_trafego":  return { categoria: "interna", funcaoProfissional: "gestor_trafego", areas: ["growth"] }
    case "gestor_eventos":  return { categoria: "interna", funcaoProfissional: "gestor_eventos", areas: ["eventos"] }
    case "gestor":          return { categoria: "interna", funcaoProfissional: "gestor", areas: ["audiovisual", "growth"] }
    case "admin":           return { categoria: "interna", funcaoProfissional: "admin", areas: ["audiovisual", "growth"] }
    case "operacao":        return { categoria: "interna", funcaoProfissional: "operacao", areas: ["audiovisual", "growth"] }
    case "auxiliar_admin":  return { categoria: "interna", funcaoProfissional: "auxiliar_admin", areas: ["audiovisual", "growth"] }
    default:                return { categoria: "interna", funcaoProfissional: tipo ?? null, areas: ["growth"] }
  }
}

// Normaliza nome de Linha/Projeto para comparação de duplicado (trim + colapsa espaços
// + caixa + remove acentos). "Médica" == "Medica" == "  medica ".
export function normalizarNome(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

// Tipos válidos para o campo `papel`/`tipo` (compat com TipoUsuario do schema).
export const TIPOS_VALIDOS: TipoUsuario[] = [
  "admin", "gestor", "operacao", "solicitante", "editor", "videomaker", "social",
  "gestor_eventos", "designer", "analista_crm", "gestor_trafego", "auxiliar_admin",
]
