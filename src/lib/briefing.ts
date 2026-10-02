import { z } from "zod"

export const PDF_MAX_BYTES = 3 * 1024 * 1024
const texto = z.string().trim().min(1).max(500)
const opcional = texto.nullable()
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v
})
export const extratoEventoSchema = z.object({
  titulo: texto,
  tipo: z.enum(["congresso", "feira", "evento_corporativo", "show", "lancamento", "outro"]),
  cliente: opcional, local: opcional, cidade: opcional,
  dataInicio: data, dataFim: data,
  descricao: z.string().max(4000).nullable(),
  standInfo: z.object({ numero: opcional.optional(), tamanho: opcional.optional(), publicoEstimado: z.number().int().min(0).max(100_000_000).nullable().optional(), cota: opcional.optional() }).nullable().optional(),
  portfolio: z.array(texto).max(100).nullable().optional(),
  programacaoPorDia: z.array(z.object({ dia: z.number().int().min(1).max(366), data, titulo: texto, momentos: z.array(texto).max(100) })).max(31),
  checklistEspecifico: z.array(z.object({ texto, categoria: z.enum(["equipamento", "logistica", "conteudo", "entrega"]) })).max(100),
  logistica: z.object({ hotel: opcional, transporte: opcional }).nullable(),
}).refine(v => v.dataFim >= v.dataInicio, "Período inválido")
  .refine(v => v.programacaoPorDia.every(d => d.data >= v.dataInicio && d.data <= v.dataFim), "Programação fora do período")
export type ExtratoEvento = z.infer<typeof extratoEventoSchema>
