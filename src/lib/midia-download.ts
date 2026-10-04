/**
 * Pede à rota de mídia o arquivo como anexo, em vez de abri-lo no navegador.
 * Só vale para a mídia privada (`/api/midia/...`); link externo — YouTube,
 * Drive, acervo antigo — volta como veio. Sem dependência de servidor: as telas
 * usam o mesmo helper.
 */
export function paraDownload(url: string | null | undefined): string | null {
  if (!url) return null
  if (!url.startsWith("/api/midia/")) return url
  return `${url}${url.includes("?") ? "&" : "?"}download=1`
}
