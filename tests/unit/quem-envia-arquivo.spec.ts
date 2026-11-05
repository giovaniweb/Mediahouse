import { describe, expect, it } from "vitest"
import { podeEnviarPeloCard } from "@/lib/quem-envia-arquivo"

// A parte da régua que não depende do banco: quem já está no escopo do card e
// não é gestão nem tem "Editar Demanda" (lib/quem-envia-arquivo). O escopo e a
// permissão têm o teste de integração tests/integration/envio-arquivo-por-pessoa.
const card = {
  solicitanteId: "sol",
  responsavelId: "resp",
  responsaveis: [{ usuarioId: "resp-m2m" }],
  editor: { usuarioId: "editor" },
  designer: { usuarioId: "designer" },
}

describe("quem sobe arquivo pelo card", () => {
  it("quem faz a peça sobe qualquer arquivo", () => {
    for (const quem of ["resp", "resp-m2m", "editor", "designer"]) {
      for (const arquivo of ["final", "brutos", "thumbnail", "documento"] as const) {
        expect(podeEnviarPeloCard(quem, card, arquivo)).toBe(true)
      }
    }
  })

  it("o solicitante anexa documento no próprio pedido, mas não sobe a entrega", () => {
    expect(podeEnviarPeloCard("sol", card, "documento")).toBe(true)
    expect(podeEnviarPeloCard("sol", card, "final")).toBe(false)
    expect(podeEnviarPeloCard("sol", card, "brutos")).toBe(false)
    expect(podeEnviarPeloCard("sol", card, "thumbnail")).toBe(false)
  })

  it("o videomaker e quem não está no card não sobem nada por aqui", () => {
    for (const arquivo of ["final", "brutos", "thumbnail", "documento"] as const) {
      expect(podeEnviarPeloCard("vm", card, arquivo)).toBe(false)
    }
    // Card sem editor nem designer: nulo não casa com ninguém.
    expect(podeEnviarPeloCard("x", { ...card, responsavelId: null, editor: null, designer: { usuarioId: null } }, "final")).toBe(false)
  })
})
