import { describe, it, expect, beforeAll } from "vitest"
import { encryptSecret, decryptSecret } from "@/lib/secret-crypto"
import crypto from "node:crypto"

// O segredo do webhook tem dois lados, e eles são DIFERENTES:
//   banco → cifrado
//   URL   → texto plano
//
// Registrar o valor cifrado na URL manteve o recebimento morto por horas em
// 16/08/2026, e o pior é que tudo parecia certo: o segredo gravado no banco era
// idêntico ao registrado na Evolution. A conferência só falhava dentro do
// webhook, que decifra o do banco antes de comparar — e descartava com 200.
//
// Estes testes travam o contrato dos dois lados.
describe("segredo do webhook: banco cifrado, URL em texto plano", () => {
  beforeAll(() => {
    process.env.NEXTAUTH_SECRET ??= "chave-de-teste-nao-usada-em-producao"
  })

  // Réplica exata da comparação em api/whatsapp/webhook (segredoConfere).
  function webhookAceita(apresentadoNaUrl: string, guardadoNoBanco: string): boolean {
    try {
      const esperado = decryptSecret(guardadoNoBanco)
      const a = Buffer.from(apresentadoNaUrl)
      const b = Buffer.from(esperado)
      return a.length === b.length && crypto.timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  it("aceita quando a URL leva o texto plano e o banco guarda o cifrado", () => {
    const plano = crypto.randomBytes(24).toString("base64url")
    const noBanco = encryptSecret(plano)
    expect(webhookAceita(plano, noBanco)).toBe(true)
  })

  it("RECUSA quando a URL leva o valor cifrado — o bug que quebrou o recebimento", () => {
    const plano = crypto.randomBytes(24).toString("base64url")
    const noBanco = encryptSecret(plano)
    expect(webhookAceita(noBanco, noBanco)).toBe(false)
  })

  it("RECUSA quando o banco guardou texto plano em vez de cifrado", () => {
    const plano = crypto.randomBytes(24).toString("base64url")
    expect(webhookAceita(plano, plano)).toBe(false)
  })

  it("recusa segredo de outra instalação", () => {
    const noBanco = encryptSecret(crypto.randomBytes(24).toString("base64url"))
    const outro = crypto.randomBytes(24).toString("base64url")
    expect(webhookAceita(outro, noBanco)).toBe(false)
  })

  it("o cifrado tem formato iv.tag.texto e é bem maior que o plano", () => {
    const plano = crypto.randomBytes(24).toString("base64url")
    const cifrado = encryptSecret(plano)
    expect(cifrado.split(".")).toHaveLength(3)
    expect(cifrado.length).toBeGreaterThan(plano.length)
    // É esta diferença de tamanho que denuncia o valor errado numa URL: 32
    // caracteres é segredo; 80 e poucos com pontos é o cifrado vazando.
    expect(plano.length).toBe(32)
  })

  it("decifrar devolve exatamente o que foi cifrado", () => {
    const plano = crypto.randomBytes(24).toString("base64url")
    expect(decryptSecret(encryptSecret(plano))).toBe(plano)
  })
})
