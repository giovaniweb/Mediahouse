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
    expect(campoVisivel(chave("formato"), {})).toBe(true)
  })

  it("não pede a quantidade de slides antes de a copy existir", () => {
    // Quem escreve a copy é que descobre em quantos slides ela cabe. Pedir o
    // número na abertura só cria um combinado para desobedecer depois.
    expect(carrossel.campos.find((c) => c.key === "slides")).toBeUndefined()
  })
})

describe("catálogo", () => {
  const chaves = (k: string) => tipoConteudoDe(k)!.campos.map((c) => c.key)

  it("não repete o que o rodapé fixo já pede", () => {
    // Arquivos, links de referência e link dos brutos são do rodapé. Campo aqui
    // com o mesmo papel compete com ele e ninguém sabe qual preencher.
    const duplicados = TIPOS_CONTEUDO.flatMap((t) =>
      t.campos
        .filter((c) => /refer[êe]ncia|anexo|arquivo|link|brutos/i.test(c.label))
        .map((c) => `${t.key}.${c.key}`)
    )
    expect(duplicados).toEqual([])
  })

  it("tipos simples não têm miolo — o formulário esconde o bloco inteiro", () => {
    for (const k of ["administrativo", "apresentacao", "atualizacao_drive", "atualizacao_materiais", "design"]) {
      expect(tipoConteudoDe(k)!.campos, k).toEqual([])
    }
  })

  it("formato é escolha fechada, com o tamanho em pixels junto", () => {
    const esperado = ["4:5 (1080x1350)", "9:16 (1080x1920)", "1:1 (1080x1080)"]
    for (const k of ["carrossel", "post"]) {
      const formato = tipoConteudoDe(k)!.campos.find((c) => c.key === "formato")!
      expect(formato.tipo, k).toBe("select")
      expect(formato.opcoes, k).toEqual(esperado)
    }
  })

  it("anúncio pergunta plataforma, público e dor — não 'canal' em texto livre", () => {
    expect(chaves("anuncio")).toEqual(["plataforma", "publico", "dor"])
    const plataforma = tipoConteudoDe("anuncio")!.campos[0]
    expect(plataforma.opcoes).toEqual(["Meta Ads", "Google Ads", "TikTok", "LinkedIn", "Outro"])
  })

  it("email marketing fecha as duas linhas do grid de 2 colunas", () => {
    const campos = tipoConteudoDe("email_marketing")!.campos
    expect(campos).toHaveLength(4)
    expect(campos.every((c) => c.largura !== "inteira")).toBe(true)
  })

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
      const doTipo = new Set(tipo.campos.map((c) => c.key))
      for (const campo of tipo.campos) {
        if (campo.visivelSe) expect(doTipo, `${tipo.key}.${campo.key}`).toContain(campo.visivelSe.campo)
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
