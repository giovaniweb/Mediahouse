import { describe, expect, it } from "vitest"
import { metadadosFonte } from "@/lib/arquivo-fonte"

describe("metadados da fonte", () => {
  it("guarda bucket e chave sem depender do link de reprodução", () => {
    expect(metadadosFonte("/api/midia/org/a/videos/d/original.mov", "a", "d")).toEqual({ fonteProvedor: "supabase", fonteBucket: "midia", fonteObjectKey: "org/a/videos/d/original.mov", fonteVersao: 1 })
  })
  it("não infere organização de um caminho de outra empresa ou demanda", () => {
    expect(metadadosFonte("/api/midia/org/b/videos/d/v.mp4", "a", "d")).toEqual({})
    expect(metadadosFonte("/api/midia/org/a/videos/outra/v.mp4", "a", "d")).toEqual({})
  })
  it("documento recebido pelo WhatsApp conserva o caminho original", () => {
    expect(metadadosFonte("/api/midia/org/a/docs/whatsapp/1.pdf", "a", "d").fonteObjectKey).toBe("org/a/docs/whatsapp/1.pdf")
  })
  it("Drive é referência de origem, sem substituir o link por uma cópia", () => {
    expect(metadadosFonte("https://drive.google.com/file/d/abc/view", "a", "d")).toEqual({ fonteProvedor: "drive", fonteReferencia: "abc", fonteVersao: 1 })
  })
  it("não inventa mime, checksum ou identidade para legado inválido", () => {
    expect(metadadosFonte("legado-desconhecido", "a", "d")).toEqual({})
    expect(metadadosFonte("https://example.com/video", "a", "d")).not.toHaveProperty("fonteSha256")
  })
})
