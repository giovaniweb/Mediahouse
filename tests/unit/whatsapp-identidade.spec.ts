import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
import { telefoneCompleto, jidRecebidoVerificado } from "@/lib/whatsapp-identidade"
describe("telefone completo", () => {
  it("normaliza formatação sem usar sufixo", () => {
    for (const t of ["+55 (31) 99999-1001", "(31) 99999-1001", "5531999991001:2@s.whatsapp.net"]) expect(telefoneCompleto(t)).toBe("5531999991001")
    expect(telefoneCompleto("+1 (212) 555-1234")).toBe("12125551234")
    expect(telefoneCompleto("12125551234@s.whatsapp.net")).toBe("12125551234")
    expect(telefoneCompleto("99991001")).toBeNull(); expect(telefoneCompleto("5531999991001@lid")).toBeNull()
  })
  it("LID exige associação explícita na chave autenticada", () => {
    expect(jidRecebidoVerificado("123456789@lid", undefined)).toBeNull()
    expect(jidRecebidoVerificado("123456789@lid", "5531999991001@s.whatsapp.net")?.telefone).toBe("5531999991001")
    expect(jidRecebidoVerificado("123456789@g.us", "5531999991001@s.whatsapp.net")).toBeNull()
    expect(jidRecebidoVerificado("123456789@lid", "5531999991001@lid")).toBeNull()
  })
})
