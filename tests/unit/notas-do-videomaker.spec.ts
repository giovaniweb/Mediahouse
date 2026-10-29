import { describe, expect, it } from "vitest"
import { estadoDaNotaDoVideomaker, pedeNota } from "@/lib/notas-do-videomaker"
import { mensagemDaNotaEmLote } from "@/lib/avisos-gravacao-textos"

// Minhas notas fiscais: só aparece o que teve a nota pedida.
const g = (statusInterno: string, notas: string[] = [], custos: string[] = []) => ({
  statusInterno,
  notasFiscais: notas.map((status) => ({ status })),
  custos: custos.map((statusPagamento) => ({ statusPagamento, pago: statusPagamento === "pago" })),
})

describe("em que pé está a nota do videomaker", () => {
  it("material chegou e a nota foi pedida: falta; card antigo sem pedido: some", () => {
    expect(estadoDaNotaDoVideomaker(g("editando", ["pendente"]), "vm")).toBe("falta")
    expect(estadoDaNotaDoVideomaker(g("entregue_cliente"), "vm")).toBeNull()
    expect(estadoDaNotaDoVideomaker(g("captacao_agendada"), "vm")).toBeNull()
  })
  it("cancelada com cobrança espera a nota", () => {
    expect(estadoDaNotaDoVideomaker(g("encerrado", ["pendente"]), "vm")).toBe("falta")
  })
  it("devolvida para refazer; depois recebida, em compras e paga", () => {
    expect(estadoDaNotaDoVideomaker(g("aprovado", ["enviada"], ["contestado"]), "vm")).toBe("refazer")
    expect(estadoDaNotaDoVideomaker(g("aprovado", ["enviada"], ["nf_enviada"]), "vm")).toBe("recebida")
    expect(estadoDaNotaDoVideomaker(g("aprovado", ["enviada"], ["aguardando_pagamento"]), "vm")).toBe("compras")
    expect(estadoDaNotaDoVideomaker(g("entregue_cliente", ["enviada"], ["pago"]), "vm")).toBe("paga")
  })
  it("pede nota só falta e refazer", () => {
    expect(["falta", "refazer", "recebida", "compras", "paga", null].map((e) => pedeNota(e as never))).toEqual([true, true, false, false, false, false])
  })
})

describe("aviso da nota que cobre várias gravações", () => {
  it("um aviso só, para a operação, com a lista", () => {
    const m = mensagemDaNotaEmLote("Gabriel", ["Clínica A (VOP-1)", "Clínica B (VOP-2)"])
    expect(Object.keys(m)).toEqual(["operacao"])
    expect(m.operacao).toContain("A nota de Gabriel chegou para 2 gravações: Clínica A (VOP-1), Clínica B (VOP-2).")
  })
})
