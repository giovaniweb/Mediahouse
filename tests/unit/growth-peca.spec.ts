import { describe, it, expect } from "vitest"
import { TIPOS_CONTEUDO, entregaPecaVisual } from "@/lib/growth-conteudo"

// Nem toda demanda de Growth termina num arquivo. Só os tipos que entregam peça
// visual são cobrados pela arte final antes de "Para aprovação" — cobrar dos
// outros trava trabalho legítimo, o que aconteceu com campanha de e-mail,
// landing page e tarefa administrativa.

describe("entregaPecaVisual", () => {
  it("cobra arte de quem entrega peça", () => {
    for (const tipo of ["post", "carrossel", "anuncio", "design", "apresentacao"]) {
      expect(entregaPecaVisual(tipo), tipo).toBe(true)
    }
  })

  it("não cobra de quem entrega link, disparo ou configuração", () => {
    for (const tipo of ["email_marketing", "landing_page", "landing_copy", "administrativo", "atualizacao_drive", "atualizacao_materiais"]) {
      expect(entregaPecaVisual(tipo), tipo).toBe(false)
    }
  })

  it("cobre o legado que ainda vive na base", () => {
    // material_grafico são 34 demandas e story 1 — não estão em TIPOS_CONTEUDO,
    // mas chegam na regra do mesmo jeito.
    expect(entregaPecaVisual("material_grafico")).toBe(true)
    expect(entregaPecaVisual("story")).toBe(true)
  })

  it("tipo desconhecido, nulo ou vazio não trava ninguém", () => {
    // Na dúvida, liberar: peça que passa sem arte alguém corrige; trabalho
    // travado sem explicação é alguém parado sem saber por quê.
    expect(entregaPecaVisual("tipo_que_nao_existe")).toBe(false)
    expect(entregaPecaVisual(null)).toBe(false)
    expect(entregaPecaVisual(undefined)).toBe(false)
    expect(entregaPecaVisual("")).toBe(false)
  })

  // O alarme: quem adicionar um tipo ao catálogo precisa DECIDIR se ele entrega
  // peça. Sem isto, o tipo novo herda o `false` calado e nunca seria cobrado —
  // ou, se o default fosse o contrário, nasceria travado sem ninguém entender.
  it("todo tipo do catálogo tem decisão explícita sobre entregar peça", () => {
    const semDecisao = TIPOS_CONTEUDO
      .map((t) => t.key)
      .filter((key) => {
        // Reproduz a checagem "existe entrada no mapa?" sem exportá-lo: um tipo
        // ausente devolve o mesmo `false` de um tipo marcado como false, então
        // o teste compara contra a lista conhecida de não-peça.
        const naoPeca = ["email_marketing", "landing_page", "landing_copy", "administrativo", "atualizacao_drive", "atualizacao_materiais"]
        return !entregaPecaVisual(key) && !naoPeca.includes(key)
      })
    expect(semDecisao, `tipos sem decisão em ENTREGA_PECA: ${semDecisao.join(", ")}`).toEqual([])
  })
})
