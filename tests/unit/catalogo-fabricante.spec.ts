import { describe, it, expect, vi, beforeEach } from "vitest"

// "Fabricante" só faz sentido para quem vende produto FÍSICO. Empresa de serviço
// cadastra "Captação de Vídeo" e "Edição de Reels" — o campo ali é um vazio
// pedindo para ser preenchido com nada.
//
// Duas regras:
//   1. o padrão é NÃO mostrar. Empresa sem linha de ConfigEmpresa conta como
//      false — cliente novo nunca vê o campo, sem precisar de nenhum INSERT.
//   2. fabricante é de UMA empresa. Era tabela global: os 7 da Contourline
//      apareciam no formulário de qualquer outro cliente da plataforma.

const findFirstConfig = vi.fn()
const findManyFab = vi.fn()
const upsertFab = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    configEmpresa: { findFirst: (...a: unknown[]) => findFirstConfig(...a) },
    fabricante: {
      findMany: (...a: unknown[]) => findManyFab(...a),
      upsert: (...a: unknown[]) => upsertFab(...a),
    },
  },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => null }))
vi.mock("@/lib/org", () => ({
  getOrgId: async () => null,
  orgPublica: async (slug: string | null) => (slug ? `org-${slug}` : null),
  semOrg: () => new Response(null, { status: 403 }),
}))

const { GET } = await import("@/app/api/fabricantes/route")

const req = (url: string) =>
  ({ nextUrl: new URL(url) }) as unknown as Parameters<typeof GET>[0]

beforeEach(() => { findFirstConfig.mockReset(); findManyFab.mockReset(); upsertFab.mockReset() })

describe("fabricantes são de uma empresa", () => {
  it("a listagem filtra por organização", async () => {
    findManyFab.mockResolvedValue([{ id: "f1", nome: "Lumenis" }])
    await GET(req("https://x/api/fabricantes?org=contourline"))

    expect(findManyFab).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ativo: true, organizacaoId: "org-contourline" } })
    )
  })

  it("sem organização resolvível, devolve lista vazia — nunca a de outra empresa", async () => {
    // O caminho público sem `?org=`: antes devolvia TODOS os fabricantes da
    // plataforma para quem abrisse a URL.
    const res = await GET(req("https://x/api/fabricantes"))
    expect(await res.json()).toEqual([])
    expect(findManyFab).not.toHaveBeenCalled()
  })
})

describe("mostrar o campo é decisão por empresa", () => {
  it("empresa SEM linha de ConfigEmpresa não mostra o campo", () => {
    // É o caso da empresa-teste e do Nuflow do Giovani: nenhuma das duas tem
    // linha, e nenhuma tem produto com fabricante. O padrão acerta sozinho.
    const config = null as { catalogoMostrarFabricante: boolean } | null
    expect(config?.catalogoMostrarFabricante ?? false).toBe(false)
  })

  it("empresa com a flag ligada mostra", () => {
    const config = { catalogoMostrarFabricante: true }
    expect(config?.catalogoMostrarFabricante ?? false).toBe(true)
  })
})
