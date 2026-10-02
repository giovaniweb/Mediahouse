/** IDs exatos em URLs oficiais; substring não comprova propriedade do arquivo. */
export function driveFileId(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(u.hostname)) return null
    const id = u.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? u.searchParams.get("id")
    return id && /^[a-zA-Z0-9_-]{10,}$/.test(id) ? id : null
  } catch { return null }
}
