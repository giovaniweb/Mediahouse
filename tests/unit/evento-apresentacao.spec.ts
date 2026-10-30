import { describe, expect, it } from "vitest"
import { StatusEventoGestao } from "@prisma/client"
import { COLUNAS_EVENTO, colunaDoEvento, ehStatusDeEvento } from "@/lib/evento-apresentacao"

// Só há o quadro (a Lista saiu em 29/10/2026): evento num status sem coluna
// sumiria da página de Eventos. "Ideia" não é etapa daqui (não há pré-agenda).
describe("quadro de eventos", () => {
  it("todo status do banco cai numa coluna; o antigo \"ideia\" cai em Planejamento", () => {
    for (const status of Object.values(StatusEventoGestao)) expect(COLUNAS_EVENTO, status).toContain(colunaDoEvento(status))
    expect(colunaDoEvento("ideia")).toBe("planejamento")
  })
  it("as colunas vão de Planejamento a Cancelado, sem Ideia", () => {
    expect(COLUNAS_EVENTO).toEqual(["planejamento", "orcamento", "aprovacao", "producao", "execucao", "finalizado", "cancelado"])
  })
  it("\"ideia\" e texto solto não são status que se grava", () => {
    expect(ehStatusDeEvento("ideia")).toBe(false)
    expect(ehStatusDeEvento("qualquer")).toBe(false)
    expect(ehStatusDeEvento("cancelado")).toBe(true)
  })
})
