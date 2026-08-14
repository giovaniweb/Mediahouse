import { describe, it, expect } from "vitest"
import { lerNumero, lerInteiro, lerValorMonetario } from "@/lib/numeros"

describe("lerNumero", () => {
  it("preserva o zero — era ele que sumia no `valor ? ... : atual`", () => {
    expect(lerNumero(0)).toBe(0)
    expect(lerNumero("0")).toBe(0)
  })

  it("recusa texto não numérico em vez de devolver NaN", () => {
    // parseFloat("abacaxi") dava NaN, e o Postgres aceita NaN em double precision.
    expect(lerNumero("abacaxi")).toBeNull()
    expect(lerNumero("12abc")).toBeNull()
  })

  it("recusa NaN e infinito", () => {
    expect(lerNumero(NaN)).toBeNull()
    expect(lerNumero(Infinity)).toBeNull()
  })

  it("ausência vira null", () => {
    expect(lerNumero(null)).toBeNull()
    expect(lerNumero(undefined)).toBeNull()
    expect(lerNumero("")).toBeNull()
  })

  it("lê decimal com ponto e ignora espaço em volta", () => {
    expect(lerNumero(" 1234.56 ")).toBe(1234.56)
  })

  it("não trunca no separador como o parseFloat fazia", () => {
    // parseFloat("1.234,56") devolvia 1.234 — os centavos viravam a unidade.
    expect(lerNumero("1.234,56")).toBeNull()
  })
})

describe("lerInteiro", () => {
  it("aceita inteiro", () => {
    expect(lerInteiro("202608")).toBe(202608)
  })

  it("recusa fracionário em vez de truncar em silêncio", () => {
    // parseInt("3.9") devolvia 3 sem avisar.
    expect(lerInteiro("3.9")).toBeNull()
  })

  it("recusa texto", () => {
    expect(lerInteiro("abc")).toBeNull()
  })
})

describe("lerValorMonetario", () => {
  it("distingue campo ausente de campo inválido", () => {
    expect(lerValorMonetario(undefined)).toEqual({ presente: false, ok: true, valor: null })
    expect(lerValorMonetario("abc")).toEqual({ presente: true, ok: false, valor: null })
  })

  it("zero é um valor legítimo e presente", () => {
    expect(lerValorMonetario(0)).toEqual({ presente: true, ok: true, valor: 0 })
  })

  it("recusa negativo", () => {
    expect(lerValorMonetario(-5).ok).toBe(false)
  })

  it("null explícito limpa o campo", () => {
    expect(lerValorMonetario(null)).toEqual({ presente: true, ok: true, valor: null })
  })
})
