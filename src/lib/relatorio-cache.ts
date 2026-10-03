import { createHash } from "node:crypto"
import { relatorioV1Schema, type RelatorioV1 } from "@/lib/relatorio-contrato"

export const CACHE_RELATORIO_MS = 15 * 60 * 1000
// Alterar esta versão ao mudar prompt, regras de interpretação ou contrato de entrada.
export const PROMPT_RELATORIO_VERSAO = "analise-relatorio-v1"
function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar)
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordenar(v)]))
  return valor
}
/** Exclui somente o instante da coleta, nunca datas de recorte ou métricas. */
export function chaveRelatorioCache(entrada: { organizacaoId: string; usuarioId: string; financeiro: boolean; tipo: string; modelo: string; snapshot: NonNullable<RelatorioV1["snapshot"]> }) {
  const snapshot = { ...entrada.snapshot, metricas: entrada.snapshot.metricas ? { ...entrada.snapshot.metricas, geradoEm: null } : undefined }
  return createHash("sha256").update(JSON.stringify(ordenar({ organizacaoId: entrada.organizacaoId, usuarioId: entrada.usuarioId, financeiro: entrada.financeiro, tipo: entrada.tipo, modelo: entrada.modelo, snapshot, prompt: PROMPT_RELATORIO_VERSAO }))).digest("hex")
}
export function cacheRelatorioValido(conteudo: unknown, chave: string) {
  const r = relatorioV1Schema.safeParse(conteudo)
  return r.success && r.data.cacheIA?.chave === chave && r.data.conteudo.formato !== "invalido" ? r.data : null
}
