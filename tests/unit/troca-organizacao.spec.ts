import { describe, it, expect, vi, beforeEach } from "vitest"

const { findUnique, findFirst, cookie } = vi.hoisted(() => ({
  findUnique: vi.fn(), findFirst: vi.fn(), cookie: { valor: undefined as string | undefined },
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/prisma-auth", () => ({ prismaAuth: { usuarioOrganizacao: { findUnique, findFirst } } }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => cookie.valor ? { value: cookie.valor } : undefined }) }))
const { getOrgId, comPapelDaEmpresaAtiva } = await import("@/lib/org")
const { ehGestor, papelNaOrg } = await import("@/lib/papel")
const sessao = { user: { id: "u-1", organizacaoId: "org-token" } }
const membro = (organizacaoId = "org-token", ativo = true, status = "ativo", papel = "admin") => ({ organizacaoId, papel, organizacao: { ativo }, usuario: { status } })
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

// O token guarda o papel do login (o da primeira empresa). A sessão relê o da
// empresa ativa: o Gabriel é videomaker na Contourline e admin na GH Produção.
describe("papel da sessão é o da empresa ativa", () => {
  const sessaoDoLogin = () => ({ user: { id: "u-1", organizacaoId: "org-contourline", papel: "videomaker" as string | null } })

  it("troca de empresa troca o papel", async () => {
    cookie.valor = "org-gh"; findUnique.mockResolvedValue(membro("org-gh", true, "ativo", "admin"))
    const s = await comPapelDaEmpresaAtiva(sessaoDoLogin())
    expect(s.user.papel).toBe("admin")
    expect(ehGestor(s as never)).toBe(true)
  })
  it("o inverso não escala: admin do login vira o papel da outra empresa", async () => {
    cookie.valor = "org-b"; findUnique.mockResolvedValue(membro("org-b", true, "ativo", "solicitante"))
    const s = await comPapelDaEmpresaAtiva({ user: { id: "u-1", organizacaoId: "org-a", papel: "admin" } })
    expect(s.user.papel).toBe("solicitante")
    expect(ehGestor(s as never)).toBe(false)
  })
  it.each([null, membro("org-gh", false)])("sem vínculo ativo, sem papel", async (valor) => {
    cookie.valor = "org-gh"; findUnique.mockResolvedValue(valor)
    const s = await comPapelDaEmpresaAtiva(sessaoDoLogin())
    expect(s.user.papel).toBeNull()
    expect(papelNaOrg(s as never)).toBeNull()
  })
  it("consulta falhando nega, não concede", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    findUnique.mockRejectedValue(new Error("banco indisponível"))
    const s = await comPapelDaEmpresaAtiva({ user: { id: "u-1", organizacaoId: "org-a", papel: "admin" } })
    expect(s.user.papel).toBeNull()
  })
  it("o cargo global não substitui papel ausente", () => {
    expect(papelNaOrg({ user: { id: "u-1", tipo: "admin", papel: null } } as never)).toBeNull()
    expect(ehGestor({ user: { id: "u-1", tipo: "admin" } } as never)).toBe(false)
  })
})
