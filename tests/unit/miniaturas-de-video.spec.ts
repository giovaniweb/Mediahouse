import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Giovani, 05/11/2026: "crie uma thumbnail para a pessoa saber que tem um vídeo
// ali anexado ... se tiver mais de um vídeo, coloca mais de uma thumbnail ... um
// íconezinho de play ... abrir ali ampliado no sistema".
import { capaDoVideo, comoTocar, idDoDrive, idDoYoutube, nomeDoVideo, provedorDoVideo, videosDaGravacao } from "@/lib/videos-da-gravacao"
import { MiniaturasDeVideo } from "@/components/video/MiniaturasDeVideo"
import { ArquivosDaGravacao } from "@/components/jobs/ArquivosDaGravacao"
import { AgoraDaGravacao, type GravacaoDoPasso } from "@/components/jobs/PassoDaGravacao"

const subido = "/api/midia/org/org-1/videos/dem-1/1730000000000.mp4"
const subido2 = "/api/midia/org/org-1/videos/dem-1/1730000000999.mp4"
const capa = "/api/midia/org/org-1/thumbnails/dem-1/capa.jpg"
const drive = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing"
const nada = async () => {}

describe("de onde vem o vídeo e que nome ele tem", () => {
  it("reconhece o arquivo do NuFlow, o Drive, o YouTube, o Vimeo e o resto", () => {
    expect(provedorDoVideo(subido)).toBe("nuflow")
    expect(provedorDoVideo(drive)).toBe("drive")
    expect(provedorDoVideo("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp")).toBe("drive")
    expect(provedorDoVideo("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube")
    expect(provedorDoVideo("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("youtube")
    expect(provedorDoVideo("https://vimeo.com/123456789")).toBe("vimeo")
    expect(provedorDoVideo("https://cdn.exemplo.test/video.mp4")).toBe("arquivo")
    expect(provedorDoVideo("https://we.tl/t-abc123")).toBe("link")
  })

  it("acha o id do Drive e do YouTube nos formatos de link", () => {
    expect(idDoDrive(drive)).toBe("1AbCdEfGhIjKlMnOp")
    expect(idDoDrive("https://drive.google.com/uc?id=1AbCdEfGhIjKlMnOp&export=download")).toBe("1AbCdEfGhIjKlMnOp")
    expect(idDoDrive("https://exemplo.test/file/d/1AbCdEfGhIjKlMnOp")).toBeNull()
    expect(idDoYoutube("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ")
  })

  it("o link do Drive nunca se chama \"view\" (o fim da URL)", () => {
    expect(nomeDoVideo({ url: drive, nomeArquivo: "view" })).toBe("Vídeo no Drive")
    expect(nomeDoVideo({ url: "https://youtu.be/dQw4w9WgXcQ" })).toBe("Vídeo no YouTube")
    expect(nomeDoVideo({ url: subido, nomeArquivo: "Dr Carlos final.mp4" })).toBe("Dr Carlos final.mp4")
    expect(nomeDoVideo({ url: subido, nomeArquivo: null }, 2)).toBe("Vídeo 2")
    expect(nomeDoVideo({ url: "https://we.tl/t-abc123", nomeArquivo: "t-abc123" })).toBe("we.tl")
  })
})

describe("como o lightbox mostra cada um", () => {
  it("arquivo no player; Drive pelo /preview; YouTube e Vimeo embutidos; o resto, nova aba", () => {
    expect(comoTocar(subido)).toEqual({ tipo: "video", src: subido })
    expect(comoTocar(drive)).toEqual({ tipo: "iframe", src: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview" })
    expect(comoTocar("https://youtu.be/dQw4w9WgXcQ")).toEqual({ tipo: "iframe", src: "https://www.youtube.com/embed/dQw4w9WgXcQ" })
    expect(comoTocar("https://vimeo.com/123456789")).toEqual({ tipo: "iframe", src: "https://player.vimeo.com/video/123456789" })
    expect(comoTocar("https://we.tl/t-abc123")).toEqual({ tipo: "fora", src: "https://we.tl/t-abc123" })
    expect(comoTocar("https://drive.google.com/drive/folders/pasta")).toMatchObject({ tipo: "fora" })
    expect(comoTocar("/api/midia/org/o/docs/d/arte.png?token=x")).toMatchObject({ tipo: "imagem" })
  })
})

describe("a miniatura: nada de tela quebrada", () => {
  it("a capa do envio; sem ela, o primeiro quadro, a capa do YouTube, o quadro do Drive ou o neutro", () => {
    expect(capaDoVideo({ url: subido, thumbnailUrl: capa })).toEqual({ tipo: "imagem", src: capa })
    expect(capaDoVideo({ url: `${subido}?token=abc` })).toEqual({ tipo: "quadro", src: `${subido}?token=abc#t=0.1` })
    expect(capaDoVideo({ url: drive })).toEqual({ tipo: "drive" })
    expect(capaDoVideo({ url: "https://youtu.be/dQw4w9WgXcQ" })).toEqual({ tipo: "imagem", src: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" })
    expect(capaDoVideo({ url: "https://we.tl/t-abc123" })).toEqual({ tipo: "neutra" })
  })

  it("uma miniatura por vídeo, com o play por cima e o nome embaixo", () => {
    const html = renderToStaticMarkup(createElement(MiniaturasDeVideo, {
      videos: [{ id: "a", url: subido, nomeArquivo: "corte 1.mp4", thumbnailUrl: capa }, { id: "b", url: drive, nomeArquivo: "view" }],
      onAbrir: () => {},
    }))
    expect(html.match(/aria-label="Assistir /g)).toHaveLength(2)
    expect(html).toContain(`src="${capa}"`)
    expect(html).toContain("Google Drive")
    expect(html).toContain(">Vídeo no Drive<")
    expect(html).not.toContain(">view<")
  })
})

describe("os vídeos do card", () => {
  const a = { id: "a", url: subido, nomeArquivo: "corte 1.mp4" }
  const b = { id: "b", url: subido2, nomeArquivo: "corte 2.mp4" }
  it("todos os Arquivos \"final\" do card (o \"Trocar\" tira o registro do trocado)", () => {
    expect(videosDaGravacao(subido2, [a, b])).toEqual([a, b])
    expect(videosDaGravacao(null, [a, b])).toEqual([a, b])
  })
  it("link colado antes, que não virou Arquivo, vale sozinho", () => {
    expect(videosDaGravacao(drive, [a])).toEqual([{ id: null, url: drive, nomeArquivo: null, thumbnailUrl: null }])
    expect(videosDaGravacao(drive, [])).toHaveLength(1)
    expect(videosDaGravacao(null, [])).toEqual([])
  })
})

// ── A tela do card ───────────────────────────────────────────────────────────

const job = (j: Partial<GravacaoDoPasso>): GravacaoDoPasso => ({
  id: "dem-1", statusInterno: "editando", videomakerId: "vm-1", videomaker: { nome: "Alan Souza" },
  edicaoPor: "equipe", linkBrutos: "https://drive.google.com/drive/folders/brutos", ...j,
} as GravacaoDoPasso)
const arquivos = (j: GravacaoDoPasso, podeEditar = true) => renderToStaticMarkup(createElement(ArquivosDaGravacao, {
  job: j, podeEditar, onSalvar: nada, onAvancar: nada, onAtualizar: nada, onEnviarArquivo: async () => subido,
  onRegistrarVideo: nada, onRemoverVideo: nada,
}))
const dois = { linkFinal: subido2, arquivos: [
  { id: "a", tipoArquivo: "final", url: subido, nomeArquivo: "corte 1.mp4", thumbnailUrl: capa },
  { id: "b", tipoArquivo: "final", url: subido2, nomeArquivo: "corte 2.mp4" },
] }

describe("no bloco \"Arquivos\": as miniaturas do vídeo final", () => {
  it("dois vídeos: duas miniaturas, cada uma com baixar, trocar e tirar, e \"Adicionar outro vídeo\"", () => {
    const html = arquivos(job(dois))
    expect(html.match(/aria-label="Assistir /g)).toHaveLength(2)
    expect(html).toContain("Vídeos finais")
    expect(html).toContain("2 vídeos")
    expect(html.match(/>Trocar</g)?.length).toBeGreaterThanOrEqual(2)
    expect(html.match(/Tirar</g)).toHaveLength(2)
    expect(html).toContain("Adicionar outro vídeo")
    expect(html.match(/download=1/g)).toHaveLength(2)
  })

  it("o link do Drive de antes aparece como \"Vídeo no Drive\", com o quadro do Drive", () => {
    const html = arquivos(job({ linkFinal: drive, arquivos: [] }))
    expect(html).toContain(">Vídeo no Drive<")
    expect(html).toContain("Google Drive")
    expect(html).not.toContain(">view<")
  })

  it("quem não edita vê e assiste, mas não troca, não tira nem adiciona", () => {
    const html = arquivos(job(dois), false)
    expect(html.match(/aria-label="Assistir /g)).toHaveLength(2)
    expect(html).not.toContain("Tirar<")
    expect(html).not.toContain("Adicionar outro vídeo")
  })

  it("com mais de um vídeo, a faixa copia o link dos vídeos (a página de acompanhamento)", () => {
    const faixa = (j: GravacaoDoPasso) => renderToStaticMarkup(createElement(AgoraDaGravacao, {
      job: j, podeEditar: true, onAvancar: nada, onConfirmarVideomaker: () => {}, onEscalar: () => {},
    }))
    expect(faixa(job({ statusInterno: "aprovado", ...dois }))).toContain("Copiar link dos vídeos")
    expect(faixa(job({ statusInterno: "aprovado", linkFinal: subido, arquivos: [dois.arquivos[0]] }))).toContain("Copiar link do vídeo")
  })
})
