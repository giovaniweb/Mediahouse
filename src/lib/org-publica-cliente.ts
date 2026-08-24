// Propaga a empresa dona do link nas páginas PÚBLICAS.
//
// O formulário público não tem sessão, então a empresa vem da própria URL:
// /cadastrar-demanda?org=contourline. Sem o parâmetro, a API cai na
// ORG_PUBLICA_PADRAO — o que mantém de pé os links que já circulam sem slug.
//
// É isto que permite a segunda empresa ter formulário próprio sem herdar o
// tráfego da primeira: basta o link carregar o slug dela.
export function sufixoOrg(separador: "?" | "&" = "?"): string {
  if (typeof window === "undefined") return ""
  const org = new URLSearchParams(window.location.search).get("org")?.trim()
  return org ? `${separador}org=${encodeURIComponent(org)}` : ""
}
