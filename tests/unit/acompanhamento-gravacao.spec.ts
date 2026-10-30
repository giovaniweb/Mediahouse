import { describe, expect, it } from "vitest"
import { acompanhamentoDaGravacao, type GravacaoParaAcompanhar } from "@/lib/acompanhamento-gravacao"

// A página de quem pediu o videomaker. Quinta, 29/10/2026; 16:00Z = 13:00 em SP.
const hoje = "2026-10-29"
const g = (o: Partial<GravacaoParaAcompanhar>): GravacaoParaAcompanhar => ({
  statusInterno: "captacao_agendada", statusVisivel: "producao", titulo: "Gravação · Clínica Cristal",
  clienteFinalNome: "Clínica Cristal", tipoGravacao: "entrega_equipamento", edicaoPor: "equipe",
  videomakerId: "vm", videomaker: { nome: "João Martins" }, dataCaptacao: "2026-10-31T16:00:00Z",
  localGravacao: "Alameda dos Nhambiquaras, 1700", createdAt: "2026-10-28T12:00:00Z", ...o,
})
const estados = (a: ReturnType<typeof acompanhamentoDaGravacao>) => Object.fromEntries((a.trilha ?? []).map((p) => [p.id, p.estado]))

describe("o que quem pediu vê", () => {
  it("agendada: quando, onde, quem vai e o passo da gravação", () => {
    const a = acompanhamentoDaGravacao(g({}), hoje)
    expect(a).toMatchObject({ cliente: "Clínica Cristal", tipo: "Entrega de equipamento", quando: "Sáb, 31/10 · 13:00",
      onde: "Alameda dos Nhambiquaras, 1700", videomaker: "João Martins", situacao: "Gravação agendada", tom: "andamento" })
    expect(estados(a)).toMatchObject({ pedido: "feito", videomaker: "feito", gravacao: "agora", material: "depois" })
  })
  it("em análise: nada andou ainda além do pedido", () => {
    const a = acompanhamentoDaGravacao(g({ statusInterno: "aguardando_aprovacao_interna", statusVisivel: "entrada", videomakerId: null, videomaker: null }), hoje)
    expect(a.situacao).toBe("Pedido em análise")
    expect(a.trilha![0]).toMatchObject({ id: "pedido", estado: "agora", detalhe: "em análise" })
    expect(a.trilha!.slice(1).every((p) => p.estado === "depois")).toBe(true)
  })
  it("convidado e sem resposta: o nome do videomaker ainda não aparece", () => {
    const a = acompanhamentoDaGravacao(g({ statusInterno: "videomaker_notificado" }), hoje)
    expect(a.videomaker).toBeNull()
    expect(a.situacao).toBe("Videomaker convidado, esperando a confirmação")
    expect(a.trilha!.find((p) => p.id === "videomaker")).toMatchObject({ estado: "agora", detalhe: "a confirmar" })
  })
  it("gravou e o material não chegou", () => {
    const a = acompanhamentoDaGravacao(g({ dataCaptacao: "2026-10-27T16:00:00Z" }), hoje)
    expect(a.situacao).toBe("Gravado, esperando o material")
    expect(a.trilha!.find((p) => p.id === "material")).toMatchObject({ estado: "agora", detalhe: "aguardando" })
  })
  it("na edição, o nome do editor não sai", () => {
    const a = acompanhamentoDaGravacao(g({ statusInterno: "editando", edicaoPor: "equipe" }), hoje)
    expect(a.situacao).toBe("Em edição")
    expect(a.trilha!.find((p) => p.id === "edicao")).toMatchObject({ estado: "agora", detalhe: null })
  })
  it("editado pelo videomaker: a edição aparece pulada, com o porquê", () => {
    const a = acompanhamentoDaGravacao(g({ statusInterno: "aprovado", edicaoPor: "videomaker" }), hoje)
    expect(a.situacao).toBe("Vídeo pronto, falta enviar ao cliente")
    expect(a.trilha!.find((p) => p.id === "edicao")).toMatchObject({ estado: "pulado", detalhe: "Videomaker edita" })
  })
  it("enviado ao cliente", () => {
    const a = acompanhamentoDaGravacao(g({ statusInterno: "entregue_cliente", statusVisivel: "finalizado", finalizadaEm: "2026-11-03T15:00:00Z" }), hoje)
    expect(a).toMatchObject({ situacao: "Enviado ao cliente", tom: "ok" })
  })
  it("recusado ou encerrado: a frase, sem caminho", () => {
    expect(acompanhamentoDaGravacao(g({ statusInterno: "encerrado", statusVisivel: "entrada" }), hoje)).toMatchObject({ situacao: "Pedido não aprovado", trilha: null })
    expect(acompanhamentoDaGravacao(g({ statusInterno: "encerrado", statusVisivel: "finalizado" }), hoje)).toMatchObject({ situacao: "Gravação cancelada", trilha: null })
  })
  it("encerrada depois da entrega é \"Enviado ao cliente\"; cancelada com vídeo pronto é cancelada", () => {
    const entregue = acompanhamentoDaGravacao(g({ statusInterno: "encerrado", statusVisivel: "finalizado",
      historicos: [{ statusNovo: "entregue_cliente", createdAt: "2026-10-30T12:00:00Z" }] }), hoje)
    expect(entregue).toMatchObject({ situacao: "Enviado ao cliente", tom: "ok" })
    const cancelada = acompanhamentoDaGravacao(g({ statusInterno: "encerrado", statusVisivel: "finalizado",
      historicos: [{ statusNovo: "encerrado", createdAt: "2026-10-30T12:00:00Z", observacao: "Gravação cancelada: chuva" }] }), hoje)
    expect(cancelada).toMatchObject({ situacao: "Gravação cancelada", trilha: null })
    // Antiga, sem histórico, com o vídeo no link: entregue, como antes.
    expect(acompanhamentoDaGravacao(g({ statusInterno: "encerrado", statusVisivel: "finalizado", linkFinal: "https://drive/v" }), hoje))
      .toMatchObject({ situacao: "Enviado ao cliente" })
  })
})
