import { describe, it, expect } from "vitest"
import { ArgumentoInvalido, editorCasa, whereDoStatus } from "@/lib/mcp-demandas"

// O filtro chega de um cliente MCP, escrito por gente ou por IA, do jeito que a
// pessoa lembra do nome: inteiro, em parte ou com complemento.

describe("editorCasa", () => {
  it("aceita o nome inteiro, parte dele e o nome com complemento", () => {
    expect(editorCasa("Cristiano Drummond", "Cristiano Drummond")).toBe(true)
    expect(editorCasa("Cristiano Drummond", "cristiano")).toBe(true)
    expect(editorCasa("Cristiano Drummond", "Drumm")).toBe(true)
    expect(editorCasa("Cristiano Drummond", "Cristiano Drummond - reels")).toBe(true)
  })

  it("ignora acento e caixa", () => {
    expect(editorCasa("João Araújo", "joao araujo")).toBe(true)
  })

  it("não casa trecho solto no meio de outra palavra", () => {
    expect(editorCasa("Ana Lima", "Mariana")).toBe(false)
    expect(editorCasa("Ana", "Mariana Souza")).toBe(false)
    expect(editorCasa("Cristiano Drummond", "Cristiano Silva")).toBe(false)
  })

  it("busca vazia não casa ninguém", () => {
    expect(editorCasa("Cristiano Drummond", "  - ")).toBe(false)
  })
})

describe("whereDoStatus", () => {
  it("sem status traz só as abertas; 'todas' tira o filtro", () => {
    expect(whereDoStatus()).toEqual({ statusVisivel: { not: "finalizado" } })
    expect(whereDoStatus("abertas")).toEqual({ statusVisivel: { not: "finalizado" } })
    expect(whereDoStatus("todas")).toEqual({})
  })

  it("aceita a coluna pelo código ou pelo rótulo da tela", () => {
    expect(whereDoStatus("edicao")).toEqual({ statusVisivel: "edicao" })
    expect(whereDoStatus("Edição")).toEqual({ statusVisivel: "edicao" })
    expect(whereDoStatus("Para Postar")).toEqual({ statusVisivel: "para_postar" })
  })

  it("aceita o status interno", () => {
    expect(whereDoStatus("fila_edicao")).toEqual({ statusInterno: "fila_edicao" })
  })

  it("status desconhecido vira erro que lista os válidos", () => {
    expect(() => whereDoStatus("pronto")).toThrow(ArgumentoInvalido)
    expect(() => whereDoStatus("pronto")).toThrow(/para_postar/)
  })
})
