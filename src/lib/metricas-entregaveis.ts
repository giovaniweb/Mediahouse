/** Só une identidades demonstráveis. URLs distintas continuam distintas. */
export function identidadeEntregavel(raw: string): string {
  try {
    const url = new URL(raw, "https://nuflow.local")
    if (["drive.google.com", "docs.google.com"].includes(url.hostname)) {
      const id = url.pathname.match(/\/d\/([^/]+)/)?.[1] ?? url.searchParams.get("id")
      if (id) return `drive:${id}`
    }
    url.hash = ""
    if (url.pathname.startsWith("/api/midia/") || url.pathname.includes("/storage/v1/object/")) {
      url.search = ""
      url.pathname = url.pathname.replace(/\/object\/(?:sign|public|authenticated)\//, "/object/")
    }
    return url.toString()
  } catch { return raw.trim() }
}
export function contarEntregaveis(d: { linkFinal: string | null; arquivos: { url: string; originalUrl: string | null }[]; aprovacoesVideo: { urlVideo: string; status: string }[] }): number {
  const grupos: Set<string>[] = []
  // A consulta fornece aprovações da mais recente para a mais antiga.
  const ultimas = new Map<string,string>()
  for (const a of d.aprovacoesVideo) { const id = identidadeEntregavel(a.urlVideo); if (!ultimas.has(id)) ultimas.set(id,a.status) }
  const pendentes = new Set([...ultimas].filter(([,status]) => status !== "aprovado").map(([id]) => id))
  // linkFinal é fallback legado, não um item adicional aos arquivos finais.
  for (const a of [...d.arquivos, ...(d.linkFinal && d.arquivos.length === 0 ? [{ url: d.linkFinal, originalUrl: null }] : [])]) {
    const ids = [a.url,a.originalUrl].filter((v): v is string => !!v?.trim()).map(identidadeEntregavel)
    if (!ids.length || ids.some(v => pendentes.has(v))) continue
    const conjunto = new Set(ids)
    for (let i=grupos.length-1;i>=0;i--) if ([...grupos[i]].some(v => conjunto.has(v))) { for (const v of grupos[i]) conjunto.add(v); grupos.splice(i,1) }
    grupos.push(conjunto)
  }
  return grupos.length
}
