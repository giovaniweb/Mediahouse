import { describe, it, expect } from "vitest"
import { payloadAuditoria } from "@/lib/auditoria"
describe("payload de auditoria por allowlist", () => {
  it("descarta segredos/fiscal/texto livre e objetos aninhados", () => {
    const p = payloadAuditoria({ token: "segredo", apiKey: "segredo", senhaHash: "segredo", cnpj: "123", pixKey: "123", email: "pessoa@example.invalid", motivo: "Bearer segredo", verCustos: true, conectado: false, extra: { token: "segredo" }, campos: ["cnpj", "pixKey", "email", "segredo", "apiKey", "email"] })
    expect(p).toEqual({ verCustos: true, conectado: false, campos: ["cnpj", "email", "pixKey"] })
    expect(JSON.stringify(p)).not.toContain("segredo")
  })
  it("recusa coerção, contador ilimitado e papel arbitrário", () => {
    expect(payloadAuditoria({ publicado: "true", erros: -1, alterados: Infinity, papel: "segredo", processados: 1.5 })).toEqual({})
    expect(payloadAuditoria({ publicado: true, alterados: 1, papel: "gestor", motivo: "erro_token" })).toEqual({ publicado: true, alterados: 1, papel: "gestor", motivo: "erro_token" })
  })
})
