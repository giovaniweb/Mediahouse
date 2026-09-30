import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { precisaTranscode, precisaTranscodeConferindo, enqueueTranscode } from "@/lib/transcode"

const mocks = vi.hoisted(() => ({ arquivo: vi.fn(), demanda: vi.fn(), assinar: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { arquivo: { findFirst: mocks.arquivo }, demanda: { findFirst: mocks.demanda } } }))
vi.mock("@/lib/midia", async importOriginal => ({ ...await importOriginal<object>(), urlAssinadaDeLeitura: mocks.assinar }))
const contexto = { organizacaoId: "org-a", demandaId: "abc", arquivoId: "arquivo-a" }
const publica = "https://storage.test/storage/v1/object/public/uploads/videos/abc/final/12345"
const privada = "/api/midia/org/org-a/videos/abc/final/original.mov"
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.test")
  vi.stubEnv("TRANSCODE_WORKER_URL", "https://worker.test")
  vi.stubEnv("TRANSCODE_SECRET", "teste")
  mocks.arquivo.mockReset().mockResolvedValue({ id: "arquivo-a" })
  mocks.demanda.mockReset().mockResolvedValue({ id: "abc" })
  mocks.assinar.mockReset().mockResolvedValue("https://storage.test/signed")
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

// Simula o HEAD do arquivo devolvendo um content-type.
function comTipo(tipo: string | null) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, headers: { get: () => tipo },
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
    expect(await precisaTranscodeConferindo(publica, contexto)).toBe(true)
  })

  it("não converte o que já é mp4 sem extensão", async () => {
    comTipo("video/mp4")
    expect(await precisaTranscodeConferindo(publica, contexto)).toBe(false)
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


describe("conversão exige fonte vinculada e confiável", () => {
  it("assina o objeto privado somente após confirmar o registro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 202 }))
    expect(await enqueueTranscode({ ...contexto, sourceUrl: privada })).toBe(true)
    expect(mocks.arquivo).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ demandaId: "abc", demanda: { organizacaoId: "org-a" } }) }))
    expect(mocks.assinar).toHaveBeenCalledWith("org/org-a/videos/abc/final/original.mov", 7200)
    expect(fetch).toHaveBeenCalledWith("https://worker.test/transcode", expect.objectContaining({ redirect: "error" }))
  })
  it.each(["http://127.0.0.1/secret.mov", "https://evil.test/video.mov", "/api/midia/org/org-b/videos/abc/final/v.mov", "/api/midia/org/org-a/videos/outra/final/v.mov", "https://storage.test.evil.test/storage/v1/object/public/uploads/videos/abc/v.mov"])("não baixa nem encaminha %s", async sourceUrl => {
    vi.stubGlobal("fetch", vi.fn())
    expect(await enqueueTranscode({ ...contexto, sourceUrl })).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.assinar).not.toHaveBeenCalled()
  })
  it("não assina um caminho que não está vinculado ao registro", async () => {
    mocks.arquivo.mockResolvedValue(null)
    vi.stubGlobal("fetch", vi.fn())
    expect(await enqueueTranscode({ ...contexto, sourceUrl: privada })).toBe(false)
    expect(mocks.assinar).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it("falha de assinatura não encaminha a URL original ao worker", async () => {
    mocks.assinar.mockResolvedValue(null)
    vi.stubGlobal("fetch", vi.fn())
    expect(await enqueueTranscode({ ...contexto, sourceUrl: privada })).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("legado exige linkFinal exato na mesma organização", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 202 }))
    expect(await enqueueTranscode({ organizacaoId: "org-a", demandaId: "abc", sourceUrl: publica })).toBe(true)
    expect(mocks.demanda).toHaveBeenCalledWith({ where: { id: "abc", organizacaoId: "org-a", linkFinal: publica }, select: { id: true } })
  })
  it("HEAD não segue redirecionamentos nem interpreta resposta de erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, headers: { get: () => "video/quicktime" } }))
    expect(await precisaTranscodeConferindo(publica, contexto)).toBe(false)
    expect(fetch).toHaveBeenCalledWith(publica, expect.objectContaining({ redirect: "error" }))
  })
  it("HEAD externo e sem contexto não faz rede", async () => {
    vi.stubGlobal("fetch", vi.fn())
    expect(await precisaTranscodeConferindo("https://evil.test/sem-extensao", contexto)).toBe(false)
    expect(await precisaTranscodeConferindo(publica)).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})
