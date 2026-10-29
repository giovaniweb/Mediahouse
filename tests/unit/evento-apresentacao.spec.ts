import { describe, expect, it } from "vitest"
import { StatusEventoGestao } from "@prisma/client"
import { COLUNAS_EVENTO } from "@/lib/evento-apresentacao"

// Só há o quadro (a Lista saiu em 29/10/2026): evento num status sem coluna
// sumiria da página de Eventos.
describe("quadro de eventos", () => {
  it("tem uma coluna para cada status do banco, ideia e cancelado inclusive", () => {
    expect([...COLUNAS_EVENTO].sort()).toEqual(Object.values(StatusEventoGestao).sort())
    expect(COLUNAS_EVENTO[0]).toBe("ideia")
    expect(COLUNAS_EVENTO.at(-1)).toBe("cancelado")
  })
})
