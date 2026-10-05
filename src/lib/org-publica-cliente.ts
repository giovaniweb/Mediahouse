// Propaga a empresa dona do link nas páginas PÚBLICAS.
//
// O formulário público não tem sessão, então a empresa vem da própria URL:
//   contourline.nuflow.space/pedido — a área no subdomínio (ver lib/subdominio)
//   /c/contourline/pedido — a área no endereço antigo
// O link antigo (/cadastrar-demanda, com ou sem ?org=) redireciona para a área,
// então o formulário quase sempre tem o slug no caminho. O `?org=` e o padrão da
// API (ORG_PUBLICA_PADRAO) ficam para as telas públicas que ainda não estão na
// área, como /galeria.
//
// É isto que permite a segunda empresa ter formulário próprio sem herdar o
// tráfego da primeira: basta o link carregar o slug dela.

import { SLUG_PUBLICO, slugDoHost } from "@/lib/subdominio"

export { SLUG_PUBLICO }

/** Slug da área `/c/<slug>/...`, ou null quando o caminho não é de uma área. */
export function slugDoCaminho(caminho: string): string | null {
  const m = /^\/c\/([^/?#]+)/.exec(caminho)
  if (!m) return null
  let slug: string
  try { slug = decodeURIComponent(m[1]).trim().toLowerCase() } catch { return null }
  return SLUG_PUBLICO.test(slug) ? slug : null
}

/** A empresa da página: o subdomínio, o caminho da área e, por último, o `?org=` antigo. */
export function slugDaPagina(): string | null {
  if (typeof window === "undefined") return null
  const doHost = slugDoHost(window.location.host)
  if (doHost) return doHost
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
