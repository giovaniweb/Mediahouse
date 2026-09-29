import { describe, it, expect } from "vitest"
import { recorteMetricas } from "@/lib/metricas-recorte"
import { contarEntregaveis } from "@/lib/metricas-entregaveis"
import { marcadorConclusao } from "@/lib/job-transicoes"
const agora = new Date("2026-09-29T01:00:00Z")
describe("recortes determinísticos", () => {
  it("usa dia brasileiro, fim exclusivo e alias Growth", () => {
    expect(recorteMetricas(new URLSearchParams({ periodo: "mes", area: "growth" }),agora)).toMatchObject({ area: "design", de: "2026-09-01", ate: "2026-09-28", inicio: "2026-09-01T03:00:00.000Z", fim: "2026-09-29T03:00:00.000Z" })
  })
  it("inclui último dia do mês e semana de sete dias inteiros", () => {
    expect(recorteMetricas(new URLSearchParams({ mes: "2024-02" }),agora)).toMatchObject({ de: "2024-02-01", ate: "2024-02-29", fim: "2024-03-01T03:00:00.000Z" })
    expect(recorteMetricas(new URLSearchParams({ periodo: "semana" }),agora).de).toBe("2026-09-22")
  })
  it.each(["periodo=x", "area=eventos", "mes=2026-13", "de=2026-02-30&ate=2026-03-01", "de=2026-09-30&ate=2026-09-01", "periodo=custom", "fuso=UTC"])("recusa %s", qs => expect(() => recorteMetricas(new URLSearchParams(qs),agora)).toThrow())
})
describe("identidade de entregáveis", () => {
  it("deduplica link, variantes Drive e original preservado", () => {
    expect(contarEntregaveis({ linkFinal: "https://drive.google.com/open?id=abc", arquivos: [{ url: "https://drive.google.com/file/d/abc/view", originalUrl: "https://example.invalid/a.mp4" }, { url: "https://example.invalid/a.mp4", originalUrl: null }, { url: "https://example.invalid/b.mp4", originalUrl: null }], aprovacoesVideo: [] })).toBe(2)
  })
  it("não soma o link legado a um arquivo final com URL migrada sem identidade conhecida", () => {
    expect(contarEntregaveis({ linkFinal: "https://example.invalid/antigo.mp4", arquivos: [{ url: "https://drive.google.com/file/d/novo/view", originalUrl: null }], aprovacoesVideo: [] })).toBe(1)
  })
  it("não conta link pendente nem arquivo bruto e distingue URLs sem identidade conhecida", () => {
    expect(contarEntregaveis({ linkFinal: "https://example.invalid/a", arquivos: [], aprovacoesVideo: [{ urlVideo: "https://example.invalid/a", status: "pendente" }] })).toBe(0)
  })
})
it("reabertura limpa data; nova conclusão marca agora; transição final-final preserva", () => {
  const antiga = new Date("2026-09-01T12:00:00Z")
  expect(marcadorConclusao({ statusVisivel: "finalizado", finalizadaEm: antiga }, "edicao",agora).finalizadaEm).toBeNull()
  expect(marcadorConclusao({ statusVisivel: "edicao", finalizadaEm: null }, "finalizado",agora).finalizadaEm).toBe(agora)
  expect(marcadorConclusao({ statusVisivel: "finalizado", finalizadaEm: antiga }, "finalizado",agora).finalizadaEm).toBe(antiga)
})
