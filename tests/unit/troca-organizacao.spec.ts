import { describe, it, expect, vi, beforeEach } from "vitest"

const { findUnique, findFirst, cookie } = vi.hoisted(() => ({
  findUnique: vi.fn(), findFirst: vi.fn(), cookie: { valor: undefined as string | undefined },
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/prisma-auth", () => ({ prismaAuth: { usuarioOrganizacao: { findUnique, findFirst } } }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => cookie.valor ? { value: cookie.valor } : undefined }) }))
const { getOrgId } = await import("@/lib/org")
const sessao = { user: { id: "u-1", organizacaoId: "org-token" } }
const membro = (organizacaoId = "org-token", ativo = true, status = "ativo") => ({ organizacaoId, organizacao: { ativo }, usuario: { status } })
beforeEach(() => { vi.clearAllMocks(); findUnique.mockReset(); findFirst.mockReset(); cookie.valor = undefined })

describe("organização revalidada", () => {
  it("respeita uma escolha válida", async () => {
    cookie.valor = "org-escolhida"; findUnique.mockResolvedValue(membro(cookie.valor))
    expect(await getOrgId(sessao)).toBe("org-escolhida")
    expect(findUnique.mock.calls[0][0].where.usuarioId_organizacaoId).toEqual({ usuarioId: "u-1", organizacaoId: cookie.valor })
  })
  it("cookie inválido não redireciona a escrita para a empresa do JWT", async () => {
    cookie.valor = "org-revogada"; findUnique.mockResolvedValue(null)
    expect(await getOrgId(sessao)).toBeNull()
    expect(findUnique).toHaveBeenCalledTimes(1); expect(findFirst).not.toHaveBeenCalled()
  })
  it("revalida também a empresa do JWT", async () => {
    findUnique.mockResolvedValue(membro())
    expect(await getOrgId(sessao)).toBe("org-token")
    expect(findUnique).toHaveBeenCalledTimes(1)
  })
  it("nega JWT cujo vínculo foi removido", async () => {
    findUnique.mockResolvedValue(null); expect(await getOrgId(sessao)).toBeNull()
  })
  it.each([membro("org-token", false), membro("org-token", true, "inativo")])("nega empresa/pessoa inativa", async (valor) => {
    findUnique.mockResolvedValue(valor); expect(await getOrgId(sessao)).toBeNull()
  })
  it("sessão legada só resolve vínculo ativo consultado no banco", async () => {
    findFirst.mockResolvedValue(membro("org-primeira"))
    expect(await getOrgId({ user: { id: "u-1" } })).toBe("org-primeira")
    expect(findFirst.mock.calls[0][0].where).toEqual({ usuarioId: "u-1", usuario: { status: "ativo" }, organizacao: { ativo: true } })
  })
  it("não concede acesso quando a consulta falha", async () => {
    findUnique.mockRejectedValue(new Error("banco indisponível"))
    await expect(getOrgId(sessao)).rejects.toThrow("banco indisponível")
    expect(findFirst).not.toHaveBeenCalled()
  })
  it.each([null, { user: { organizacaoId: "org-token" } }])("nega ausência de identidade", async (session) => {
    expect(await getOrgId(session)).toBeNull(); expect(findUnique).not.toHaveBeenCalled()
  })
})
