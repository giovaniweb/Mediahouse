import { describe, expect, it } from "vitest"
import { painelDasGravacoes, travaDaGravacao, type GravacaoDoPainel } from "@/lib/painel-gravacoes"

// Quinta, 29/10/2026. Horários em UTC: 16:00Z = 13:00 em São Paulo.
const hoje = "2026-10-29"
let n = 0
const g = (o: Partial<GravacaoDoPainel>): GravacaoDoPainel => ({
  id: `g${++n}`, codigo: `VOP-26-${2000 + n}`, titulo: "Gravação", statusInterno: "captacao_agendada",
  videomakerId: "vm1", videomaker: { nome: "João Martins" }, ...o,
})

describe("o que travou", () => {
  it("sem videomaker a até 2 dias da data, ou já passada", () => {
    expect(travaDaGravacao(g({ statusInterno: "aguardando_triagem", videomakerId: null, videomaker: null, dataCaptacao: "2026-10-31T16:00:00Z" }), hoje))
      .toMatchObject({ motivo: "Sem videomaker", tom: "sobrecarga" })
    expect(travaDaGravacao(g({ statusInterno: "aguardando_triagem", videomakerId: null, videomaker: null, dataCaptacao: "2026-11-02T16:00:00Z" }), hoje)).toBeNull()
  })
  it("convite sem resposta perto da data; recusa trava na hora", () => {
    expect(travaDaGravacao(g({ statusInterno: "videomaker_notificado", dataCaptacao: "2026-10-30T16:00:00Z" }), hoje))
      .toMatchObject({ motivo: "Sem confirmação", tom: "sobrecarga" })
    expect(travaDaGravacao(g({ statusInterno: "videomaker_notificado", dataCaptacao: "2026-10-31T16:00:00Z" }), hoje))
      .toMatchObject({ motivo: "Sem confirmação", tom: "atencao" })
    expect(travaDaGravacao(g({ statusInterno: "videomaker_recusou", dataCaptacao: "2026-11-20T16:00:00Z" }), hoje))
      .toMatchObject({ motivo: "Videomaker recusou", tom: "sobrecarga" })
  })
  it("falta o material: âmbar nos dois primeiros dias, vermelho do terceiro em diante", () => {
    expect(travaDaGravacao(g({ dataCaptacao: "2026-10-28T16:00:00Z" }), hoje)).toMatchObject({ motivo: "Falta o material · 1 dia", tom: "atencao" })
    expect(travaDaGravacao(g({ dataCaptacao: "2026-10-26T16:00:00Z" }), hoje)).toMatchObject({ motivo: "Falta o material · 3 dias", tom: "sobrecarga" })
    expect(travaDaGravacao(g({ dataCaptacao: "2026-10-30T16:00:00Z" }), hoje)).toBeNull()
  })
  it("nota a refazer", () => {
    expect(travaDaGravacao(g({ statusInterno: "editando", custos: [{ statusPagamento: "contestado", pago: false }], notasFiscais: [] }), hoje))
      .toMatchObject({ motivo: "Nota a refazer" })
  })
})

describe("o painel", () => {
  const lista = [
    g({ statusInterno: "aguardando_triagem", videomakerId: null, videomaker: null, dataCaptacao: "2026-10-30T16:00:00Z", tipoGravacao: "evento" }),
    g({ dataCaptacao: "2026-10-29T13:00:00Z", tipoGravacao: "entrega_equipamento" }),
    g({ dataCaptacao: "2026-10-26T16:00:00Z", tipoGravacao: "entrega_equipamento" }),
    g({ statusInterno: "editando", dataCaptacao: "2026-10-20T16:00:00Z", tipoGravacao: "demonstracao", videomakerId: "vm2", videomaker: { nome: "Ana" } }),
    g({ statusInterno: "aprovado", dataCaptacao: "2026-10-15T16:00:00Z" }),
    g({ statusInterno: "entregue_cliente", dataCaptacao: "2026-10-05T16:00:00Z", finalizadaEm: "2026-10-12T15:00:00Z", tipoGravacao: "conteudo" }),
    g({ statusInterno: "entregue_cliente", dataCaptacao: "2026-09-20T16:00:00Z", finalizadaEm: "2026-09-25T15:00:00Z" }),
    g({ statusInterno: "encerrado", dataCaptacao: "2026-10-10T16:00:00Z", finalizadaEm: "2026-10-11T15:00:00Z" }),
    g({ dataCaptacao: "2026-11-06T16:00:00Z" }),
  ]
  const p = painelDasGravacoes(lista, hoje)

  it("conta as etapas; concluído só o do mês, e entregue", () => {
    expect(Object.fromEntries(p.etapas.map((e) => [e.id, e.demandas]))).toEqual({
      a_agendar: 1, agendado: 3, em_edicao: 1, para_enviar: 1, concluido: 1,
    })
    expect(p.etapas.find((e) => e.id === "para_enviar")!.label).toBe("Para enviar")
  })
  it("os números do alto", () => {
    expect(p.numeros).toEqual({ aAgendar: 1, proximos: 2, faltaMaterial: 1, paraEnviar: 1 })
  })
  it("próximos 7 dias em ordem, com quem vai; o dia 7 fica de fora", () => {
    expect(p.proximas.map((x) => [x.momento.dia, x.situacao, x.videomaker])).toEqual([
      ["2026-10-29", "agendada", "João Martins"],
      ["2026-10-30", "sem_videomaker", null],
    ])
  })
  it("travas: o vermelho primeiro", () => {
    expect(p.travas.map((t) => t.motivo)).toEqual(["Falta o material · 3 dias", "Sem videomaker"])
  })
  it("o mês: gravado com videomaker, por tipo e por videomaker; encerrado não conta", () => {
    expect(p.mes.total).toBe(5)
    expect(p.mes.porTipo).toEqual([
      { id: "entrega_equipamento", label: "Entrega de equipamento", demandas: 2 },
      { id: "demonstracao", label: "Demonstração", demandas: 1 },
      { id: "conteudo", label: "Conteúdo", demandas: 1 },
      { id: "", label: "Sem tipo", demandas: 1 },
    ])
    expect(p.mes.porVideomaker).toEqual([{ id: "vm1", nome: "João Martins", gravacoes: 4 }, { id: "vm2", nome: "Ana", gravacoes: 1 }])
  })
  it("sem custos na lista, sem bloco de nota", () => {
    expect(p.notas).toBeNull()
  })
  it("com custos: o que falta, o que chegou, o que está em compras", () => {
    const comNota = painelDasGravacoes([
      g({ statusInterno: "editando", custos: [], notasFiscais: [] }),
      g({ statusInterno: "aprovado", custos: [], notasFiscais: [{ status: "enviada" }] }),
      g({ statusInterno: "aprovado", custos: [{ statusPagamento: "aguardando_pagamento", pago: false }], notasFiscais: [] }),
      g({ statusInterno: "entregue_cliente", custos: [{ statusPagamento: "pago", pago: true }], notasFiscais: [] }),
      g({ statusInterno: "captacao_agendada", custos: [], notasFiscais: [] }),
    ], hoje)
    expect(comNota.notas).toEqual({ falta: 1, recebida: 1, compras: 1, contestada: 0 })
  })
})
