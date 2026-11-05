import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Giovani, 04/11/2026: "esse sistema ficou confuso, 2 lugar para anexar a
// midia, temos que simplificar isso, tem que ser algo simples". No card da
// gravação externa a mídia entra só pelo "Agora" (brutos no material, vídeo
// final na edição); embaixo, um bloco só de leitura com o que chegou, as
// pastas antigas incluídas e cada link uma vez. Corrigir é o "Trocar", que
// abre o campo no "Agora".
import { itensDosArquivos, midiaDaGravacao, mesmoLink, patchDosBrutos, statusAoGravarMaterial } from "@/lib/etapas-da-gravacao"
import { AgoraDaGravacao, type GravacaoDoPasso } from "@/components/jobs/PassoDaGravacao"
import { ArquivosDaGravacao } from "@/components/jobs/ArquivosDaGravacao"

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

  it("a pasta antiga dos brutos com o link do vídeo final não engole o vídeo (revisão do #134)", () => {
    const itens = midiaDaGravacao({ linkFolderBrutos: `${drive}/?usp=sharing`, linkFinal: drive })
    expect(itens).toEqual([expect.objectContaining({ qual: "video", rotulo: "Vídeo final", toca: true, antigo: false })])
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

// ── O bloco "Arquivos" (05/11/2026) ──────────────────────────────────────────
//
// Giovani: "colocar os anexar links de arquivos como na interface ... a aba la
// embaixo de arquivo pode remover pq vamos subir para cima". O bloco "Arquivos"
// da ficha é o lugar único de ver e de mandar o material; o "Agora" virou uma
// faixa com a frase e o botão da etapa, sem campo.

const hoje = "2026-11-05"
const ontem = "2026-11-04T13:00:00.000Z"
const amanha = "2026-11-06T13:00:00.000Z"
const linhas = (j: Parameters<typeof itensDosArquivos>[0]) =>
  itensDosArquivos(j, hoje).map((i) => [i.rotulo, i.estado, i.situacao, i.agora, i.podeMandar])

describe("as linhas do bloco \"Arquivos\"", () => {
  it("gravou e falta o material: os brutos já vêm com o campo aberto; o vídeo final é depois da edição", () => {
    expect(linhas({ statusInterno: "captacao_realizada", edicaoPor: "equipe", dataCaptacao: ontem })).toEqual([
      ["Brutos", "falta", "falta", true, true],
      ["Vídeo final", "depois", "nós editamos, depois da edição", false, false],
    ])
  })

  it("antes do dia da gravação nada falta, mas já dá para mandar; a agendar, ainda não", () => {
    expect(linhas({ statusInterno: "captacao_agendada", edicaoPor: "equipe", dataCaptacao: amanha })[0])
      .toEqual(["Brutos", "depois", "depois da gravação", false, true])
    expect(linhas({ statusInterno: "planejamento" })[0]).toEqual(["Brutos", "depois", "depois da gravação", false, false])
  })

  it("a edição é do videomaker: os brutos e o vídeo pronto chegam juntos, os dois abertos", () => {
    expect(linhas({ statusInterno: "captacao_realizada", edicaoPor: "videomaker", dataCaptacao: ontem })).toEqual([
      ["Brutos", "falta", "falta", true, true],
      ["Vídeo pronto", "falta", "falta", true, true],
    ])
  })

  it("na edição, o vídeo final vem aberto; chegou, vira a linha com o arquivo e o Trocar", () => {
    expect(linhas({ statusInterno: "editando", edicaoPor: "equipe", linkBrutos: drive })).toEqual([
      ["Brutos", "feito", "chegou", false, true],
      ["Vídeo final", "falta", "falta", true, true],
    ])
    const [, video] = itensDosArquivos({ statusInterno: "aprovado", edicaoPor: "equipe", linkBrutos: drive, linkFinal: subido,
      arquivos: [{ tipoArquivo: "final", url: subido, nomeArquivo: "final.mp4" }] }, hoje)
    expect(video).toMatchObject({ rotulo: "Vídeo final", estado: "feito", agora: false, podeMandar: true, midia: { nomeArquivo: "final.mp4", toca: true, noNuflow: true } })
  })

  it("sem edição, brutos e vídeo final são uma linha só; sem os brutos, o vídeo diz que vão os brutos", () => {
    expect(linhas({ statusInterno: "aprovado", edicaoPor: "sem_edicao", linkBrutos: drive, linkFinal: drive }))
      .toEqual([["Brutos e vídeo final", "feito", "chegou", false, true]])
    expect(linhas({ statusInterno: "captacao_realizada", edicaoPor: "sem_edicao", dataCaptacao: ontem })[1])
      .toEqual(["Vídeo final", "pulado", "sem edição: vão os brutos", false, false])
  })

  it("as pastas antigas entram como linhas, só para abrir, e o link repetido aparece uma vez", () => {
    expect(linhas({ statusInterno: "aprovado", edicaoPor: "equipe", linkBrutos: drive, linkFolderBrutos: `${drive}?usp=sharing`,
      linkFinal: "https://drive.google.com/file/d/v/view", linkFolderFinal: "https://drive.google.com/drive/folders/pronto" })).toEqual([
      ["Brutos", "feito", "chegou", false, true],
      ["Vídeo final", "feito", "chegou", false, true],
      ["Pasta do material pronto", "feito", "pasta antiga", false, false],
    ])
  })

  it("brutos subidos como arquivo aparecem com o nome de quem subiu", () => {
    const bruto = "/api/midia/org/org-1/videos/dem-1/bruto.mp4"
    const [b] = itensDosArquivos({ statusInterno: "editando", edicaoPor: "equipe", linkBrutos: bruto,
      arquivos: [{ tipoArquivo: "bruto", url: bruto, nomeArquivo: "camera A.mp4" }] }, hoje)
    expect(b.midia).toMatchObject({ nomeArquivo: "camera A.mp4", noNuflow: true, toca: false })
  })

  it("cancelada: não pede material; o que já chegou continua", () => {
    const marca = [{ statusNovo: "encerrado", observacao: "Gravação cancelada: cliente desistiu" }]
    expect(linhas({ statusInterno: "encerrado", historicos: marca })).toEqual([])
    expect(linhas({ statusInterno: "encerrado", historicos: marca, linkBrutos: drive })).toEqual([["Brutos", "feito", "chegou", false, true]])
  })
})

// ── A tela ───────────────────────────────────────────────────────────────────

const job = (j: Partial<GravacaoDoPasso>): GravacaoDoPasso => ({
  id: "dem-1", statusInterno: "captacao_realizada", videomakerId: "vm-1", videomaker: { nome: "Alan Souza" },
  edicaoPor: "equipe", conviteEntrega: { token: "conv" }, dataCaptacao: ontem, ...j,
} as GravacaoDoPasso)

const agora = (j: GravacaoDoPasso, podeEditar = true) => renderToStaticMarkup(createElement(AgoraDaGravacao, {
  job: j, podeEditar, onAvancar: nada, onConfirmarVideomaker: () => {}, onEscalar: () => {},
}))
const arquivos = (j: GravacaoDoPasso, podeEditar = true) => renderToStaticMarkup(createElement(ArquivosDaGravacao, {
  job: j, podeEditar, onSalvar: nada, onAvancar: nada, onAtualizar: nada, onEnviarArquivo: async () => subido, onTocar: () => {},
  documentos: createElement("p", null, "DOCUMENTOS-AQUI"), referencias: "https://exemplo.test/ref",
}))

describe("a faixa \"Agora\": a frase e o botão da etapa, sem campo", () => {
  it("no material: copiar o link de entrega e a dica de colar em \"Arquivos\"; nenhum campo", () => {
    const html = agora(job({}))
    expect(html).toContain("Gravou — falta o material de Alan")
    expect(html).toContain("Copiar link de entrega")
    expect(html).toContain("cole em “Arquivos”")
    expect(html).not.toContain("<input")
  })

  it("na edição, \"Pronto\" só libera com o vídeo final no card", () => {
    expect(agora(job({ statusInterno: "editando" }))).toMatch(/<button type="button" disabled="" title="Falta o vídeo final em “Arquivos”" class="[^"]*">Pronto para enviar ao cliente<\/button>/)
    expect(agora(job({ statusInterno: "editando", linkFinal: subido }))).toMatch(/<button type="button" class="[^"]*">Pronto para enviar ao cliente<\/button>/)
  })

  it("no envio: copiar o link do vídeo e marcar como enviado", () => {
    const html = agora(job({ statusInterno: "aprovado", linkFinal: subido }))
    expect(html).toContain("Copiar link do vídeo")
    expect(html).toContain("Marcar como enviado")
  })

  it("a agendar: escalar o videomaker; quem não edita só lê", () => {
    expect(agora(job({ statusInterno: "planejamento", videomakerId: null, videomaker: null }))).toContain("Escalar videomaker")
    expect(agora(job({ statusInterno: "planejamento", videomakerId: null, videomaker: null }), false)).not.toContain("<button")
  })
})

describe("o bloco \"Arquivos\": o lugar único de ver e de mandar", () => {
  it("no material: o campo dos brutos já aberto, a nota fiscal e os documentos no mesmo bloco", () => {
    const html = arquivos(job({}))
    expect(html).toContain('aria-label="Arquivos"')
    expect(html).toContain('placeholder="Link dos brutos (drive)"')
    expect(html).toContain("Enviar arquivo")
    expect(html).toContain("Nota fiscal")
    expect(html).toContain("DOCUMENTOS-AQUI")
    expect(html).toContain("https://exemplo.test/ref")
    expect(html).not.toContain("Anexar por ele")
  })

  it("o que chegou: tocar, baixar, abrir e trocar, sem campo aberto", () => {
    const html = arquivos(job({ statusInterno: "aprovado", linkBrutos: drive, linkFinal: subido,
      arquivos: [{ tipoArquivo: "final", url: subido, nomeArquivo: "Dr Carlos final.mp4" }] }))
    expect(html).toContain("Dr Carlos final.mp4")
    expect(html).toContain('aria-label="Tocar Vídeo final"')
    expect(html).toContain(`href="${subido}?download=1"`)
    expect(html).toContain('aria-label="Abrir Brutos"')
    expect(html.match(/>Trocar</g)).toHaveLength(2)
    expect(html).not.toContain("<input type=\"url\"")
  })

  it("pasta antiga: aparece e abre, sem trocar; quem não edita não manda nem troca", () => {
    const antiga = arquivos(job({ statusInterno: "aprovado", linkBrutos: drive, linkFinal: subido, linkFolderFinal: "https://drive.google.com/drive/folders/pronto" }))
    expect(antiga).toContain("Pasta do material pronto")
    expect(antiga).toContain("pasta antiga")
    const leitor = arquivos(job({}), false)
    expect(leitor).not.toContain("<input type=\"url\"")
    expect(leitor).not.toContain(">Adicionar<")
    expect(leitor).not.toContain(">Trocar<")
    expect(leitor).not.toContain("Enviar instruções")
  })
})

describe("pasta antiga com o mesmo link do vídeo (revisão do #134)", () => {
  const drive = "https://drive.google.com/drive/folders/pasta-unica"
  it("sem edição: o vídeo chegou e pode ser trocado", () => {
    const video = itensDosArquivos({ statusInterno: "aprovado", edicaoPor: "sem_edicao", linkFolderBrutos: drive, linkFinal: drive }, "2026-11-05")
      .find((i) => i.qual === "video" && i.situacao !== "pasta antiga")
    expect(video).toMatchObject({ estado: "feito", situacao: "chegou", podeMandar: true })
  })
  it("nós editamos: o vídeo chegou, não fica como falta", () => {
    const video = itensDosArquivos({ statusInterno: "aprovado", edicaoPor: "equipe", linkBrutos: "https://drive.google.com/brutos", linkFolderBrutos: drive, linkFinal: drive }, "2026-11-05")
      .find((i) => i.qual === "video" && i.situacao !== "pasta antiga")
    expect(video).toMatchObject({ estado: "feito", situacao: "chegou", podeMandar: true })
  })
})
