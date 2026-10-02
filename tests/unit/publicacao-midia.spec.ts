import { describe, it, expect } from "vitest"
import { caminhoMidiaValido, caminhoDaUrl } from "@/lib/midia"
import { urlPublicavel, numeroPagina } from "@/lib/publicacao-midia"
import { driveFileId } from "@/lib/drive-file-id"
describe("fronteira de publicação", () => {
  it.each(["org/a/videos/../1.mp4", "org/a/videos/%2e%2e/1.mp4", "org/a/videos/d//1.mp4", "org/a/videos/d/1.mp4?x=1", "org/a/videos/d/1.mp4#x", "org/a/videos/d\\x/1.mp4", "org/a/outro/d/1.mp4"])("recusa caminho ambíguo %s", c => { expect(caminhoMidiaValido(c)).toBe(false); expect(caminhoDaUrl(`/api/midia/${c}`)).toBeNull() })
  it("vincula o tipo, empresa e demanda, sem promover documentos", () => {
    expect(urlPublicavel("/api/midia/org/a/videos/d/final/1.mp4", "a", "d")).toBe(true)
    for (const u of ["/api/midia/org/b/videos/d/1.mp4", "/api/midia/org/a/videos/outra/1.mp4", "/api/midia/org/a/docs/d/1.pdf", "/api/midia/org/a/nf/d/1.pdf", "javascript:alert(1)", "https://user:pass@example.com/a"]) expect(urlPublicavel(u,"a","d")).toBe(false)
  })
  it("id do Drive é exato e de domínio oficial", () => {
    expect(driveFileId("https://drive.google.com/file/d/arquivo123456/view")).toBe("arquivo123456")
    expect(driveFileId("https://evil.invalid/file/d/arquivo123456/view")).toBeNull()
  })
  it("paginação recusa NaN, infinito e negativos", () => {
    for (const n of [null,"x","Infinity","-1","0"]) expect(numeroPagina(n,24,48)).toBe(24)
    expect(numeroPagina("100",24,48)).toBe(48)
  })
})
