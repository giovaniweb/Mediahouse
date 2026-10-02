import { describe, it, expect } from "vitest"
import { intervaloCalendario, recorteMetricas } from "@/lib/metricas-recorte"
describe("intervalo de custos", () => {
  it("mantém os dois limites e compartilha o contrato dos relatórios", () => {
    const f = intervaloCalendario("2026-09-01","2026-09-30")
    const r = recorteMetricas(new URLSearchParams({ de: "2026-09-01", ate: "2026-09-30" }))
    expect(f.gte?.toISOString()).toBe(r.inicio); expect(f.lt?.toISOString()).toBe(r.fim)
    expect(f).toEqual({ gte: new Date("2026-09-01T03:00Z"), lt: new Date("2026-10-01T03:00Z") })
  })
  it("permite limites independentes e ausência de filtro", () => {
    expect(intervaloCalendario(null,null)).toEqual({})
    expect(intervaloCalendario("2026-09-01",null)).toEqual({ gte: new Date("2026-09-01T03:00Z") })
    expect(intervaloCalendario(null,"2026-09-30")).toEqual({ lt: new Date("2026-10-01T03:00Z") })
  })
  it.each([["2026-02-30",null,"de"],[null,"2026-13-01","ate"],["2026-09-30","2026-09-01","ate"],["",null,"de"]])("valida %s e %s com erro de campo", (de,ate,campo) => {
    expect(() => intervaloCalendario(de,ate)).toThrow()
    try { intervaloCalendario(de,ate) } catch (e) { expect(e).toMatchObject({ campo }) }
  })
})
