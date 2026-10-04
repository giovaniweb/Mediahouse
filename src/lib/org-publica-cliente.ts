// Propaga a empresa dona do link nas páginas PÚBLICAS.
//
// O formulário público não tem sessão, então a empresa vem da própria URL, de
// um de dois jeitos:
//   /c/contourline/pedido              — a área da empresa (o jeito atual)
//   /cadastrar-demanda?org=contourline — o link antigo, que continua valendo
// Sem nenhum dos dois, a API cai na ORG_PUBLICA_PADRAO — o que mantém de pé os
// links que já circulam sem slug.
//
// É isto que permite a segunda empresa ter formulário próprio sem herdar o
// tráfego da primeira: basta o link carregar o slug dela.

/** Mesmo formato que o cadastro de empresa aceita: minúsculas, números e hífen. */
export const SLUG_PUBLICO = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

/** Slug da área `/c/<slug>/...`, ou null quando o caminho não é de uma área. */
export function slugDoCaminho(caminho: string): string | null {
  const m = /^\/c\/([^/?#]+)/.exec(caminho)
  if (!m) return null
  let slug: string
  try { slug = decodeURIComponent(m[1]).trim().toLowerCase() } catch { return null }
  return SLUG_PUBLICO.test(slug) ? slug : null
}

/** A empresa da página: primeiro o caminho da área, depois o `?org=` antigo. */
export function slugDaPagina(): string | null {
  if (typeof window === "undefined") return null
  const doCaminho = slugDoCaminho(window.location.pathname)
  if (doCaminho) return doCaminho
  return new URLSearchParams(window.location.search).get("org")?.trim() || null
}

/**
 * O endereço com a empresa da página acrescentada. Quem chama não escolhe o
 * separador: com `sufixoOrg("?")` depois de `?grupo=...`, o formulário pedia
 * `?grupo=tipos_video?org=x`, a API lia o grupo "tipos_video?org=x" e a lista de
 * tipos vinha vazia para toda empresa que não fosse a padrão.
 */
export function urlComOrg(caminho: string): string {
  const org = slugDaPagina()
  if (!org) return caminho
  return `${caminho}${caminho.includes("?") ? "&" : "?"}org=${encodeURIComponent(org)}`
}
