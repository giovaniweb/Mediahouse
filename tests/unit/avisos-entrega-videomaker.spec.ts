import { describe, expect, it, vi } from "vitest"

// O módulo puxa o banco só nas funções de envio; aqui ficam as partes sem banco.
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
import { emailDaEntrega, emailDaNota, sinoDaEntrega } from "@/lib/avisos-entrega-videomaker"
import { templateAvisoDaOperacao } from "@/lib/email"
import { mensagemDaNotaEmLote, mensagensDoEvento, type DadosDoAviso } from "@/lib/avisos-gravacao-textos"

// "Toda vez que o videomaker anexar o link ou anexar a nota fiscal o sistema
// manda para o email e também notificação com link" (Giovani, 11/11/2026).
const g: DadosDoAviso = {
  codigo: "VOP-26-2001", titulo: "Treinamento", statusInterno: "brutos_enviados", clienteFinalNome: "Clínica Cristal",
  edicaoPor: "equipe", dataCaptacao: "2026-10-31T16:00:00.000Z", videomakerId: "vm", videomaker: { nome: "João Martins" },
  linkBrutos: "https://drive.example/brutos", linkCard: "https://nuflow.space/jobs/abc",
}

describe("WhatsApp da operação com os links", () => {
  it("material: brutos e card, cada link na própria linha", () => {
    expect(mensagensDoEvento("material", g).operacao).toBe(
      "📁 Material recebido de Clínica Cristal (VOP-26-2001). Vai para a edição.\n\nBrutos:\nhttps://drive.example/brutos\n\nNo NuFlow:\nhttps://nuflow.space/jobs/abc",
    )
  })

  it("parte da entrega: diz o que falta; o vídeo pronto entra quando a edição é dele", () => {
    const dele = { ...g, edicaoPor: "videomaker", statusInterno: "captacao_agendada" }
    expect(mensagensDoEvento("material_parcial", dele).operacao).toContain("📁 João mandou material de Clínica Cristal (VOP-26-2001). Falta o vídeo pronto.")
    const pronto = mensagensDoEvento("material", { ...dele, statusInterno: "aprovado", linkFinal: "https://drive.example/pronto" }).operacao!
    expect(pronto).toContain("Pronto para enviar ao cliente.")
    expect(pronto).toContain("Vídeo pronto:\nhttps://drive.example/pronto")
  })

  it("o arquivo nosso (/api/midia) não vai cru; sem edição, os brutos não repetem como vídeo", () => {
    const texto = mensagensDoEvento("material", { ...g, edicaoPor: "videomaker", linkFinal: "/api/midia/org/x/final/1.mp4" }).operacao!
    expect(texto).not.toContain("/api/midia")
    expect(mensagensDoEvento("material", { ...g, edicaoPor: "sem_edicao", linkFinal: g.linkBrutos }).operacao).not.toContain("Vídeo pronto")
  })

  it("nota: o link do arquivo e o do card; na nota de várias gravações também", () => {
    const comNota = { ...g, linkNota: "https://nuflow.space/api/midia/org/x/nf/1.pdf?token=t" }
    expect(mensagensDoEvento("nota_recebida", comNota).operacao).toContain("Nota fiscal:\nhttps://nuflow.space/api/midia/org/x/nf/1.pdf?token=t")
    expect(mensagemDaNotaEmLote("João", ["A (1)", "B (2)"], comNota.linkNota).operacao).toContain("Nota fiscal:\nhttps://nuflow.space/api/midia/org/x/nf/1.pdf?token=t")
    expect(mensagemDaNotaEmLote("João", ["A (1)"]).operacao).not.toContain("Nota fiscal:")
  })
})

describe("e-mail e sino", () => {
  it("material: assunto, situação e os links como botão", () => {
    const { assunto, dados } = emailDaEntrega(g, true)
    expect(assunto).toBe("Material recebido — Clínica Cristal (VOP-26-2001)")
    expect(dados.linhas).toContainEqual(["Situação", "Vai para a edição"])
    expect(dados.links.map((l) => l.url)).toEqual(["https://drive.example/brutos", "https://nuflow.space/jobs/abc"])
    expect(sinoDaEntrega({ ...g, edicaoPor: "videomaker" }, false)).toBe("📁 João mandou material de Clínica Cristal (VOP-26-2001). Falta o vídeo pronto.")
  })

  it("nota de várias gravações: uma linha por gravação e o card de cada uma", () => {
    const nota = "https://nuflow.space/api/midia/org/x/nf/1.pdf?token=t"
    const { assunto, dados } = emailDaNota([{ ...g, linkNota: nota }, { ...g, codigo: "VOP-2", linkCard: "https://nuflow.space/jobs/def" }])
    expect(assunto).toBe("Nota fiscal de João Martins — 2 gravações")
    expect(dados.links[0]).toEqual({ rotulo: "Abrir a nota fiscal", url: nota })
    expect(dados.links.map((l) => l.rotulo)).toEqual(["Abrir a nota fiscal", "Abrir VOP-26-2001 no NuFlow", "Abrir VOP-2 no NuFlow"])
  })

  it("o template escapa o que veio de fora e só aceita link http(s)", () => {
    const html = templateAvisoDaOperacao({
      titulo: "Material", intro: "x",
      linhas: [["Cliente", '<a href="https://golpe.example">Clique</a>']],
      links: [{ rotulo: "Abrir", url: "javascript:alert(1)" }, { rotulo: "Card", url: "https://nuflow.space/jobs/abc" }],
    })
    expect(html).not.toContain('<a href="https://golpe.example">')
    expect(html).toContain("&lt;a href=")
    expect(html).not.toContain("javascript:")
    expect(html).toContain('href="https://nuflow.space/jobs/abc"')
  })
})
