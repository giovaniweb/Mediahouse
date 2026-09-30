import { describe, it, expect } from "vitest"
import { estimarGrupoIA } from "@/lib/ia-precos"
describe("preços de referência por modelo e categoria", () => {
  it.each([["claude-haiku-4-5", 6.1], ["claude-sonnet-4-5", 18.3], ["claude-opus-4-6", 30.5]])("calcula %s", (modelo, valor) => {
    expect(estimarGrupoIA(modelo as string, { entrada: 1000000, saida: 1000000, leitura: 1000000 })).toBeCloseTo(valor as number)
  })
  it("não inventa preço de modelo ou uso desconhecido", () => {
    expect(estimarGrupoIA("constructor", { entrada: 1, saida: 1, leitura: 0 })).toBeNull()
    expect(estimarGrupoIA("desconhecido", { entrada: 1, saida: 1, leitura: 0 })).toBeNull()
    expect(estimarGrupoIA("claude-haiku-4-5", { entrada: -1, saida: 1, leitura: 0 })).toBeNull()
  })
  it("preserva custo pequeno e zero conhecidos", () => {
    expect(estimarGrupoIA("claude-haiku-4-5", { entrada: 1, saida: 0, leitura: 0 })).toBe(0.000001)
    expect(estimarGrupoIA("claude-haiku-4-5", { entrada: 0, saida: 0, leitura: 0 })).toBe(0)
  })
})
