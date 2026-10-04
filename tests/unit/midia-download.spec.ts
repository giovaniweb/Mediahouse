import { describe, expect, it } from "vitest"
import { paraDownload } from "@/lib/midia-download"

describe("paraDownload", () => {
  it("pede anexo só à mídia privada, preservando o token", () => {
    expect(paraDownload("/api/midia/org/a/videos/d/1.mp4")).toBe("/api/midia/org/a/videos/d/1.mp4?download=1")
    expect(paraDownload("/api/midia/org/a/videos/d/1.mp4?token=t")).toBe("/api/midia/org/a/videos/d/1.mp4?token=t&download=1")
  })
  it("deixa link externo e vazio como vieram", () => {
    expect(paraDownload("https://drive.google.com/file/d/abc/view")).toBe("https://drive.google.com/file/d/abc/view")
    expect(paraDownload(null)).toBeNull()
    expect(paraDownload("")).toBeNull()
  })
})
