import { describe, it, expect } from "vitest"
import {
  TIPOS_CONTEUDO, tipoConteudoDe, campoVisivel, campoDescricaoDe, CHAVE_DESCRICAO,
} from "@/lib/growth-conteudo"

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

  it("todo tipo tem exatamente um campo de descrição", () => {
    // Demanda.descricao é NOT NULL e alimenta a triagem por IA, a tela de campo
    // e o fallback da aprovação. Tipo sem este campo não conseguiria nem criar
    // a demanda — o POST seria recusado pelo zod.
    for (const tipo of TIPOS_CONTEUDO) {
      const marcados = tipo.campos.filter((c) => c.mapeiaPara === "descricao")
      expect(marcados, tipo.key).toHaveLength(1)
      expect(marcados[0].tipo, tipo.key).toBe("textarea")
      expect(marcados[0].key, tipo.key).toBe(CHAVE_DESCRICAO)
      expect(marcados[0].placeholder, tipo.key).toBeTruthy()
      expect(campoDescricaoDe(tipo)).toBe(marcados[0])
    }
  })

  it("a descrição é o primeiro campo e nunca é condicional", () => {
    // Se ela pudesse ficar escondida atrás de outra resposta, existiria um
    // estado em que a demanda não tem como ser preenchida.
    for (const tipo of TIPOS_CONTEUDO) {
      expect(tipo.campos[0].mapeiaPara, tipo.key).toBe("descricao")
      expect(tipo.campos[0].visivelSe, tipo.key).toBeUndefined()
      expect(campoVisivel(tipo.campos[0], {}), tipo.key).toBe(true)
    }
  })

  it("a chave da descrição é a mesma em todo tipo — sobrevive à troca", () => {
    const chavesUsadas = new Set(TIPOS_CONTEUDO.map((t) => campoDescricaoDe(t)!.key))
    expect([...chavesUsadas]).toEqual([CHAVE_DESCRICAO])
  })

  it("formato é cartão visual, não dropdown", () => {
    // Três opções escondidas atrás de um clique é atrito à toa.
    for (const k of ["carrossel", "post"]) {
      const formato = tipoConteudoDe(k)!.campos.find((c) => c.key === "formato")!
      expect(formato.tipo, k).toBe("radio-visual")
      expect(formato.opcoesVisuais?.map((o) => o.valor), k).toEqual(["1:1", "4:5", "9:16"])
      expect(formato.opcoesVisuais?.map((o) => o.icone), k).toEqual(["quadrado", "retrato", "celular"])
      // O tamanho em pixels continua à vista, agora como linha de apoio.
      expect(formato.opcoesVisuais?.every((o) => /\d{3,4} × \d{3,4}/.test(o.rotulo)), k).toBe(true)
    }
  })

  it("toda opção visual tem ícone conhecido", () => {
    const validos = ["quadrado", "retrato", "celular"]
    for (const tipo of TIPOS_CONTEUDO) {
      for (const campo of tipo.campos) {
        if (campo.tipo !== "radio-visual") continue
        expect(campo.opcoesVisuais, `${tipo.key}.${campo.key}`).toBeTruthy()
        for (const o of campo.opcoesVisuais!) {
          expect(validos, `${tipo.key}.${campo.key}`).toContain(o.icone)
        }
      }
    }
  })

  it("anúncio pergunta plataforma, público e dor — e tem onde colar a copy", () => {
    expect(chaves("anuncio")).toEqual([CHAVE_DESCRICAO, "plataforma", "publico", "dor", "copyTexto"])
    const plataforma = tipoConteudoDe("anuncio")!.campos.find((c) => c.key === "plataforma")!
    expect(plataforma.opcoes).toEqual(["Meta Ads", "Google Ads", "TikTok", "LinkedIn", "Outro"])
  })

  it("todo tipo com peça de copy tem onde colar o texto", () => {
    // Sem isto o cliente vê a descrição no lugar da copy na tela de aprovação.
    for (const k of ["anuncio", "carrossel", "post"]) {
      const temCopy = tipoConteudoDe(k)!.campos.some(
        (c) => c.tipo === "textarea" && /copy|legenda/i.test(c.label)
      )
      expect(temCopy, k).toBe(true)
    }
  })

  it("email marketing não pergunta objetivo e descrição em campos separados", () => {
    const campos = tipoConteudoDe("email_marketing")!.campos
    expect(campoDescricaoDe(tipoConteudoDe("email_marketing"))!.label).toBe("Objetivo da campanha")
    // Os três campos curtos que sobram fecham as linhas do grid de 2 colunas.
    expect(campos.filter((c) => c.tipo === "text").every((c) => c.largura !== "inteira")).toBe(true)
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
