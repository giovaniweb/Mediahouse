// Token opaco para identificar a origem de uma pessoa atribuível:
//   "vm:<id>"   → registro Videomaker
//   "ed:<id>"   → registro Editor
//   "user:<id>" → Usuario (tipo=social etc.)
export type OrigemEquipe = "vm" | "ed" | "user"

export function parseToken(token: string): { origem: OrigemEquipe; id: string } {
  const idx = token.indexOf(":")
  if (idx === -1) {
    // Compatibilidade: id puro = videomaker (comportamento legado)
    return { origem: "vm", id: token }
  }
  const prefix = token.slice(0, idx)
  const id = token.slice(idx + 1)
  const origem: OrigemEquipe = prefix === "ed" ? "ed" : prefix === "user" ? "user" : "vm"
  return { origem, id }
}
