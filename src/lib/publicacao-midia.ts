import { caminhoDaUrl, resolverParaAssinada } from "@/lib/midia"

export const SEM_CACHE_MIDIA = { "Cache-Control": "private, no-store" }
export const PUBLICADO = { tipoArquivo: "final" as const, publicadoEm: { not: null }, revogadoEm: null, publicacaoUrl: { not: null } }

/** O snapshot publicado só pode apontar para mídia desta entrega. */
export function urlPublicavel(url: string | null, organizacaoId: string, demandaId: string, thumbnail = false): boolean {
  if (!url) return false
  if (url.startsWith("/")) {
    const caminho = caminhoDaUrl(url)
    if (!caminho) return false
    const p = caminho.split("/")
    return p[1] === organizacaoId && p[3] === demandaId &&
      (thumbnail ? p[2] === "thumbnails" : p[2] === "videos")
  }
  try {
    const u = new URL(url)
    return u.protocol === "https:" && !u.username && !u.password
  } catch { return false }
}

export async function resolverPublicacao(url: string | null, org: string, demanda: string, thumbnail = false) {
  return urlPublicavel(url, org, demanda, thumbnail) ? resolverParaAssinada(url) : null
}

export function numeroPagina(valor: string | null, padrao: number, max = 100000) {
  const n = Number(valor)
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : padrao
}

/** Cobertura tem seu próprio consentimento (link público + senha), validado pelo handler. */
export async function resolverMidiaCobertura(url: string | null, org: string, cobertura: string, segundos?: number) {
  if (!url) return null
  if (url.startsWith("/")) {
    const c = caminhoDaUrl(url)?.split("/")
    if (!c || c[1] !== org || c[3] !== cobertura || !["coberturas", "thumbnails"].includes(c[2])) return null
  } else {
    try { const u = new URL(url); if (u.protocol !== "https:" || u.username || u.password) return null } catch { return null }
  }
  return resolverParaAssinada(url, segundos)
}
