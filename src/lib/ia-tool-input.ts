import { z } from "zod"
const texto = z.string().trim().min(1).max(8000)
const id = z.string().trim().min(1).max(150)
const data = z.string().refine(s => Number.isFinite(Date.parse(s)), "Data inválida")
const dono = { videomaker_id: id.optional(), editor_id: id.optional() }
const demanda = { demanda_id: id.optional(), codigo_demanda: id.optional() }
const autor = { telefone_solicitante: texto.optional(), nome_solicitante: texto.optional() }
const schemas: Record<string, z.ZodType> = {
  buscar_demandas: z.object({ status: texto.optional(), prioridade: z.enum(["normal", "alta", "urgente"]).optional(), em_atraso: z.boolean().optional(), paradas_ha_dias: z.number().int().min(1).max(365).optional(), limite: z.number().int().min(1).max(100).optional() }).strict(),
  buscar_videomakers: z.object({ apenas_ativos: z.boolean().optional() }).strict(),
  buscar_custos: z.object({ dias: z.number().int().min(1).max(366).optional() }).strict(),
  buscar_metricas: z.object({}).strict(),
  buscar_alertas: z.object({ severidade: z.enum(["info", "aviso", "critico"]).optional() }).strict(),
  criar_alerta: z.object({ tipo: texto, mensagem: texto, severidade: z.enum(["info", "aviso", "critico"]), acao_sugerida: texto.optional(), demanda_id: id.optional() }).strict(),
  buscar_historico_demanda: z.object({ demanda_id: id }).strict(),
  buscar_agenda_videomaker: z.object({ ...dono, nome: texto.optional(), telefone: texto.optional(), inicio: data.optional(), dias_futuros: z.number().int().min(1).max(90).optional() }).strict(),
  criar_evento_agenda: z.object({ ...dono, usuario_id: id.optional(), titulo: texto, descricao: texto.optional(), inicio: data, fim: data.optional(), local: texto.optional(), tipo: z.enum(["captacao", "reuniao", "outro"]).optional(), dia_todo: z.boolean().optional(), demanda_id: id.optional(), forcar: z.boolean().optional() }).strict(),
  enviar_whatsapp: z.object({ telefone: texto, mensagem: texto, demanda_id: id.optional() }).strict(),
  criar_demanda_rascunho: z.object({ titulo: texto, descricao: texto.optional(), departamento: texto.optional(), tipo_video: texto.optional(), prioridade: z.enum(["normal", "alta", "urgente"]).optional(), cidade: texto.optional(), ...autor }).strict(),
  estruturar_demanda: z.object({ texto_original: texto, ...autor }).strict(),
  solicitar_dados_demanda: z.object({ ...demanda, mensagem: texto, dados_faltantes: texto.optional() }).strict(),
  vincular_arquivo_demanda: z.object({ ...demanda, url_arquivo: z.string().url(), nome_arquivo: texto, tipo: z.enum(["referencia", "bruto", "cliente"]).optional() }).strict(),
  buscar_demanda_por_codigo: z.object({ codigo: id }).strict(),
  listar_gestores: z.object({}).strict(),
  salvar_ideia_video: z.object({ titulo: texto, descricao: texto.optional(), link_referencia: z.string().url().optional(), media_url: z.string().url().optional(), produto_nome: texto.optional(), classificacao: z.enum(["b2c", "b2b"]).optional(), telefone_origem: texto.optional(), nome_origem: texto.optional() }).strict(),
  buscar_ideias: z.object({ status: texto.optional(), produto_nome: texto.optional(), limite: z.number().int().min(1).max(100).optional() }).strict(),
}
export function validarInputFerramenta(nome: string, input: unknown): Record<string, unknown> {
  const result = schemas[nome]?.safeParse(input)
  if (!result?.success) throw new Error("Argumentos inválidos ou ferramenta desconhecida")
  return result.data as Record<string, unknown>
}
