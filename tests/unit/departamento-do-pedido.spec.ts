import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { departamentoDoPedido } from "@/lib/departamento-do-pedido"

// O "Nova demanda" gravava todo pedido de vídeo como "growth", o departamento
// do quadro de arte.
describe("departamento do pedido (Nova demanda)", () => {
  it("vídeo é do Audiovisual, nunca Growth", () => {
    expect(departamentoDoPedido("video")).toBe("audiovisual")
  })
  it("cobertura segue em Eventos", () => {
    expect(departamentoDoPedido("cobertura")).toBe("eventos")
  })
  it("o modal usa a regra, sem departamento escrito à mão", () => {
    const modal = readFileSync("src/components/demandas/NovaDemandaModal.tsx", "utf8")
    expect(modal).toContain("departamentoDoPedido(tipo)")
    expect(modal).not.toMatch(/["']growth["']/)
  })
})
