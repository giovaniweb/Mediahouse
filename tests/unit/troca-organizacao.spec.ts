import { describe, it, expect, vi, beforeEach } from "vitest"

// Uma pessoa pode ser membro de várias empresas. A escolha de qual está ativa
// viaja num cookie — e cookie é coisa que o cliente controla.
//
// A regra: o cookie é PALPITE, a membership é a autoridade. Toda requisição
// reconfere no banco. Cookie forjado com o id da empresa de outra pessoa não dá
// acesso a nada; a resolução cai no padrão como se ele não existisse.
//
// Antes disto, `getOrgId` devolvia a primeira membership por `createdAt` e quem
// tivesse duas empresas ficava preso na mais antiga, sem como entrar na outra.

const findUnique = vi.fn()
const findFirst = vi.fn()
let cookieValor: string | undefined

vi.mock("@/lib/prisma", () => ({
  prisma: {
    usuarioOrganizacao: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
    },
  },
}))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "org_ativa" && cookieValor ? { value: cookieValor } : undefined) }),
}))

const { getOrgId } = await import("@/lib/org")
const sessao = { user: { id: "u-1", organizacaoId: "org-token" } }

beforeEach(() => {
  findUnique.mockReset(); findFirst.mockReset(); cookieValor = undefined
})

describe("getOrgId com organização escolhida", () => {
  it("respeita o cookie quando a membership existe", async () => {
    cookieValor = "org-escolhida"
    findUnique.mockResolvedValue({ organizacaoId: "org-escolhida" })

    expect(await getOrgId(sessao)).toBe("org-escolhida")
    expect(findUnique).toHaveBeenCalledWith({
      where: { usuarioId_organizacaoId: { usuarioId: "u-1", organizacaoId: "org-escolhida" } },
      select: { organizacaoId: true },
    })
  })

  it("IGNORA cookie de empresa da qual a pessoa não é membro", async () => {
    // O caso que importa: cookie forjado com o id da empresa de outra pessoa.
    cookieValor = "org-de-outro"
    findUnique.mockResolvedValue(null) // não há membership

    expect(await getOrgId(sessao)).toBe("org-token") // cai no padrão
  })

  it("ignora membership revogada e volta para a do token", async () => {
    cookieValor = "org-antiga"
    findUnique.mockResolvedValue(null)
    expect(await getOrgId(sessao)).toBe("org-token")
  })

  it("sem cookie, nem consulta a membership escolhida", async () => {
    expect(await getOrgId(sessao)).toBe("org-token")
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("token antigo sem organização cai na primeira membership", async () => {
    findFirst.mockResolvedValue({ organizacaoId: "org-primeira" })
    expect(await getOrgId({ user: { id: "u-1" } })).toBe("org-primeira")
  })

  it("sem sessão, não resolve nada", async () => {
    expect(await getOrgId(null)).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
    expect(findFirst).not.toHaveBeenCalled()
  })
})
