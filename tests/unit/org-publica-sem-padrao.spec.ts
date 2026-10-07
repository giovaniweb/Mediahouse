import { describe, it, expect, vi, beforeEach } from "vitest"

// Até 07/10/2026, uma rota pública sem ?org= caía na empresa padrão: o pedido de
// um cliente de outra empresa, aberto num link sem a empresa no endereço, ia
// para o quadro da Contourline. Agora não há padrão: sem empresa, null, e a rota
// recusa. A galeria aberta do painel usa a empresa de quem está logado.

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), auth: vi.fn(), getOrgId: vi.fn() }))
vi.mock("@/lib/prisma-auth", () => ({ prismaAuth: { organizacao: { findUnique: mocks.findUnique } } }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }))

const { orgPublica } = await import("@/lib/org")

beforeEach(() => {
  mocks.findUnique.mockReset().mockImplementation(async ({ where }: { where: { slug: string } }) =>
    where.slug === "clinica-b" ? { id: "org-B", ativo: true } : where.slug === "contourline" ? { id: "org-C", ativo: true } : null)
  mocks.auth.mockReset()
})

describe("orgPublica — sem empresa padrão", () => {
  it("sem slug devolve null e nem consulta o banco", async () => {
    for (const s of [null, undefined, "", "   "]) expect(await orgPublica(s)).toBeNull()
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  it("com slug, a empresa dele", async () => {
    expect(await orgPublica("clinica-b")).toBe("org-B")
    expect(await orgPublica(" Clinica-B ")).toBe("org-B")
    expect(await orgPublica("nao-existe")).toBeNull()
  })
})

describe("orgPublicaOuDaSessao — vitrine aberta do painel", () => {
  it("o endereço manda, mesmo com alguém logado em outra empresa", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1", organizacaoId: "org-C" } })
    const { orgPublicaOuDaSessao } = await import("@/lib/org-da-requisicao")
    expect(await orgPublicaOuDaSessao("clinica-b")).toEqual({ organizacaoId: "org-B", daSessao: false })
  })

  it("sem endereço e sem login: nenhuma empresa", async () => {
    mocks.auth.mockResolvedValue(null)
    const { orgPublicaOuDaSessao } = await import("@/lib/org-da-requisicao")
    expect(await orgPublicaOuDaSessao(null)).toEqual({ organizacaoId: null, daSessao: false })
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })
})
