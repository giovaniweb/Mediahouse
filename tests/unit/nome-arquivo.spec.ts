import { describe, it, expect } from "vitest"
import { ehImagem, extensaoDe, nomeParaMostrar } from "@/lib/nome-arquivo"

describe("nomeParaMostrar", () => {
  it("mantém o nome que a pessoa deu ao arquivo", () => {
    expect(nomeParaMostrar("Briefing campanha.pdf", 1)).toBe("Briefing campanha.pdf")
    expect(nomeParaMostrar("logo_final_v2.png", 3)).toBe("logo_final_v2.png")
    expect(nomeParaMostrar("2026.pdf", 1)).toBe("2026.pdf")
  })

  it("troca o código do armazenamento por tipo e número", () => {
    expect(nomeParaMostrar("243f1e79-4c1a-4e8b-9d2f-0a1b2c3d4e5f.jpg", 1)).toBe("Imagem 1")
    expect(nomeParaMostrar("243f1e794c1a4e8b9d2f0a1b2c3d4e5f.JPG", 2)).toBe("Imagem 2")
    expect(nomeParaMostrar("1759690000000.pdf", 1)).toBe("PDF 1")
    expect(nomeParaMostrar("1759690000000.xlsx", 4)).toBe("Planilha 4")
    expect(nomeParaMostrar("1759690000000.bin", 1)).toBe("Arquivo 1")
    expect(nomeParaMostrar("", 1)).toBe("Arquivo 1")
  })

  it("reconhece imagem pela extensão", () => {
    expect(extensaoDe("a.b.JPEG")).toBe("jpeg")
    expect(ehImagem("x.webp")).toBe(true)
    expect(ehImagem("x.pdf")).toBe(false)
    expect(ehImagem("sem-extensao")).toBe(false)
  })
})
