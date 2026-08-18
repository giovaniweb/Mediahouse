import { describe, it, expect } from "vitest"
import { resumirParados, textoDeParados, DIAS_PARA_COBRAR } from "@/lib/parados"

const AGORA = new Date("2026-08-18T12:00:00Z")
const haDias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000)

const parada = (codigo: string, dias: number) => ({ codigo, atualizadaEm: haDias(dias) })

describe("resumirParados", () => {
  it("conta como novidade só quem cruzou o limite hoje", () => {
    // A mesma demanda não pode aparecer como "nova" todos os dias — é assim que
    // um relatório diário vira papel de parede.
    const r = resumirParados(
      [parada("A", 7), parada("B", 7), parada("C", 8), parada("D", 30)],
      0,
      AGORA
    )
    expect(r.novasHoje).toBe(2)
    expect(r.total).toBe(4)
  })

  it("dá a idade da pior e cita as três mais antigas em ordem", () => {
    const r = resumirParados(
      [parada("NOVA", 8), parada("VELHA", 57), parada("MEDIA", 30), parada("OUTRA", 40)],
      0,
      AGORA
    )
    expect(r.diasDaPior).toBe(57)
    expect(r.piores).toEqual(["VELHA", "OUTRA", "MEDIA"])
  })

  it("aguenta lista vazia sem inventar número", () => {
    const r = resumirParados([], 0, AGORA)
    expect(r.total).toBe(0)
    expect(r.diasDaPior).toBe(0)
    expect(r.piores).toEqual([])
  })

  it("não altera a lista que recebeu", () => {
    const entrada = [parada("A", 3), parada("B", 90)]
    const copia = [...entrada]
    resumirParados(entrada, 0, AGORA)
    expect(entrada).toEqual(copia)
  })
})

describe("textoDeParados", () => {
  it("some quando não há nada parado", () => {
    // Dia limpo não merece um parágrafo dizendo que está limpo.
    expect(textoDeParados(resumirParados([], 0, AGORA))).toBe("")
  })

  it("traz o total, a idade da pior e os códigos", () => {
    const t = textoDeParados(
      resumirParados([parada("VOP-1", 57), parada("VOP-2", 40), parada("VOP-3", 9)], 31, AGORA)
    )
    expect(t).toContain("3 parada(s) no total")
    expect(t).toContain("57 dias")
    expect(t).toContain("31 demanda(s) com prazo vencido")
    expect(t).toContain("VOP-1, VOP-2, VOP-3")
  })

  it("omite a linha de novidade quando ninguém cruzou o limite hoje", () => {
    const t = textoDeParados(resumirParados([parada("VOP-1", 40)], 0, AGORA))
    expect(t).not.toContain("completaram")
  })

  it("omite a linha de prazo quando ninguém está atrasado", () => {
    const t = textoDeParados(resumirParados([parada("VOP-1", 40)], 0, AGORA))
    expect(t).not.toContain("prazo vencido")
  })

  it("não deixa o prazo vencido parecer subconjunto dos parados", () => {
    // Prazo vencido conta o quadro inteiro e pode ser MAIOR que o número de
    // paradas — a frase precisa se sustentar sozinha para não confundir.
    const t = textoDeParados(resumirParados([parada("VOP-1", 40)], 69, AGORA))
    expect(t).toContain("no quadro")
  })

  it("não lista as demandas uma a uma", () => {
    // Com 63 paradas, a lista completa repetiria na mensagem o erro que a
    // Central de Alertas cometeu na tela.
    const muitas = Array.from({ length: 63 }, (_, i) => parada(`VOP-${i}`, 10 + i))
    const t = textoDeParados(resumirParados(muitas, 40, AGORA))
    expect(t.split("\n").length).toBeLessThanOrEqual(5)
  })
})

describe("limiar", () => {
  it("é de uma semana — 14 dias dariam silêncio demais, 3 pegariam a operação inteira", () => {
    expect(DIAS_PARA_COBRAR).toBe(7)
  })
})
