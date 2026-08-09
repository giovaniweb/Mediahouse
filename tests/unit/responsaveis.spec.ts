import { describe, it, expect } from "vitest"
import { lerResponsaveisDoBody, whereResponsavel } from "@/lib/responsaveis"

// Esta é a lógica que corrige o bug do filtro por responsável: a UI manda
// `responsavelId` (singular, edição inline) OU `responsavelIds[]` (multi, Growth),
// e antes só o array reconstruía a tabela M2M — o caminho singular gravava apenas
// a coluna escalar e a demanda sumia do filtro. A distinção entre "não veio no
// body" (undefined = não mexer) e "veio vazio" ([] = limpar) é o coração disso.
describe("lerResponsaveisDoBody", () => {
  it("devolve undefined quando o campo não veio no body — não deve mexer nos responsáveis", () => {
    expect(lerResponsaveisDoBody({})).toBeUndefined()
    expect(lerResponsaveisDoBody({ titulo: "outra coisa" })).toBeUndefined()
  })

  it("aceita responsavelId singular (edição inline do modal)", () => {
    expect(lerResponsaveisDoBody({ responsavelId: "u1" })).toEqual(["u1"])
  })

  it("trata responsavelId vazio/null como pedido de limpar", () => {
    expect(lerResponsaveisDoBody({ responsavelId: "" })).toEqual([])
    expect(lerResponsaveisDoBody({ responsavelId: null })).toEqual([])
  })

  it("aceita responsavelIds[] (multi-responsável do Growth) e preserva a ordem", () => {
    expect(lerResponsaveisDoBody({ responsavelIds: ["u2", "u1", "u3"] })).toEqual(["u2", "u1", "u3"])
  })

  it("remove duplicados sem perder a primeira posição (o primeiro vira o principal)", () => {
    expect(lerResponsaveisDoBody({ responsavelIds: ["u1", "u2", "u1"] })).toEqual(["u1", "u2"])
  })

  it("descarta entradas vazias ou não-string vindas do cliente", () => {
    expect(lerResponsaveisDoBody({ responsavelIds: ["u1", "", null, 42, "u2"] })).toEqual(["u1", "u2"])
  })

  it("array vazio limpa os responsáveis", () => {
    expect(lerResponsaveisDoBody({ responsavelIds: [] })).toEqual([])
  })

  it("responsavelIds[] tem precedência sobre responsavelId quando os dois vêm", () => {
    expect(lerResponsaveisDoBody({ responsavelIds: ["u9"], responsavelId: "u1" })).toEqual(["u9"])
  })
})

describe("whereResponsavel", () => {
  it("procura na M2M e também na coluna derivada", () => {
    // Cobrir as duas é o que mantém visíveis as demandas antigas, criadas por
    // rotas que nunca populavam a M2M, enquanto o backfill não roda.
    const w = whereResponsavel("u1")
    expect(w).toEqual({
      OR: [{ responsaveis: { some: { usuarioId: "u1" } } }, { responsavelId: "u1" }],
    })
  })
})
