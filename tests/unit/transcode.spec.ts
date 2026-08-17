import { describe, it, expect, vi, afterEach } from "vitest"
import { precisaTranscode, precisaTranscodeConferindo } from "@/lib/transcode"

afterEach(() => vi.unstubAllGlobals())

// Simula o HEAD do arquivo devolvendo um content-type.
function comTipo(tipo: string | null) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    headers: { get: () => tipo },
  })))
}

describe("precisaTranscode (só a extensão)", () => {
  it("reconhece .mov e .qt", () => {
    expect(precisaTranscode("https://x/v.mov")).toBe(true)
    expect(precisaTranscode("https://x/v.QT")).toBe(true)
  })

  it("ignora query string", () => {
    expect(precisaTranscode("https://x/v.mov?token=abc")).toBe(true)
  })

  it("não marca mp4", () => {
    expect(precisaTranscode("https://x/v.mp4")).toBe(false)
  })

  it("é cega para arquivo sem extensão — o bug de 16/08/2026", () => {
    // Nove vídeos HEVC ficaram três meses assim: sem extensão, sem conversão,
    // chegando ao cliente como quicktime que o Chrome não reproduz.
    expect(precisaTranscode("https://x/uploads/videos/abc/final/12345")).toBe(false)
  })
})

describe("precisaTranscodeConferindo (pergunta ao arquivo)", () => {
  it("pega o quicktime disfarçado de arquivo sem extensão", async () => {
    comTipo("video/quicktime")
    expect(await precisaTranscodeConferindo("https://x/uploads/videos/abc/final/12345")).toBe(true)
  })

  it("não converte o que já é mp4 sem extensão", async () => {
    comTipo("video/mp4")
    expect(await precisaTranscodeConferindo("https://x/uploads/videos/abc/final/12345")).toBe(false)
  })

  it("não vai à rede quando a extensão já decide", async () => {
    const espiao = vi.fn()
    vi.stubGlobal("fetch", espiao)
    expect(await precisaTranscodeConferindo("https://x/v.mov")).toBe(true)
    expect(await precisaTranscodeConferindo("https://x/v.mp4")).toBe(false)
    expect(espiao).not.toHaveBeenCalled()
  })

  it("falha de rede não quebra o upload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout") }))
    expect(await precisaTranscodeConferindo("https://x/uploads/abc/12345")).toBe(false)
  })

  it("url vazia é ignorada", async () => {
    expect(await precisaTranscodeConferindo(null)).toBe(false)
    expect(await precisaTranscodeConferindo("")).toBe(false)
  })
})
