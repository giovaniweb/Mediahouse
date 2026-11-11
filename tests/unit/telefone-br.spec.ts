import { describe, expect, it } from "vitest"
import { DDDS_BR, validarWhatsappBR } from "@/lib/telefone-br"

// "Enviar para um WhatsApp" (11/11/2026): o número digitado na hora só passa
// se for do Brasil, com DDD que existe.
describe("validarWhatsappBR", () => {
  it("aceita o celular nas formas de sempre e devolve o número com 55", () => {
    for (const t of ["(41) 99876-5432", "41998765432", "+55 41 99876 5432", "55 (41) 9 9876-5432", "041998765432", "0055 41 99876-5432"]) {
      expect(validarWhatsappBR(t)).toEqual({ ok: true, telefone: "5541998765432", legivel: "(41) 99876-5432" })
    }
  })
  it("aceita fixo com 10 números", () => {
    expect(validarWhatsappBR("(11) 3456-7890")).toEqual({ ok: true, telefone: "551134567890", legivel: "(11) 3456-7890" })
  })
  it("recusa DDD que não existe", () => {
    for (const t of ["(20) 99876-5432", "(23) 99876-5432", "(10) 3456-7890", "(29) 99876-5432"]) {
      const r = validarWhatsappBR(t)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.erro).toMatch(/DDD/)
    }
  })
  it("recusa celular de 11 números sem o 9, número curto ou longo demais", () => {
    expect(validarWhatsappBR("(41) 89876-5432")).toMatchObject({ ok: false, erro: expect.stringMatching(/começa com 9/) })
    expect(validarWhatsappBR("98765432")).toMatchObject({ ok: false, erro: expect.stringMatching(/Faltam/) })
    expect(validarWhatsappBR("4199876543210")).toMatchObject({ ok: false, erro: expect.stringMatching(/demais/) })
  })
  it("recusa número de fora e texto", () => {
    expect(validarWhatsappBR("+1 415 555 0100")).toMatchObject({ ok: false, erro: expect.stringMatching(/Brasil/) })
    expect(validarWhatsappBR("liga pra Maria")).toMatchObject({ ok: false })
    expect(validarWhatsappBR("")).toMatchObject({ ok: false })
    expect(validarWhatsappBR(null)).toMatchObject({ ok: false })
  })
  it("tem os 67 DDDs da Anatel", () => {
    expect(DDDS_BR.size).toBe(67)
  })
})
