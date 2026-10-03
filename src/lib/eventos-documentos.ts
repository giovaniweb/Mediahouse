import { z } from "zod"

export function linkDocumentoSeguro(valor: string | null | undefined) {
  if (!valor) return null
  try { const u = new URL(valor); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password ? u.href : null } catch { return null }
}
const link = z.string().max(2048).transform(v => v.trim() || null).nullable().refine(v => v === null || linkDocumentoSeguro(v) !== null, "Link inválido")
const observacoes = z.string().max(4000).nullable()
export const documentoCriar = z.object({
  nome: z.string().trim().min(1).max(200),
  categoria: z.enum(["manual_expositor", "programacao", "briefing", "contratos", "planta", "projeto_stand", "layout_identidade", "material_impresso", "artes_digitais", "audiovisual", "outros"]).default("outros"),
  url: link.optional(), linkExterno: link.optional(), observacoes: observacoes.optional(),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v }).nullable().optional(),
}).strict()
export const documentoEditar = z.object({
  id: z.string().min(1).max(128),
  status: z.enum(["pendente", "enviado", "em_analise", "aprovado", "reprovado", "finalizado"]).optional(),
  url: link.optional(), linkExterno: link.optional(), observacoes: observacoes.optional(),
}).strict().refine(v => Object.keys(v).length > 1)
export const aprovacaoCriar = z.object({ tipo: z.enum(["orcamento", "layout", "material", "contrato", "entrega"]), observacao: observacoes.optional() }).strict()
export const aprovacaoDecidir = z.object({ id: z.string().min(1).max(128), status: z.enum(["aprovado", "reprovado"]), observacao: observacoes.optional() }).strict()
export const tipoFinanceiro = (tipo: string) => ["orcamento", "contrato"].includes(tipo)
export const podeDecidirEvento = (papel: string) => ["admin", "gestor", "gestor_eventos"].includes(papel)
