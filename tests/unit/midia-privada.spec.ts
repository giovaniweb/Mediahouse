import { describe, it, expect } from "vitest"
import { caminhoMidia, urlDaMidia, caminhoDaUrl, organizacaoDoCaminho, comToken, partesDaMidia, caminhoMidiaValido } from "@/lib/midia"

// O bucket `uploads` é público: em 24/08/2026 um HEAD sem autenticação num PDF
// de briefing real devolveu 200. Qualquer pessoa com a URL baixa, para sempre.
//
// O bucket novo é privado e a leitura passa por /api/midia, que confere quem
// pede. O que estes testes travam é a mecânica que sustenta essa checagem: o
// dono precisa estar NO CAMINHO, e a distinção entre acervo antigo (público) e
// novo (privado) precisa ser inequívoca.

describe("caminho carrega a organização dona", () => {
  it("monta org/{id}/{tipo}/{id}/arquivo", () => {
    const c = caminhoMidia({ organizacaoId: "org-A", tipo: "docs", id: "dem-1", ext: "pdf" })
    expect(c).toMatch(/^org\/org-A\/docs\/dem-1\/\d+\.pdf$/)
  })

  it("normaliza a extensão com ponto", () => {
    expect(caminhoMidia({ organizacaoId: "o", tipo: "videos", id: "d", ext: ".mp4" })).toMatch(/\.mp4$/)
  })

  it("a organização é lida de volta do caminho — é assim que /api/midia decide", () => {
    const c = caminhoMidia({ organizacaoId: "org-B", tipo: "nf", id: "x", ext: "pdf" })
    expect(organizacaoDoCaminho(c)).toBe("org-B")
  })

  it("caminho fora do formato não tem dono, e a rota recusa", () => {
    // Caminhos do acervo antigo (`docs/{id}/...`) caem aqui: não são do bucket
    // privado e não podem ser servidos por /api/midia.
    expect(organizacaoDoCaminho("docs/dem-1/123.pdf")).toBeNull()
    expect(organizacaoDoCaminho("../../etc/passwd")).toBeNull()
  })
})

describe("distinguir acervo novo do antigo", () => {
  it("URL nossa devolve o caminho", () => {
    const c = "org/org-A/docs/dem-1/1.pdf"
    expect(caminhoDaUrl(urlDaMidia(c))).toBe(c)
  })

  it("URL pública antiga do Supabase NÃO é do bucket privado", () => {
    // Se isto passar a devolver caminho, o código trataria acervo antigo como
    // privado e a Contourline perderia acesso ao que já existe.
    expect(caminhoDaUrl("https://x.supabase.co/storage/v1/object/public/uploads/docs/a/1.pdf")).toBeNull()
    expect(caminhoDaUrl(null)).toBeNull()
    expect(caminhoDaUrl("")).toBeNull()
  })
})

describe("comToken — credencial de quem não tem conta", () => {
  it("anexa o token só na mídia privada", () => {
    expect(comToken("/api/midia/org/o/docs/d/1.pdf", "tok-1")).toBe("/api/midia/org/o/docs/d/1.pdf?token=tok-1")
  })

  it("deixa a URL pública antiga intacta — ela não precisa de token", () => {
    const antiga = "https://x.supabase.co/storage/v1/object/public/uploads/videos/a/1.mp4"
    expect(comToken(antiga, "tok-1")).toBe(antiga)
  })

  it("escapa o token, para não quebrar a querystring", () => {
    expect(comToken("/api/midia/org/o/docs/d/1.pdf", "a b&c")).toContain("token=a%20b%26c")
  })

  it("sem URL, não inventa", () => {
    expect(comToken(null, "t")).toBeNull()
  })
})

describe("acervo legado — cópia de 24/08 do bucket público", () => {
  // Formatos reais do banco de produção em 28/10/2026.
  it.each([
    ["org/o/legado/videos/dem-1/final/1777327198234.mp4", "videos", "dem-1"],
    ["org/o/legado/docs/dem-1/1785761313152.pdf", "docs", "dem-1"],
    ["org/o/legado/thumbnails/dem-1/1778763140746.jpg", "thumbnails", "dem-1"],
    ["org/o/legado/coberturas/cob-1/dia-1/video/1778883460122.mp4", "coberturas", "cob-1"],
  ])("lê tipo e id de dentro do legado: %s", (c, tipo, id) => {
    expect(partesDaMidia(c)).toEqual({ organizacaoId: "o", tipo, id })
    expect(caminhoDaUrl(urlDaMidia(c))).toBe(c)
    expect(organizacaoDoCaminho(c)).toBe("o")
  })

  it("o formato atual continua igual", () => {
    expect(partesDaMidia("org/o/videos/dem-1/final/1.mp4")).toEqual({ organizacaoId: "o", tipo: "videos", id: "dem-1" })
  })

  it.each(["org/o/legado/videos/dem-1", "org/o/legado/outro/x/1.mp4", "org/o/legado/legado/x/1.mp4", "org/o/legado/videos/../1.mp4", "legado/videos/d/1.mp4"])(
    "recusa legado incompleto ou ambíguo: %s", c => { expect(caminhoMidiaValido(c)).toBe(false) })
})
