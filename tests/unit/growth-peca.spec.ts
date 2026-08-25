import { describe, it, expect } from "vitest"
import { TIPOS_CONTEUDO, entregaPecaVisual, temDecisaoDePeca } from "@/lib/growth-conteudo"

// Nem toda demanda de Growth termina num arquivo. Só os tipos que entregam peça
// visual são cobrados pela arte final antes de "Para aprovação" — cobrar dos
// outros trava trabalho legítimo, o que aconteceu com campanha de e-mail,
// landing page e tarefa administrativa.

describe("entregaPecaVisual", () => {
  it("cobra arte de quem entrega peça", () => {
    for (const tipo of ["post", "carrossel", "anuncio"]) {
      expect(entregaPecaVisual(tipo), tipo).toBe(true)
    }
  })

  it("não cobra de quem entrega link, disparo ou configuração", () => {
    for (const tipo of ["email_marketing", "landing_page", "landing_copy", "administrativo", "atualizacao_drive", "atualizacao_materiais"]) {
      expect(entregaPecaVisual(tipo), tipo).toBe(false)
    }
  })

  it("apresentação e design saem por link do Canva/Drive — não se cobra arquivo", () => {
    // Havia arte em parte deles na base (design 4 de 9), o que faria a leitura
    // ingênua do dado colocá-los do outro lado. Quem opera decidiu que o
    // entregável é o link; anexar continua permitido, a obrigação é que sai.
    expect(entregaPecaVisual("apresentacao")).toBe(false)
    expect(entregaPecaVisual("design")).toBe(false)
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
    // Pergunta pela PRESENÇA no mapa, não pelo valor: "false" e "ausente"
    // devolvem o mesmo de entregaPecaVisual, então comparar por valor deixaria
    // um tipo novo passar batido — que é justamente o que este teste existe
    // para pegar.
    const semDecisao = TIPOS_CONTEUDO.map((t) => t.key).filter((key) => !temDecisaoDePeca(key))
    expect(semDecisao, `tipos sem decisão em ENTREGA_PECA: ${semDecisao.join(", ")}`).toEqual([])
  })

  it("e o alarme realmente dispara — um tipo sem entrada é detectado", () => {
    // Sem esta asserção o teste acima passaria mesmo que temDecisaoDePeca
    // devolvesse true para tudo, e o alarme seria enfeite.
    expect(temDecisaoDePeca("tipo_inventado_agora")).toBe(false)
    expect(temDecisaoDePeca("post")).toBe(true)
    expect(temDecisaoDePeca("design")).toBe(true)
  })
})
