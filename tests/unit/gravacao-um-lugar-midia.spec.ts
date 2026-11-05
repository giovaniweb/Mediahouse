import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Giovani, 04/11/2026: "esse sistema ficou confuso, 2 lugar para anexar a
// midia, temos que simplificar isso, tem que ser algo simples". No card da
// gravação externa a mídia entra só pelo "Agora" (brutos no material, vídeo
// final na edição); embaixo, um bloco só de leitura com o que chegou, as
// pastas antigas incluídas e cada link uma vez. Corrigir é o "Trocar", que
// abre o campo no "Agora".
import { midiaDaGravacao, mesmoLink, patchDosBrutos, statusAoGravarMaterial } from "@/lib/etapas-da-gravacao"
import { AgoraDaGravacao, EntregasDoVideomaker, type GravacaoDoPasso } from "@/components/jobs/PassoDaGravacao"
import { MidiaDaGravacao } from "@/components/jobs/MidiaDaGravacao"

const drive = "https://drive.google.com/drive/folders/abc"
const subido = "/api/midia/org/org-1/videos/dem-1/1730000000000.mp4"
const nada = async () => {}

describe("a mídia do card, num bloco só", () => {
  it("sem nada chegado, a lista é vazia", () => {
    expect(midiaDaGravacao({})).toEqual([])
    expect(midiaDaGravacao({ linkBrutos: "  ", linkFinal: null })).toEqual([])
  })

  it("brutos primeiro, depois o vídeo final subido, com o nome e o original para baixar", () => {
    const itens = midiaDaGravacao({
      linkBrutos: drive,
      linkFinal: subido,
      arquivos: [{ tipoArquivo: "final", url: subido, originalUrl: "/api/midia/org/org-1/videos/dem-1/orig.mov", nomeArquivo: " Dr Carlos final.mp4 " }],
    })
    expect(itens).toEqual([
      { qual: "brutos", rotulo: "Brutos", url: drive, toca: false, noNuflow: false, nomeArquivo: null, originalUrl: null, antigo: false },
      { qual: "video", rotulo: "Vídeo final", url: subido, toca: true, noNuflow: true, nomeArquivo: "Dr Carlos final.mp4", originalUrl: "/api/midia/org/org-1/videos/dem-1/orig.mov", antigo: false },
    ])
  })

  it("dado antigo não some: as pastas de antes aparecem, só para ler", () => {
    const itens = midiaDaGravacao({ linkFolderBrutos: "https://drive.google.com/a", linkFolderFinal: "https://drive.google.com/b" })
    expect(itens.map((i) => [i.rotulo, i.antigo, i.toca])).toEqual([
      ["Pasta do material bruto", true, false],
      ["Pasta do material pronto", true, false],
    ])
  })

  it("o mesmo link aparece uma vez, mesmo com o ?usp do Drive ou a barra no fim", () => {
    const itens = midiaDaGravacao({ linkBrutos: drive, linkFolderBrutos: `${drive}/?usp=sharing` })
    expect(itens).toHaveLength(1)
    expect(itens[0]).toMatchObject({ rotulo: "Brutos", antigo: false })
  })

  it("sem edição, os brutos são o vídeo final: uma linha que diz as duas coisas e toca", () => {
    const itens = midiaDaGravacao({ linkBrutos: drive, linkFinal: drive, linkFolderFinal: drive })
    expect(itens).toEqual([expect.objectContaining({ qual: "brutos", rotulo: "Brutos e vídeo final", toca: true })])
  })

  it("a pasta antiga igual aos brutos não vira vídeo: fica a linha dos brutos", () => {
    expect(midiaDaGravacao({ linkBrutos: drive, linkFolderFinal: drive }))
      .toEqual([expect.objectContaining({ rotulo: "Brutos", toca: false })])
  })

  it("links diferentes de verdade continuam dois (o ?v= do YouTube conta)", () => {
    expect(mesmoLink("https://youtube.com/watch?v=1", "https://youtube.com/watch?v=2")).toBe(false)
    expect(mesmoLink("https://Drive.google.com/x/", "https://drive.google.com/x?usp=drive_link")).toBe(true)
    expect(mesmoLink(null, null)).toBe(false)
  })
})

describe("os brutos colados no \"Agora\"", () => {
  it("com a nossa edição, grava só os brutos", () => {
    expect(patchDosBrutos({ edicaoPor: "equipe", linkFinal: null }, drive)).toEqual({ linkBrutos: drive })
  })
  it("sem edição, o vídeo final vai junto enquanto for o dos brutos", () => {
    expect(patchDosBrutos({ edicaoPor: "sem_edicao" }, drive)).toEqual({ linkBrutos: drive, linkFinal: drive })
    expect(patchDosBrutos({ edicaoPor: "sem_edicao", linkBrutos: "https://x.test/velho", linkFinal: "https://x.test/velho" }, drive))
      .toEqual({ linkBrutos: drive, linkFinal: drive })
    expect(patchDosBrutos({ edicaoPor: "sem_edicao", linkBrutos: "https://x.test/velho", linkFinal: subido }, drive))
      .toEqual({ linkBrutos: drive })
  })

  it("completou o material: a gravação anda junto, como no link do convite", () => {
    const material = { statusInterno: "captacao_realizada" }
    expect(statusAoGravarMaterial({ ...material, edicaoPor: "equipe" }, { linkBrutos: drive })).toBe("brutos_enviados")
    expect(statusAoGravarMaterial({ ...material, edicaoPor: "sem_edicao" }, patchDosBrutos({ edicaoPor: "sem_edicao" }, drive))).toBe("aprovado")
    // A edição é dele: falta o vídeo pronto, então só grava.
    expect(statusAoGravarMaterial({ ...material, edicaoPor: "videomaker" }, { linkBrutos: drive })).toBeNull()
    expect(statusAoGravarMaterial({ ...material, edicaoPor: "videomaker", linkBrutos: drive }, { linkFinal: subido })).toBe("aprovado")
  })

  it("fora do material, trocar um link não mexe no status", () => {
    expect(statusAoGravarMaterial({ statusInterno: "editando", edicaoPor: "equipe" }, { linkBrutos: drive })).toBeNull()
    expect(statusAoGravarMaterial({ statusInterno: "aprovado", edicaoPor: "equipe", linkBrutos: drive }, { linkFinal: subido })).toBeNull()
  })
})

// ── A tela ───────────────────────────────────────────────────────────────────

const job = (j: Partial<GravacaoDoPasso>): GravacaoDoPasso => ({
  id: "dem-1", statusInterno: "captacao_realizada", videomakerId: "vm-1", videomaker: { nome: "Alan Souza" },
  edicaoPor: "equipe", conviteEntrega: { token: "conv" }, ...j,
} as GravacaoDoPasso)

const agora = (j: GravacaoDoPasso, extra: Partial<Parameters<typeof AgoraDaGravacao>[0]> = {}) => renderToStaticMarkup(createElement(AgoraDaGravacao, {
  job: j, podeEditar: true, onSalvar: nada, onAvancar: nada, onConfirmarVideomaker: () => {}, onEscalar: () => {},
  onEnviarVideo: async () => subido, ...extra,
}))
const entregas = (j: GravacaoDoPasso) => renderToStaticMarkup(createElement(EntregasDoVideomaker, { job: j, podeEditar: true, onAtualizar: nada }))
const midia = (j: Parameters<typeof MidiaDaGravacao>[0]["job"], podeEditar = true) =>
  renderToStaticMarkup(createElement(MidiaDaGravacao, { job: j, podeEditar, onTocar: () => {}, onTrocar: () => {} }))

describe("um lugar só para mandar mídia: o \"Agora\"", () => {
  it("no material, o campo dos brutos fica no \"Agora\", junto do link de entrega", () => {
    const html = agora(job({}))
    expect(html).toContain("Copiar link de entrega")
    expect(html).toContain('placeholder="Link dos brutos (drive)"')
    expect(html).toContain("Se mandar pelo WhatsApp, cole aqui.")
    // Com a nossa edição, o vídeo final não entra no material.
    expect(html).not.toContain("Enviar arquivo")
  })

  it("se a edição é do videomaker, o vídeo pronto entra no mesmo \"Agora\", com arquivo ou link", () => {
    const html = agora(job({ edicaoPor: "videomaker", linkBrutos: drive }))
    expect(html).toContain("Vídeo pronto")
    expect(html).toContain("Enviar arquivo")
    expect(html).toContain("Colar link")
    expect(html).toContain(">Trocar<")
    expect(html).not.toContain("Link dos brutos (drive)")
  })

  it("as entregas do videomaker só dizem o que chegou: sem \"Anexar por ele\"", () => {
    const falta = entregas(job({}))
    expect(falta).not.toContain("Anexar por ele")
    expect(falta).not.toContain("<input")
    expect(falta).toContain("falta")
    const chegou = entregas(job({ statusInterno: "editando", linkBrutos: drive }))
    expect(chegou).toContain("chegou")
    expect(chegou).not.toContain(drive)
  })

  it("na edição, o vídeo subido aparece com Trocar e o \"Pronto\" libera", () => {
    const html = agora(job({ statusInterno: "editando", linkBrutos: drive, linkFinal: subido,
      arquivos: [{ tipoArquivo: "final", url: subido, nomeArquivo: "Dr Carlos final.mp4" }] }))
    expect(html).toContain("Dr Carlos final.mp4")
    expect(html).toContain(">Trocar<")
    expect(html).toMatch(/<button type="button" class="[^"]*">Pronto para enviar ao cliente<\/button>/)
  })

  it("\"Trocar\" abre o mesmo campo no \"Agora\", com Cancelar", () => {
    const brutos = agora(job({ statusInterno: "aprovado", linkBrutos: drive, linkFinal: subido }), { troca: "brutos" })
    expect(brutos).toContain("Trocar o link dos brutos")
    expect(brutos).toContain('placeholder="Link dos brutos (drive)"')
    expect(brutos).toContain("Cancelar")
    expect(brutos).not.toContain("Marcar como enviado")

    const video = agora(job({ statusInterno: "aprovado", linkBrutos: drive, linkFinal: subido }), { troca: "video" })
    expect(video).toContain("Trocar o vídeo final")
    expect(video).toContain("Enviar arquivo")
  })

  it("quem não edita não vê troca nem campo", () => {
    const html = agora(job({ statusInterno: "aprovado", linkFinal: subido }), { troca: "brutos", podeEditar: false })
    expect(html).not.toContain("Trocar o link dos brutos")
    expect(html).not.toContain("<input")
  })
})

describe("embaixo, a mídia só para ler", () => {
  it("sem nada, diz onde a mídia entra", () => {
    expect(midia({})).toContain("Os brutos e o vídeo final entram pelo “Agora”")
  })

  it("o vídeo subido toca, baixa e abre; nada de campo nem \"Adicionar\"", () => {
    const html = midia({ linkBrutos: drive, linkFinal: subido, arquivos: [{ tipoArquivo: "final", url: subido, nomeArquivo: "final.mp4" }] })
    expect(html).toContain("Tocar final.mp4")
    expect(html).toContain(`href="${subido}?download=1"`)
    expect(html).toContain("Abrir Brutos")
    expect(html).toContain("Trocar o link dos brutos")
    expect(html).toContain("Trocar o vídeo final")
    expect(html).not.toContain("<input")
    expect(html).not.toContain("Adicionar")
  })

  it("pasta antiga aparece sem Trocar; quem não edita não troca nada", () => {
    const html = midia({ linkFolderBrutos: "https://drive.google.com/antiga" })
    expect(html).toContain("Pasta do material bruto")
    expect(html).toContain("pasta antiga")
    expect(html).not.toContain("Trocar")
    expect(midia({ linkBrutos: drive }, false)).not.toContain("Trocar")
  })
})
