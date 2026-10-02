import { describe, it, expect } from "vitest"
import { validarBancoTeste } from "../../scripts/lib/banco-teste.mjs"
describe("proteção do banco de integração", () => {
  it("aceita apenas destino local explicitamente identificado", () => {
    expect(validarBancoTeste("postgresql://postgres@127.0.0.1:55439/nuflow_test")).toContain("nuflow_test")
  })
  it.each([undefined, "postgresql://user@db.supabase.co:5432/nuflow_test", "postgresql://user@localhost:5432/nuflow_test", "postgresql://user@127.0.0.1:5432/producao", "postgresql://user@127.0.0.1/nuflow_test", "postgresql://user@127.0.0.1:5432/nuflow_test?host=externo", "postgresql://user@127.0.0.1:5432/nuflow_test#x"])("recusa destino ambíguo ou remoto: %s", (url) => {
    expect(() => validarBancoTeste(url)).toThrow()
  })
})
