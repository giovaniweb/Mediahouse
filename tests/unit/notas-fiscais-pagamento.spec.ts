import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
import { finalDaChave, linhasDoPagamento, pagamentoDe, pixResumido, resumoDoPagamento, rotuloDoValor, tipoDaChavePix } from "@/lib/pagamento-do-videomaker"
import { estadoNoPainel, retratoDasNotas } from "@/lib/notas-fiscais-painel"
import { emailDaNota, sinoDaNota } from "@/lib/avisos-entrega-videomaker"
import { templateAvisoDaOperacao } from "@/lib/email"
import type { DadosDoAviso } from "@/lib/avisos-gravacao-textos"

// Notas fiscais dos videomakers (Giovani, 12/11/2026): dados de pagamento no
// aviso, e-mail da Débora com o trabalho, página com o estado de cada nota.

describe("chave PIX", () => {
  it("descobre o tipo pelo formato", () => {
    expect(tipoDaChavePix("529.982.247-25")).toBe("CPF")
    expect(tipoDaChavePix("41999998888")).toBe("Telefone")
    expect(tipoDaChavePix("+55 41 99999-8888")).toBe("Telefone")
    expect(tipoDaChavePix("12.345.678/0001-95")).toBe("CNPJ")
    expect(tipoDaChavePix("joao@exemplo.com")).toBe("E-mail")
    expect(tipoDaChavePix("123e4567-e89b-12d3-a456-426614174000")).toBe("Aleatória")
    expect(tipoDaChavePix("  ")).toBeNull()
  })
  it("o final tem 4 caracteres e nunca a chave inteira", () => {
    expect(finalDaChave("529.982.247-25")).toBe("4725")
    expect(finalDaChave("12")).toBeNull()
    expect(pixResumido({ chavePix: "529.982.247-25", tipoPix: "CPF" })).toBe("CPF final 4725")
  })
})

describe("valor e linhas do pagamento", () => {
  const f = { chavePix: "529.982.247-25", dadosBancarios: null, cpfCnpj: "12.345.678/0001-95", razaoSocial: "JM Filmes" }
  it("usa o custo confirmado; sem ele, a diária combinada, marcada como a confirmar", () => {
    expect(rotuloDoValor(pagamentoDe([{ valor: 750, valorConfirmadoEm: new Date() }], 600, f))).toBe("R$ 750,00")
    expect(rotuloDoValor(pagamentoDe([{ valor: 0, valorConfirmadoEm: null }], 600, f))).toBe("R$ 600,00 (diária combinada, a confirmar)")
    expect(rotuloDoValor(pagamentoDe([], null, f))).toBe("A confirmar")
  })
  it("linhas completas para o e-mail; resumo sem a chave para sino e WhatsApp", () => {
    const p = pagamentoDe([], 600, f)
    expect(linhasDoPagamento(p)).toEqual([
      ["Valor", "R$ 600,00 (diária combinada, a confirmar)"],
      ["PIX (CPF)", "529.982.247-25"],
      ["CNPJ da nota", "12.345.678/0001-95"],
      ["Razão social", "JM Filmes"],
    ])
    expect(resumoDoPagamento(p)).toBe("Valor: R$ 600,00 (diária combinada, a confirmar) · PIX CPF final 4725")
    expect(resumoDoPagamento(p)).not.toContain("529.982")
    expect(linhasDoPagamento(pagamentoDe([], 600, null))).toContainEqual(["PIX", "Não cadastrado — peça ao videomaker"])
  })
})

describe("e-mail da nota", () => {
  const g: DadosDoAviso = {
    codigo: "VOP-26-2001", titulo: "Treinamento", statusInterno: "brutos_enviados", clienteFinalNome: "Dra. Ana Lima",
    tipoGravacao: "conteudo", dataCaptacao: "2026-11-10T13:00:00.000Z", localGravacao: "Clínica Cristal", cidade: "Curitiba",
    videomakerId: "vm", videomaker: { nome: "João Martins" },
    linkNota: "https://nuflow.space/api/midia/org/o/nf/n.pdf?token=t", linkCard: "https://nuflow.space/jobs/abc",
  }
  const p = pagamentoDe([], 600, { chavePix: "529.982.247-25", dadosBancarios: null, cpfCnpj: null, razaoSocial: null })
  it("com pagamento: trabalho (tipo, data, local, médico, código, card) e PIX inteiro", () => {
    const { assunto, dados } = emailDaNota([g], [p])
    const html = templateAvisoDaOperacao(dados)
    expect(assunto).toBe("Nota fiscal de João Martins — Dra. Ana Lima (VOP-26-2001)")
    expect(assunto).not.toContain("529")
    for (const t of ["Nota fiscal para pagamento", "Gravação — ", "10/11", "Clínica Cristal — Curitiba", "Dra. Ana Lima", "VOP-26-2001", "529.982.247-25", "Dados de pagamento", 'href="https://nuflow.space/jobs/abc"', "Abrir a nota fiscal"]) {
      expect(html).toContain(t)
    }
  })
  it("sem pagamento: o de antes, sem valor nem PIX", () => {
    const html = templateAvisoDaOperacao(emailDaNota([g]).dados)
    expect(html).not.toContain("529.982")
    expect(html).not.toContain("R$")
  })
  it("nota de várias gravações soma o valor", () => {
    const html = templateAvisoDaOperacao(emailDaNota([g, { ...g, codigo: "VOP-26-2002" }], [p, p]).dados)
    expect(html).toContain("Valor total")
    expect(html).toContain("R$ 1.200,00")
    expect(html).toContain("Gravação 2 de 2")
  })
  it("sino: com pagamento, só o resumo", () => {
    expect(sinoDaNota(g, p)).toContain("PIX CPF final 4725")
    expect(sinoDaNota(g, p)).not.toContain("529.982")
    expect(sinoDaNota(g)).not.toContain("PIX")
  })
})

describe("estado na página Notas fiscais", () => {
  const base = { statusInterno: "brutos_enviados", videomakerId: "vm" }
  const custo = (c: Partial<{ statusPagamento: string; pago: boolean; cadastradoPagamentoEm: string | null }>) => ({ statusPagamento: "nf_enviada", pago: false, cadastradoPagamentoEm: null, ...c })
  it("pendente, enviada, cadastrada, paga e sem pedido", () => {
    expect(estadoNoPainel({ ...base, custos: [], notasFiscais: [{ status: "pendente" }] })).toBe("pendente")
    expect(estadoNoPainel({ ...base, custos: [custo({ statusPagamento: "contestado" })], notasFiscais: [] })).toBe("pendente")
    expect(estadoNoPainel({ ...base, custos: [custo({})], notasFiscais: [{ status: "enviada" }] })).toBe("enviada")
    expect(estadoNoPainel({ ...base, custos: [custo({ statusPagamento: "aguardando_pagamento" })], notasFiscais: [] })).toBe("enviada")
    expect(estadoNoPainel({ ...base, custos: [custo({ statusPagamento: "aguardando_pagamento", cadastradoPagamentoEm: "2026-11-12" })], notasFiscais: [] })).toBe("cadastrada")
    expect(estadoNoPainel({ ...base, custos: [custo({ statusPagamento: "pago", pago: true, cadastradoPagamentoEm: "2026-11-12" })], notasFiscais: [] })).toBe("paga")
    expect(estadoNoPainel({ ...base, statusInterno: "encerrado", custos: [], notasFiscais: [] })).toBe("sem_pedido")
  })
  it("o retrato conta cada estado", () => {
    expect(retratoDasNotas(["pendente", "enviada", "enviada", "sem_pedido"])).toEqual({ pendente: 1, enviada: 2, cadastrada: 0, paga: 0, sem_pedido: 1, total: 4 })
  })
})
