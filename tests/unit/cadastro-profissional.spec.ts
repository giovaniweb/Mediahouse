import { describe, it, expect } from "vitest"
import { linkDePortfolio } from "@/lib/cadastro-profissional"

describe("linkDePortfolio", () => {
  it("completa o https de quem digita só o endereço", () => {
    expect(linkDePortfolio("instagram.com/fulano")).toBe("https://instagram.com/fulano")
    expect(linkDePortfolio(" https://behance.net/x ")).toBe("https://behance.net/x")
  })
  it("recusa o que não é link http(s)", () => {
    for (const t of ["javascript:alert(1)", "data:text/html,x", "ftp://a.b/c", "fulano", "@fulano"]) expect(linkDePortfolio(t), t).toBeNull()
  })
  it("vazio é ausência", () => {
    expect(linkDePortfolio("")).toBeNull()
    expect(linkDePortfolio("   ")).toBeNull()
    expect(linkDePortfolio(undefined)).toBeNull()
  })
})
