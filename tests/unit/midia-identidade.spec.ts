import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { identificarMidia, videoDaDemanda } from "@/lib/midia-identidade"

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.test"))
afterEach(() => vi.unstubAllEnvs())
describe("identidade da mídia", () => {
  it("link do app e assinatura expirada identificam o mesmo objeto", () => {
    const objeto = "org/a/videos/d/final/v.mov"
    expect(identificarMidia(`/api/midia/${objeto}`)).toEqual(identificarMidia(`https://storage.test/storage/v1/object/sign/midia/${objeto}?token=expirado`))
  })
  it("reconhece o acervo público somente no host configurado", () => {
    expect(identificarMidia("https://storage.test/storage/v1/object/public/uploads/videos/d/v.mp4")).toEqual({ provedor: "supabase", bucket: "uploads", objectKey: "videos/d/v.mp4" })
    expect(identificarMidia("https://storage.test.evil.test/storage/v1/object/public/uploads/videos/d/v.mp4")?.provedor).toBe("externo")
  })
  it("Drive conserva seu fileId separado da referência de reprodução", () => {
    expect(identificarMidia("https://drive.google.com/file/d/abc-123/view?usp=sharing")).toEqual({ provedor: "drive", fileId: "abc-123" })
    expect(videoDaDemanda(identificarMidia("https://drive.google.com/open?id=abc-123"), "a", "d")).toBe(false)
  })
  it.each(["javascript:alert(1)", "https://user:senha@storage.test/video", "/api/midia/org/a/videos/d/../outra/v.mov", "https://storage.test/storage/v1/object/public/uploads/videos/d/%2e%2e/d/v.mov", "https://storage.test/storage/v1/object/public/uploads/videos/d/a%2fb.mov"])("recusa referência ambígua %s", valor => {
    expect(identificarMidia(valor)).toBeNull()
  })
  it("o mesmo registro em outra demanda/organização não autoriza o objeto", () => {
    const id = identificarMidia("/api/midia/org/a/videos/d/final/v.mov")
    expect(videoDaDemanda(id, "a", "d")).toBe(true)
    expect(videoDaDemanda(id, "b", "d")).toBe(false)
    expect(videoDaDemanda(id, "a", "e")).toBe(false)
  })
})
