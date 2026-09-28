import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cifrarTokenDrive, lerTokenDrive, validarChaveIntegracao } from "@/lib/integration-secret"
const antiga = Buffer.alloc(32, 1).toString("base64"), nova = Buffer.alloc(32, 2).toString("base64")
beforeEach(() => { vi.stubEnv("INTEGRATION_ENCRYPTION_KEYS", JSON.stringify({ k1: antiga })); vi.stubEnv("INTEGRATION_ENCRYPTION_KEY_ID", "k1") })
afterEach(() => vi.unstubAllEnvs())
describe("credencial Drive versionada", () => {
  it("cifra autenticada usa IV aleatório e vincula empresa", () => {
    const a = cifrarTokenDrive("token-sintetico", "a"), b = cifrarTokenDrive("token-sintetico", "a")
    expect(a).not.toBe(b); expect(a).not.toContain("token-sintetico")
    expect(lerTokenDrive(a, "a")).toBe("token-sintetico")
    expect(() => lerTokenDrive(a, "b")).toThrow()
  })
  it("rotação mantém leitura de chave anterior", () => {
    const a = cifrarTokenDrive("antigo", "a")
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEYS", JSON.stringify({ k1: antiga, k2: nova })); vi.stubEnv("INTEGRATION_ENCRYPTION_KEY_ID", "k2")
    expect(lerTokenDrive(a, "a")).toBe("antigo")
    expect(cifrarTokenDrive("novo", "a")).toMatch(/^nuflow-secret:1:k2:/)
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEYS", JSON.stringify({ k2: nova }))
    expect(() => lerTokenDrive(a, "a")).toThrow()
  })
  it("não usa chave de sessão como fallback", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEYS", "{}"); vi.stubEnv("NEXTAUTH_SECRET", "segredo-de-sessao")
    expect(() => cifrarTokenDrive("token", "a")).toThrow()
  })
  it.each(["{}", '{"k1":"curta"}', "invalid-json"])("recusa configuração inválida: %s", keys => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEYS", keys); expect(() => validarChaveIntegracao()).toThrow()
  })
  it("adulteração ou versão desconhecida não vira texto legado", () => {
    const a = cifrarTokenDrive("token", "a")
    expect(() => lerTokenDrive(a.replace(":1:", ":2:"), "a")).toThrow()
    expect(() => lerTokenDrive(a + ":extra", "a")).toThrow()
    const partes = a.split(":"); partes[4] = "AAAAAAAAAAAAAAAAAAAAAA"
    expect(() => lerTokenDrive(partes.join(":"), "a")).toThrow()
  })
  it("lê legado explicitamente sem regravar nem exigir chave", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEYS", "{}"); expect(lerTokenDrive("legado", "a")).toBe("legado")
    expect(() => lerTokenDrive("legado", "")).toThrow()
  })
})
