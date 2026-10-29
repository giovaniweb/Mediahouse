import { describe, expect, it } from "vitest"
import { alertasDasGravacoes, type GravacaoDoPainel } from "@/lib/painel-gravacoes"
import { hojeEmSaoPaulo, somarDias } from "@/lib/datas"

// O painel de alertas das Gravações Externas. "Hoje" é o dia real: o atraso da
// edição usa o relógio (lib/status), e as datas daqui andam junto com ele.
const hoje = hojeEmSaoPaulo()
const dia = (n: number) => `${somarDias(hoje, n)}T16:00:00Z`
let n = 0
const g = (o: Partial<GravacaoDoPainel>): GravacaoDoPainel => ({
  id: `g${++n}`, codigo: `VOP-26-${2000 + n}`, titulo: "Gravação", statusInterno: "captacao_agendada",
  videomakerId: "vm1", videomaker: { nome: "João Martins" }, ...o,
})
const contagem = (lista: GravacaoDoPainel[]) => Object.fromEntries(alertasDasGravacoes(lista, hoje).map((a) => [a.id, a.itens.length]))

describe("alertas do quadro", () => {
  const lista = [
    g({ statusInterno: "aguardando_triagem", videomakerId: null, videomaker: null, clienteFinalNome: "Clínica Longe", dataCaptacao: dia(20) }),
    g({ statusInterno: "aguardando_triagem", videomakerId: null, videomaker: null, clienteFinalNome: "Clínica Perto", dataCaptacao: dia(1) }),
    g({ statusInterno: "videomaker_recusou", dataCaptacao: dia(3) }),
    g({ statusInterno: "videomaker_notificado", dataCaptacao: dia(5) }),
    g({ dataCaptacao: dia(-2) }),
    g({ dataCaptacao: dia(4) }),
    g({ statusInterno: "editando", statusVisivel: "edicao", dataLimite: dia(-3).slice(0, 10) }),
    g({ statusInterno: "editando", statusVisivel: "edicao", dataLimite: dia(5).slice(0, 10) }),
    g({ statusInterno: "aprovado", statusVisivel: "para_postar" }),
    g({ statusInterno: "entregue_cliente", statusVisivel: "finalizado" }),
  ]

  it("cada alerta conta o que precisa ser feito", () => {
    expect(contagem(lista)).toEqual({
      sem_videomaker: 3, sem_confirmacao: 1, material_atrasado: 1, edicao_atrasada: 1, para_enviar: 1,
    })
  })
  it("sem videomaker: o mais perto da data primeiro, e a recusa entra com o nome de quem recusou", () => {
    const a = alertasDasGravacoes(lista, hoje).find((x) => x.id === "sem_videomaker")!
    expect(a.itens.map((i) => i.cliente)).toEqual(["Clínica Perto", "Gravação", "Clínica Longe"])
    expect(a.itens[1].detalhe).toMatch(/^João Martins recusou · /)
  })
  it("material atrasado diz quem e há quanto tempo gravou; edição atrasada, os dias de atraso", () => {
    const alertas = alertasDasGravacoes(lista, hoje)
    expect(alertas.find((x) => x.id === "material_atrasado")!.itens[0].detalhe).toBe("João Martins · gravou há 2 dias")
    expect(alertas.find((x) => x.id === "edicao_atrasada")!.itens[0].detalhe).toBe("3 dias de atraso")
  })
  it("quem não vê nota não recebe alerta de nota nem de pagamento", () => {
    expect(alertasDasGravacoes(lista, hoje).map((a) => a.id)).not.toContain("pagamento")
  })
})

describe("alertas de nota e pagamento", () => {
  it("falta a nota, nota para compras, a refazer e pagamento a fazer", () => {
    const comNota = [
      g({ statusInterno: "editando", custos: [], notasFiscais: [] }),
      g({ statusInterno: "entregue_cliente", custos: [], notasFiscais: [{ status: "enviada" }] }),
      g({ statusInterno: "aprovado", custos: [{ statusPagamento: "contestado", pago: false }], notasFiscais: [] }),
      g({ statusInterno: "entregue_cliente", custos: [{ statusPagamento: "aguardando_pagamento", pago: false }], notasFiscais: [] }),
      g({ statusInterno: "entregue_cliente", custos: [{ statusPagamento: "pago", pago: true }], notasFiscais: [] }),
      g({ statusInterno: "captacao_agendada", custos: [], notasFiscais: [] }),
    ]
    expect(contagem(comNota)).toMatchObject({ nota_falta: 1, nota_compras: 1, nota_refazer: 1, pagamento: 1 })
    expect(alertasDasGravacoes(comNota, hoje).find((a) => a.id === "nota_compras")!.itens[0].detalhe).toBe("João Martins")
  })
})
