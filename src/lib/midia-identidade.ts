import { BUCKET_PRIVADO, caminhoDaUrl, caminhoMidiaValido } from "@/lib/midia"

export type IdentidadeMidia =
  | { provedor: "supabase"; bucket: string; objectKey: string }
  | { provedor: "drive"; fileId: string }
  | { provedor: "externo"; referencia: string }

/** Classifica referências; não concede acesso e nunca faz download. Tokens não são identidade. */
export function identificarMidia(valor: string | null | undefined): IdentidadeMidia | null {
  if (!valor) return null
  const privado = caminhoDaUrl(valor)
  if (privado) return { provedor: "supabase", bucket: BUCKET_PRIVADO, objectKey: privado }
  // Recusar normalizações silenciosas de URL (traversal, escapes e barras invertidas).
  if (valor.split("?")[0].includes("%") || /[\\\s]/.test(valor) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(valor)) return null
  try {
    const u = new URL(valor)
    if (u.protocol !== "https:" || u.username || u.password || u.hash) return null
    const configurada = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (configurada && u.origin === new URL(configurada).origin) {
      const m = u.pathname.match(/^\/storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/)
      if (!m || !["uploads", BUCKET_PRIVADO].includes(m[2])) return null
      const partes = m[3].split("/")
      if (!partes.every(p => /^[a-zA-Z0-9_.-]+$/.test(p) && p !== "." && p !== "..")) return null
      if (m[2] === BUCKET_PRIVADO && !caminhoMidiaValido(m[3])) return null
      if (m[2] === "uploads" && m[1] !== "public") return null
      return { provedor: "supabase", bucket: m[2], objectKey: m[3] }
    }
    if (u.hostname === "drive.google.com" && !u.port) {
      const id = u.pathname.match(/^\/file\/d\/([\w-]+)(?:\/view)?\/?$/)?.[1]
        ?? (["/open", "/uc"].includes(u.pathname) ? u.searchParams.get("id") : null)
      if (id && /^[\w-]+$/.test(id)) return { provedor: "drive", fileId: id }
    }
    return { provedor: "externo", referencia: u.href }
  } catch { return null }
}

/** Exige também vínculo exato no banco no chamador. Prefixo sozinho nunca autoriza. */
export function videoDaDemanda(identidade: IdentidadeMidia | null, organizacaoId: string, demandaId: string): boolean {
  if (identidade?.provedor !== "supabase") return false
  const p = identidade.objectKey.split("/")
  return identidade.bucket === BUCKET_PRIVADO
    ? p[0] === "org" && p[1] === organizacaoId && p[2] === "videos" && p[3] === demandaId
    : identidade.bucket === "uploads" && p[0] === "videos" && p[1] === demandaId && p.length >= 3
}
