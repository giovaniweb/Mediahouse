import { describe, it, expect, vi, afterEach } from "vitest"
import { estaAtrasada, venceHoje, diasDeAtraso } from "@/lib/status"

afterEach(() => vi.useRealTimers())

// 24/08/2026, 09:00 em Brasília (12:00 UTC). É o horário em que o bug aparecia:
// o prazo de hoje é gravado como 24/08 00:00 UTC, já no passado pelo relógio,
// e a demanda nascia "atrasada" na manhã do próprio dia de entrega.
function manhaDeHoje() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"))
}

describe("estaAtrasada", () => {
  it("quem vence hoje NÃO está atrasada — tem o dia inteiro", () => {
    manhaDeHoje()
    expect(estaAtrasada({ dataLimite: "2026-08-24T00:00:00.000Z", statusVisivel: "producao" })).toBe(false)
  })

  it("prazo de ontem está atrasada", () => {
    manhaDeHoje()
    expect(estaAtrasada({ dataLimite: "2026-08-23T00:00:00.000Z", statusVisivel: "producao" })).toBe(true)
  })

  it("prazo de amanhã não está atrasada", () => {
    manhaDeHoje()
    expect(estaAtrasada({ dataLimite: "2026-08-25T00:00:00.000Z", statusVisivel: "producao" })).toBe(false)
  })

  it("sem prazo, e nas colunas de prazo pausado, nunca está atrasada", () => {
    manhaDeHoje()
    expect(estaAtrasada({ dataLimite: null, statusVisivel: "producao" })).toBe(false)
    expect(estaAtrasada({ dataLimite: "2026-08-01", statusVisivel: "aprovacao" })).toBe(false)
    expect(estaAtrasada({ dataLimite: "2026-08-01", statusVisivel: "finalizado" })).toBe(false)
  })
})

describe("venceHoje", () => {
  it("reconhece o prazo do dia — antes ele caía no grupo das atrasadas", () => {
    manhaDeHoje()
    expect(venceHoje({ dataLimite: "2026-08-24T00:00:00.000Z", statusVisivel: "producao" })).toBe(true)
    expect(venceHoje({ dataLimite: "2026-08-25T00:00:00.000Z", statusVisivel: "producao" })).toBe(false)
  })

  it("às 22h de Brasília ainda é hoje", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-25T01:00:00.000Z")) // 24/08 22:00 BRT
    expect(venceHoje({ dataLimite: "2026-08-24", statusVisivel: "producao" })).toBe(true)
  })
})

describe("diasDeAtraso", () => {
  it("conta dias inteiros de calendário", () => {
    manhaDeHoje()
    expect(diasDeAtraso({ dataLimite: "2026-08-21", statusVisivel: "producao" })).toBe(3)
  })

  it("é null quando não há atraso", () => {
    manhaDeHoje()
    expect(diasDeAtraso({ dataLimite: "2026-08-24", statusVisivel: "producao" })).toBeNull()
  })

  it("é null para as datas corrompidas do banco (ano 0001, ano 0026)", () => {
    manhaDeHoje()
    expect(diasDeAtraso({ dataLimite: "0026-06-29", statusVisivel: "producao" })).toBeNull()
  })
})
