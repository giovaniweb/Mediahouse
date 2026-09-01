import { describe, it, expect, vi, beforeEach } from "vitest"

// O painel da plataforma dá a um usuário o poder de ligar e desligar empresas
// inteiras. Duas regras não podem regredir:
//
//   1. só super-admin alcança — e a autorização mora no SERVIDOR. Esconder o
//      item do menu é conveniência; quem digita a URL tem que bater na parede.
//   2. ninguém se tranca para fora. Desligar a própria última empresa ativa
//      deixaria a pessoa sem organização resolvível no meio da sessão, e a tela
//      quebraria sem dizer por quê.

const findUniqueMembership = vi.fn()
const countMembership = vi.fn()
const updateOrg = vi.fn()
const findUniqueUsuario = vi.fn()

// O painel de Super Admin passou a usar `prismaAdmin` (conexão de dono) e a
// checagem de super-admin usa `prismaAuth`. Os três apontam para o mesmo fake.
const clienteFake = {
  usuarioOrganizacao: {
    findUnique: (...a: unknown[]) => findUniqueMembership(...a),
    count: (...a: unknown[]) => countMembership(...a),
  },
  organizacao: { update: (...a: unknown[]) => updateOrg(...a) },
  usuario: { findUnique: (...a: unknown[]) => findUniqueUsuario(...a) },
}
vi.mock("@/lib/prisma", () => ({ prisma: clienteFake, prismaBase: clienteFake }))
vi.mock("@/lib/prisma-auth", () => ({ prismaAuth: clienteFake }))
vi.mock("@/lib/prisma-admin", () => ({ prismaAdmin: clienteFake }))
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u-1" } }) }))

const { PATCH } = await import("@/app/api/admin/organizacoes/[id]/route")

const chamar = (id: string, body: unknown) =>
  PATCH(
    { json: async () => body } as unknown as Parameters<typeof PATCH>[0],
    { params: Promise.resolve({ id }) }
  )

beforeEach(() => {
  findUniqueMembership.mockReset(); countMembership.mockReset()
  updateOrg.mockReset(); findUniqueUsuario.mockReset()
  findUniqueUsuario.mockResolvedValue({ superAdmin: true })  // requireSuperAdmin
})

describe("quem não é super-admin não passa", () => {
  it("é barrado no servidor, mesmo digitando a URL", async () => {
    findUniqueUsuario.mockResolvedValue({ superAdmin: false })
    const res = await chamar("org-A", { ativo: false })
    expect(res.status).toBe(403)
    expect(updateOrg).not.toHaveBeenCalled()
  })
})

describe("desligar empresa", () => {
  it("recusa desligar a própria última empresa ativa", async () => {
    findUniqueMembership.mockResolvedValue({ id: "m-1" })  // é minha
    countMembership.mockResolvedValue(1)                    // e é a única ativa
    const res = await chamar("org-A", { ativo: false })

    expect(res.status).toBe(409)
    expect(updateOrg).not.toHaveBeenCalled()
    expect((await res.json()).error).toContain("única empresa ativa")
  })

  it("permite quando sobra outra empresa ativa", async () => {
    findUniqueMembership.mockResolvedValue({ id: "m-1" })
    countMembership.mockResolvedValue(2)
    updateOrg.mockResolvedValue({ id: "org-A", nome: "X", slug: "x", ativo: false })

    expect((await chamar("org-A", { ativo: false })).status).toBe(200)
    expect(updateOrg).toHaveBeenCalled()
  })

  it("permite desligar empresa de que a pessoa não é membro", async () => {
    // Caso do super-admin gerindo cliente: não é membro, não há risco de se trancar.
    findUniqueMembership.mockResolvedValue(null)
    updateOrg.mockResolvedValue({ id: "org-B", nome: "Y", slug: "y", ativo: false })

    expect((await chamar("org-B", { ativo: false })).status).toBe(200)
    expect(countMembership).not.toHaveBeenCalled()
  })

  it("LIGAR nunca é barrado — a trava é só para desligar", async () => {
    updateOrg.mockResolvedValue({ id: "org-A", nome: "X", slug: "x", ativo: true })
    expect((await chamar("org-A", { ativo: true })).status).toBe(200)
    expect(findUniqueMembership).not.toHaveBeenCalled()
  })
})

describe("corpo inválido", () => {
  it("sem `ativo` nem `nome`, recusa em vez de fazer update vazio", async () => {
    const res = await chamar("org-A", { qualquerCoisa: 1 })
    expect(res.status).toBe(400)
    expect(updateOrg).not.toHaveBeenCalled()
  })

  it("ignora `ativo` que não é booleano — 'false' string não desliga empresa", async () => {
    const res = await chamar("org-A", { ativo: "false" })
    expect(res.status).toBe(400)
    expect(updateOrg).not.toHaveBeenCalled()
  })
})
