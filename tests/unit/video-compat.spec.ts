import { describe, it, expect } from "vitest"
import { analisarBytesDeVideo } from "@/lib/video-compat"

// Monta um buffer com marcadores de codec, como num cabeçalho de MP4/MOV.
function bytesCom(...marcas: string[]): Uint8Array {
  const texto = "ftypqt  ....moov...." + marcas.join("....") + "....mdat"
  return new Uint8Array([...texto].map((c) => c.charCodeAt(0)))
}

describe("compatibilidade do vídeo com o navegador de quem aprova", () => {
  it("recusa HEVC — é o formato do iPhone que o Chrome não toca", () => {
    const r = analisarBytesDeVideo(bytesCom("hvc1"), "IMG_1234.mov")
    expect(r.compativel).toBe(false)
    if (!r.compativel) expect(r.comoResolver).toContain("H.264")
  })

  it("reconhece a outra grafia do HEVC", () => {
    expect(analisarBytesDeVideo(bytesCom("hev1"), "v.mp4").compativel).toBe(false)
  })

  it("aceita H.264", () => {
    expect(analisarBytesDeVideo(bytesCom("avc1"), "v.mp4").compativel).toBe(true)
  })

  it("com as duas faixas, o H.264 manda — recusar seria alarme falso", () => {
    expect(analisarBytesDeVideo(bytesCom("hvc1", "avc1"), "v.mov").compativel).toBe(true)
  })

  it("sem marca de codec, .mov ainda é suspeito", () => {
    // Vídeo de câmera guarda o índice no fim do arquivo: a amostra do começo
    // não tem o codec, e a extensão é o único palpite que resta.
    const semMarca = new Uint8Array([...'ftypqt  ....mdat'].map(c => c.charCodeAt(0)))
    expect(analisarBytesDeVideo(semMarca, "IMG_0001.MOV").compativel).toBe(false)
  })

  it("sem marca e sem .mov, deixa passar — o aviso não pode atrapalhar", () => {
    const semMarca = new Uint8Array([...'ftypisom....mdat'].map(c => c.charCodeAt(0)))
    expect(analisarBytesDeVideo(semMarca, "final.mp4").compativel).toBe(true)
  })

  it("arquivo vazio não trava o upload", () => {
    expect(analisarBytesDeVideo(new Uint8Array(0), "v.mp4").compativel).toBe(true)
  })
})
