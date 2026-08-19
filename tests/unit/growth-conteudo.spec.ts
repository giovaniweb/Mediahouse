import { describe, it, expect } from "vitest"
import { TIPOS_CONTEUDO, tipoConteudoDe, campoVisivel } from "@/lib/growth-conteudo"

// O carrossel perguntava se a copy estava pronta e não dava campo nenhum para
// ela. Uma pergunta só, que abre o campo certo para cada resposta.

describe("carrossel — seletor de copy", () => {
  const carrossel = tipoConteudoDe("carrossel")!
  const chave = (k: string) => carrossel.campos.find((c) => c.key === k)!

  it("tem um seletor de status, não duas perguntas booleanas", () => {
    expect(chave("statusCopy").opcoes).toEqual(["Pronta", "Precisa criar"])
    expect(carrossel.campos.find((c) => c.key === "copyPronta")).toBeUndefined()
    expect(carrossel.campos.find((c) => c.key === "precisaCopy")).toBeUndefined()
  })

  it("abre o campo de texto quando a copy está pronta", () => {
    const valores = { statusCopy: "Pronta" }
    expect(campoVisivel(chave("copyTexto"), valores)).toBe(true)
    expect(campoVisivel(chave("briefingCopy"), valores)).toBe(false)
  })

  it("abre o briefing quando a copy precisa ser criada", () => {
    const valores = { statusCopy: "Precisa criar" }
    expect(campoVisivel(chave("briefingCopy"), valores)).toBe(true)
    expect(campoVisivel(chave("copyTexto"), valores)).toBe(false)
  })

  it("não mostra nenhum dos dois enquanto ninguém respondeu", () => {
    expect(campoVisivel(chave("copyTexto"), {})).toBe(false)
    expect(campoVisivel(chave("briefingCopy"), {})).toBe(false)
  })

  it("campo sem dependência aparece sempre", () => {
    expect(campoVisivel(chave("slides"), {})).toBe(true)
  })
})

describe("catálogo", () => {
  it("todo campo select declara suas opções", () => {
    for (const tipo of TIPOS_CONTEUDO) {
      for (const campo of tipo.campos) {
        if (campo.tipo === "select") {
          expect(campo.opcoes, `${tipo.key}.${campo.key}`).toBeTruthy()
          expect(campo.opcoes!.length, `${tipo.key}.${campo.key}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it("todo visivelSe aponta para um campo que existe no mesmo tipo", () => {
    for (const tipo of TIPOS_CONTEUDO) {
      const chaves = new Set(tipo.campos.map((c) => c.key))
      for (const campo of tipo.campos) {
        if (campo.visivelSe) expect(chaves, `${tipo.key}.${campo.key}`).toContain(campo.visivelSe.campo)
      }
    }
  })

  it("nenhum label vira falsa copy na tela do cliente", () => {
    // O label é a chave gravada em detalhesEntrega, e extrairCopy adivinha pela
    // chave. Campo que PARECE copy sem ser copy quebra a tela de aprovação.
    const enganosos = TIPOS_CONTEUDO.flatMap((t) =>
      t.campos
        .filter((c) => /copy|legenda|caption/i.test(c.label) && c.tipo !== "textarea")
        .map((c) => `${t.key}.${c.key}`)
    )
    expect(enganosos).toEqual(["carrossel.statusCopy"])
  })
})
