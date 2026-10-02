import { describe, expect, it } from "vitest"
import { conexaoBanco } from "@/lib/banco-conexao"
describe("conexões explícitas com RLS", () => {
  it.each(["app","auth","admin"] as const)("recusa conexão ausente para %s", tipo => {
    expect(() => conexaoBanco(tipo, { RLS_ATIVO: "sim", DIRECT_URL: "dono" })).toThrow("obrigatória")
  })
  it("auth/admin não herdam DATABASE_URL ao ativar isolamento", () => {
    for (const tipo of ["auth","admin"] as const) expect(() => conexaoBanco(tipo, { RLS_ATIVO: "sim", DATABASE_URL: "app" })).toThrow()
  })
  it("mantém transição legada e usa conexão própria quando presente", () => {
    expect(conexaoBanco("auth", { DATABASE_URL: "legado" })).toBe("legado")
    expect(conexaoBanco("admin", { RLS_ATIVO: "sim", ADMIN_DATABASE_URL: "admin", DIRECT_URL: "dono" })).toBe("admin")
  })
})
