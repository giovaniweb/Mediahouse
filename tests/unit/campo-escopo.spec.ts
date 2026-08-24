import { describe, it, expect, vi, beforeEach } from "vitest"

// O painel de campo inverte a regra do resto do sistema: nas telas internas a
// pessoa está DENTRO de uma empresa; aqui ela é profissional da REDE e vê o
// trabalho dela em todas as empresas que a contrataram — a agenda é uma só.
//
// O que não pode virar: ver a operação de empresa que nunca a contratou. Até
// 24/08/2026, campo/agenda e campo/ranking consultavam sem escopo NENHUM, e o
// ramo de admin em campo/demandas devolvia as 159 demandas ativas da plataforma
// inteira para qualquer admin.
//
// A fronteira é o vínculo — e bloqueio conta: quem a empresa barrou não deve
// continuar enxergando a operação dela.

const findMany = vi.fn()
const findFirst = vi.fn()
const findManyOrg = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    videomakerOrganizacao: { findMany: (...a: unknown[]) => findMany(...a) },
    videomaker: { findFirst: (...a: unknown[]) => findFirst(...a) },
    organizacao: { findMany: (...a: unknown[]) => findManyOrg(...a) },
  },
}))

const { organizacoesDoVideomaker, etiquetasDeOrganizacao } = await import("@/lib/campo-escopo")

beforeEach(() => { findMany.mockReset(); findFirst.mockReset(); findManyOrg.mockReset() })

describe("organizacoesDoVideomaker — a fronteira do painel", () => {
  it("devolve as empresas do vínculo e EXCLUI as que bloquearam a pessoa", async () => {
    findMany.mockResolvedValue([{ organizacaoId: "org-A" }, { organizacaoId: "org-B" }])
    const r = await organizacoesDoVideomaker("vm-1")

    expect(r).toEqual(["org-A", "org-B"])
    // `emListaNegra: false` no where é o que impede quem foi barrado de
    // continuar vendo agenda e ranking da empresa.
    expect(findMany).toHaveBeenCalledWith({
      where: { videomakerId: "vm-1", emListaNegra: false },
      select: { organizacaoId: true },
    })
  })

  it("sem vínculo nenhum, devolve lista vazia — nunca 'sem filtro'", async () => {
    // Quem chama trata vazio como "não mostra nada". A diferença entre lista
    // vazia e ausência de filtro é exatamente o bug que existia.
    findMany.mockResolvedValue([])
    expect(await organizacoesDoVideomaker("vm-sem-trabalho")).toEqual([])
  })
})

describe("etiquetasDeOrganizacao", () => {
  it("não consulta o banco com lista vazia", async () => {
    expect((await etiquetasDeOrganizacao([])).size).toBe(0)
    expect(findManyOrg).not.toHaveBeenCalled()
  })

  it("deduplica ids antes de consultar", async () => {
    findManyOrg.mockResolvedValue([{ id: "org-A", nome: "Contourline", slug: "contourline" }])
    const m = await etiquetasDeOrganizacao(["org-A", "org-A", "org-A"])

    expect(findManyOrg).toHaveBeenCalledWith({
      where: { id: { in: ["org-A"] } },
      select: { id: true, nome: true, slug: true },
    })
    expect(m.get("org-A")).toEqual({ nome: "Contourline", slug: "contourline" })
  })
})
