import { describe, expect, it } from "vitest"
import {
  eventoDaMudanca,
  mensagensDaRegra,
  mensagensDoEvento,
  regrasDaGravacao,
  type DadosDoAviso,
} from "@/lib/avisos-gravacao-textos"

// A tabela de avisos das Gravações Externas que o Giovani aprovou (29/10/2026).
const g: DadosDoAviso = {
  codigo: "VOP-26-2001", titulo: "Treinamento do equipamento", statusInterno: "captacao_agendada",
  clienteFinalNome: "Clínica Cristal", edicaoPor: "equipe", tipoGravacao: "entrega_equipamento",
  temBrinde: true, brinde: "Caixa mineira", levar: "banner",
  dataCaptacao: "2026-10-31T16:00:00.000Z", localGravacao: "Alameda dos Nhambiquaras, 1700, São Paulo - SP",
  videomakerId: "vm", videomaker: { nome: "João Martins" }, linkEntrega: "https://nuflow.space/convite/tok",
}
const papeis = (m: object) => Object.keys(m).sort()

describe("quem recebe cada evento", () => {
  it("o dia a dia vai para a operação", () => {
    expect(papeis(mensagensDoEvento("entrou", g))).toEqual(["operacao"])
    expect(papeis(mensagensDoEvento("material", g))).toEqual(["operacao"])
    expect(papeis(mensagensDoEvento("nota_recebida", g))).toEqual(["operacao"])
    expect(papeis(mensagensDoEvento("pronta", g))).toEqual(["operacao"])
  })
  it("confirmou: operação e cliente, com dia, hora, videomaker e local", () => {
    const m = mensagensDoEvento("confirmada", g)
    expect(papeis(m)).toEqual(["cliente", "operacao"])
    expect(m.cliente).toContain("Sáb, 31/10 · 13:00, com João Martins")
    expect(m.cliente).toContain("Local: Alameda dos Nhambiquaras")
  })
  it("recusa é trava: operação e gestão", () => {
    expect(papeis(mensagensDoEvento("recusada", g))).toEqual(["gestao", "operacao"])
  })
  it("concluída: cliente recebe o link; sem link, só quem pediu", () => {
    expect(mensagensDoEvento("concluida", { ...g, linkFinal: "https://drive/final" }).cliente).toContain("https://drive/final")
    expect(papeis(mensagensDoEvento("concluida", g))).toEqual(["solicitante"])
  })
  it("pagamento feito vai para o videomaker", () => {
    expect(papeis(mensagensDoEvento("nota_paga", g))).toEqual(["videomaker"])
  })
})

describe("avisos de calendário", () => {
  it("véspera: videomaker recebe hora, endereço, o que levar, edição e o link de entrega", () => {
    expect(regrasDaGravacao(g, "2026-10-30")).toEqual(["vespera"])
    const v = mensagensDaRegra("vespera", g, "2026-10-30").videomaker!
    expect(v).toContain("Amanhã, 13:00")
    expect(v).toContain("Levar: Brinde: Caixa mineira · banner")
    expect(v).toContain("mande só os brutos")
    expect(v).toContain("https://nuflow.space/convite/tok")
  })
  it("no dia: a colinha do kit vai para o videomaker; sem colinha, nada", () => {
    expect(regrasDaGravacao(g, "2026-10-31")).toEqual(["dia"])
    expect(mensagensDaRegra("dia", { ...g, colinha: "🎬 Colinha de hoje" }, "2026-10-31")).toEqual({ videomaker: "🎬 Colinha de hoje" })
    expect(mensagensDaRegra("dia", g, "2026-10-31")).toEqual({})
    expect(regrasDaGravacao({ ...g, statusInterno: "captacao_realizada" }, "2026-10-31")).toEqual([])
  })
  it("material: cobra nos dias 1 e 2, trava no dia 3 (só a gestão)", () => {
    expect(regrasDaGravacao(g, "2026-11-01")).toEqual(["sem_material"])
    expect(regrasDaGravacao(g, "2026-11-02")).toEqual(["sem_material"])
    expect(regrasDaGravacao(g, "2026-11-03")).toEqual(["material_travado"])
    expect(regrasDaGravacao(g, "2026-11-04")).toEqual([])
    expect(papeis(mensagensDaRegra("material_travado", g, "2026-11-03"))).toEqual(["gestao"])
  })
  it("material chegou: nada mais a cobrar", () => {
    expect(regrasDaGravacao({ ...g, statusInterno: "brutos_enviados" }, "2026-11-01")).toEqual([])
  })
  it("sem videomaker a até 2 dias da data: trava para a gestão", () => {
    const semVm = { ...g, statusInterno: "aguardando_triagem", videomakerId: null, videomaker: null }
    expect(regrasDaGravacao(semVm, "2026-10-28")).toEqual([])
    expect(regrasDaGravacao(semVm, "2026-10-29")).toEqual(["sem_videomaker"])
    expect(regrasDaGravacao(semVm, "2026-10-31")).toEqual(["sem_videomaker"])
  })
  it("nota parada no quinto dia sem ir para compras", () => {
    expect(regrasDaGravacao({ ...g, statusInterno: "editando" }, "2026-11-06", "2026-11-01")).toEqual(["nota_parada"])
    expect(regrasDaGravacao({ ...g, statusInterno: "editando" }, "2026-11-05", "2026-11-01")).toEqual([])
  })
})

describe("mudança de status que vira aviso", () => {
  it("confirmar, recusar, material, pronta e concluída", () => {
    expect(eventoDaMudanca("videomaker_notificado", "videomaker_aceitou")).toBe("confirmada")
    expect(eventoDaMudanca("videomaker_notificado", "captacao_agendada")).toBe("confirmada")
    expect(eventoDaMudanca("videomaker_notificado", "videomaker_recusou")).toBe("recusada")
    expect(eventoDaMudanca("captacao_agendada", "brutos_enviados")).toBe("material")
    expect(eventoDaMudanca("captacao_agendada", "aprovado")).toBe("material")
    expect(eventoDaMudanca("editando", "aprovado")).toBe("pronta")
    expect(eventoDaMudanca("aprovado", "entregue_cliente")).toBe("concluida")
  })
  it("o resto não avisa por aqui", () => {
    expect(eventoDaMudanca("brutos_enviados", "editando")).toBeNull()
    expect(eventoDaMudanca("aguardando_triagem", "planejamento")).toBeNull()
    expect(eventoDaMudanca("captacao_agendada", "encerrado")).toBeNull()
  })
})
