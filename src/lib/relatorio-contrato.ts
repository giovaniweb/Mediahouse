import { z } from "zod"

export const tiposRelatorio = z.enum(["produtividade_time", "analise_custos", "otimizacao_contratacao", "performance_videomaker", "semanal", "mensal", "realtime", "banco_ideias"])
const texto = z.string().trim().min(1).max(50000)
const numero = z.number().finite().nonnegative()
const score = numero.max(100)
const lista = <T extends z.ZodType>(item: T) => z.array(item).max(100)
const textos = lista(texto)
const campos = {
  titulo: texto, periodo: texto, resumo_executivo: texto, resumo_financeiro: texto, insights_equipe: texto,
  diagnostico_atual: texto, resumo_ideias: texto, score_produtividade: score, score_inovacao: score,
  saude_geral_sistema: score, total_periodo: numero, custo_medio_video: numero,
  pontos_fortes: textos, destaques_positivos: textos, pontos_atencao: textos, alertas_financeiros: textos,
  criterios_contratacao: textos, riscos_atencao: textos, sugestoes_captura: textos, gaps_conteudo: textos,
  feedback_processo: texto, avaliacao_roi: texto, recomendacoes_budget: texto, custo_oportunidade: texto,
  proximo_passo: texto, modelo_sugerido: texto, economia_potencial: texto, taxa_conversao_analise: texto,
  previsao_proximo_periodo: texto,
  kpis: lista(z.object({ nome: texto, valor: z.union([texto, z.number().finite()]), tendencia: z.enum(["up", "down", "stable"]).optional(), avaliacao: z.enum(["bom", "neutro", "ruim"]).optional() })),
  gargalos: lista(z.object({ problema: texto, impacto: texto, solucao: texto })),
  oportunidades_melhoria: lista(z.object({ area: texto, acao: texto, ganho_estimado: texto })),
  previsao_proxima_semana: z.object({ demandas_esperadas: numero, risco: z.enum(["baixo", "medio", "alto"]), recomendacao: texto }),
  videomakers_eficientes: lista(z.object({ nome: texto, custo_beneficio: texto, recomendacao: z.enum(["manter", "aumentar", "reduzir"]) })),
  otimizacoes_contratacao: lista(z.object({ tipo: texto, descricao: texto, economia_potencial: texto })),
  projecao_mes_seguinte: z.object({ valor_estimado: numero, base_calculo: texto }),
  acoes_recomendadas: lista(z.object({ prioridade: z.enum(["alta", "media", "baixa"]), acao: texto, responsavel: texto })),
  ranking_performance: lista(z.object({ posicao: numero, nome: texto, score_performance: score, pontos_fortes: textos, areas_melhoria: textos, recomendacao: texto })),
  sugestoes_alocacao: lista(z.object({ situacao: texto, acao: texto })),
  melhorias_imediatas: lista(z.object({ acao: texto, impacto: texto, prazo: texto })),
  melhorias_medio_prazo: lista(z.object({ acao: texto, impacto: texto })),
  indicadores_acompanhar: lista(z.object({ kpi: texto, meta: texto })),
  top_ideias: lista(z.object({ titulo: texto, score, por_que: texto })),
  origens_mais_eficazes: lista(z.object({ origem: texto, avaliacao: texto })),
  recomendacoes: lista(z.object({ acao: texto, prioridade: z.enum(["alta", "media", "baixa"]), impacto: texto })),
}
const estruturado = z.object(campos).partial().refine(v => Object.entries(v).some(([k,v]) => !["titulo", "periodo"].includes(k) && (!Array.isArray(v) || v.length > 0)), "Sem conteúdo reconhecido")
const snapshotSchema = z.object({ demandasCriadas: numero, concluidas: numero, emAndamento: numero, custoTotal: numero, custoPorVideo: numero, tempoMedioDias: numero, alertasAtivos: numero }).strict()
const metadadosSchema = z.object({ tipo: tiposRelatorio, periodo: texto, area: z.literal("nao_separada"), origem: z.enum(["manual", "agente"]), geradoEm: z.iso.datetime(), inicio: z.iso.datetime().nullable(), fim: z.iso.datetime().nullable() }).strict()
const corpo = z.discriminatedUnion("formato", [
  z.object({ formato: z.literal("texto"), texto }),
  z.object({ formato: z.literal("estruturado"), dados: estruturado }),
  z.object({ formato: z.literal("invalido"), erro: z.literal("CONTEUDO_INVALIDO") }),
])
export const relatorioV1Schema = z.object({ versao: z.literal(1), metadados: metadadosSchema, snapshot: snapshotSchema.nullable(), conteudo: corpo }).strict()
export type RelatorioV1 = z.infer<typeof relatorioV1Schema>
export type ApresentacaoRelatorio = {
  estado: "texto" | "estruturado" | "invalido"
  origem: "legado" | "manual" | "agente"
  texto?: string
  dados?: z.infer<typeof estruturado>
  aviso?: string
  metadados?: RelatorioV1["metadados"]
  snapshot?: RelatorioV1["snapshot"]
}

function adaptarLegado(valor: unknown): ApresentacaoRelatorio {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return invalido("legado")
  const obj = valor as Record<string, unknown>
  for (const chave of ["analise", "resumo"]) {
    const t = texto.safeParse(obj[chave])
    if (t.success) return { estado: "texto", origem: "legado", texto: t.data }
  }
  const r = estruturado.safeParse(valor)
  return r.success ? { estado: "estruturado", origem: "legado", dados: r.data } : invalido("legado")
}
function invalido(origem: ApresentacaoRelatorio["origem"]): ApresentacaoRelatorio {
  return { estado: "invalido", origem, aviso: "Não foi possível interpretar este conteúdo. O registro foi preservado. Informe a referência abaixo ao suporte; não é necessário gerar outro relatório." }
}
export function apresentarRelatorio(valor: unknown): ApresentacaoRelatorio {
  if (valor && typeof valor === "object" && "versao" in valor) {
    const r = relatorioV1Schema.safeParse(valor)
    if (!r.success) return invalido("legado")
    const origem = r.data.metadados.origem, c = r.data.conteudo
    const contexto = { metadados: r.data.metadados, snapshot: r.data.snapshot }
    if (c.formato === "invalido") return { ...invalido(origem), ...contexto }
    return c.formato === "texto" ? { estado: "texto", origem, texto: c.texto, ...contexto } : { estado: "estruturado", origem, dados: c.dados, ...contexto }
  }
  return adaptarLegado(valor)
}
/** Escritores compartilham o contrato com o leitor. Nunca repete uma chamada paga. */
export function criarRelatorioV1(valor: unknown, metadados: RelatorioV1["metadados"], snapshot: RelatorioV1["snapshot"] = null): RelatorioV1 {
  const r = adaptarLegado(valor)
  const conteudo = r.estado === "texto" ? { formato: "texto", texto: r.texto } : r.estado === "estruturado" ? { formato: "estruturado", dados: r.dados } : { formato: "invalido", erro: "CONTEUDO_INVALIDO" }
  return relatorioV1Schema.parse({ versao: 1, metadados, snapshot, conteudo })
}

/** JSON malformado não vira um relatório textual aparentemente bem-sucedido. */
export function lerRespostaRelatorio(resposta: string): unknown {
  const limpo = resposta.trim()
  const cerca = limpo.match(/```(?:json)?\s*([\s\S]*?)```/i)
  try { return JSON.parse(cerca?.[1] ?? limpo) } catch {
    if (cerca || /^[\[{]/.test(limpo)) return null
    return { resumo: limpo }
  }
}
