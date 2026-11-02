import { describe, it, expect, vi, beforeEach } from "vitest"

// Painel da plataforma, criação de empresa e vínculo de pessoa (30/10/2026).
// O Giovani criou a GH Produção e precisava saber de cor o e-mail do Gabriel;
// e uma empresa anterior ganhou slug com espaço e acento.

const m = vi.hoisted(() => ({
  superAdmin: vi.fn(),
  emailExato: vi.fn(),
  orgPorSlug: vi.fn(),
  orgPorId: vi.fn(),
  criarOrg: vi.fn(),
  usuarioPorId: vi.fn(),
  buscarUsuarios: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "plataforma" } }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/prisma-auth", () => ({
  prismaAuth: { usuario: { findUnique: m.superAdmin, findMany: m.emailExato } },
}))
vi.mock("@/lib/prisma-admin", () => ({
  prismaAdmin: {
    organizacao: {
      findUnique: (a: { where: { slug?: string; id?: string } }) => (a.where.slug !== undefined ? m.orgPorSlug(a) : m.orgPorId(a)),
      create: m.criarOrg,
    },
    usuario: { findUnique: m.usuarioPorId, findMany: m.buscarUsuarios },
    usuarioOrganizacao: { upsert: m.upsert },
  },
}))

const { POST: criarEmpresa } = await import("@/app/api/admin/organizacoes/route")
const { POST: vincular } = await import("@/app/api/admin/organizacoes/[id]/usuarios/route")
const { GET: buscar } = await import("@/app/api/admin/usuarios/route")

const corpo = (body: unknown) => ({ json: async () => body }) as never
const comBusca = (busca: string) => ({ nextUrl: new URL(`http://x/api/admin/usuarios?busca=${encodeURIComponent(busca)}`) }) as never

beforeEach(() => {
  vi.clearAllMocks()
  m.superAdmin.mockResolvedValue({ superAdmin: true, status: "ativo" })
  m.orgPorSlug.mockResolvedValue(null)
  m.orgPorId.mockResolvedValue({ id: "org-nova" })
  m.criarOrg.mockImplementation(async ({ data }: { data: { nome: string; slug: string } }) => ({ id: "org-nova", ...data, ativo: true }))
  m.upsert.mockImplementation(async ({ create }: { create: object }) => create)
})

describe("slug da empresa nova", () => {
  it("limpa o slug digitado: sem acento, sem espaço", async () => {
    await criarEmpresa(corpo({ nome: "São João Filmes", slug: "São João Filmes" }))
    expect(m.criarOrg.mock.calls[0][0].data.slug).toBe("sao-joao-filmes")
  })
  it("endereço reservado do NuFlow conta como ocupado", async () => {
    await criarEmpresa(corpo({ nome: "Teste" }))
    expect(m.criarOrg.mock.calls[0][0].data.slug).toBe("teste-2")
  })
  it("recusa slug que não sobra nada depois de limpo", async () => {
    const res = await criarEmpresa(corpo({ nome: "X", slug: "!!!" }))
    expect(res.status).toBe(400)
    expect(m.criarOrg).not.toHaveBeenCalled()
  })
})

describe("admin da empresa nova", () => {
  it("escolhido na busca vai pelo id", async () => {
    m.usuarioPorId.mockResolvedValue({ id: "gabriel" })
    const res = await criarEmpresa(corpo({ nome: "GH Produção", adminUsuarioId: "gabriel" }))
    expect((await res.json()).membership).toEqual({ usuarioId: "gabriel", papel: "admin" })
    expect(m.upsert.mock.calls[0][0].create).toEqual({ usuarioId: "gabriel", organizacaoId: "org-nova", papel: "admin" })
  })
  it("e-mail digitado não depende de maiúscula", async () => {
    m.emailExato.mockResolvedValue([{ id: "gabriel" }])
    const res = await criarEmpresa(corpo({ nome: "GH Produção", adminEmail: " Contato@Produtora.test " }))
    expect(m.emailExato.mock.calls[0][0].where.email).toEqual({ equals: "Contato@Produtora.test", mode: "insensitive" })
    expect((await res.json()).membership?.usuarioId).toBe("gabriel")
  })
  it("duas grafias do mesmo e-mail: não adivinha", async () => {
    m.emailExato.mockResolvedValue([{ id: "a" }, { id: "b" }])
    const res = await criarEmpresa(corpo({ nome: "GH Produção", adminEmail: "x@y.com" }))
    expect((await res.json()).membership).toBeNull()
    expect(m.upsert).not.toHaveBeenCalled()
  })
})

describe("vincular pessoa", () => {
  const params = { params: Promise.resolve({ id: "org-nova" }) }
  it("pelo id escolhido na busca", async () => {
    m.usuarioPorId.mockResolvedValue({ id: "gabriel" })
    expect((await vincular(corpo({ usuarioId: "gabriel", papel: "admin" }), params)).status).toBe(201)
    expect(m.upsert.mock.calls[0][0].create).toEqual({ usuarioId: "gabriel", organizacaoId: "org-nova", papel: "admin" })
  })
  it("pelo e-mail, sem diferença de maiúscula", async () => {
    m.emailExato.mockResolvedValue([{ id: "gabriel" }])
    expect((await vincular(corpo({ email: "CONTATO@produtora.test", papel: "videomaker" }), params)).status).toBe(201)
  })
})

describe("busca de pessoa da plataforma", () => {
  it("só super-admin", async () => {
    m.superAdmin.mockResolvedValue({ superAdmin: false, status: "ativo" })
    expect((await buscar(comBusca("gab"))).status).toBe(403)
    expect(m.buscarUsuarios).not.toHaveBeenCalled()
  })
  it("menos de 2 letras não consulta", async () => {
    expect(await (await buscar(comBusca("g"))).json()).toEqual({ usuarios: [] })
    expect(m.buscarUsuarios).not.toHaveBeenCalled()
  })
  it("acha por nome ou e-mail, só ativos, com as empresas de cada um", async () => {
    m.buscarUsuarios.mockResolvedValue([{
      id: "gabriel", nome: "Gabriel Teste", email: "contato@produtora.test",
      organizacoes: [{ papel: "videomaker", organizacao: { nome: "Contourline" } }],
    }])
    const { usuarios } = await (await buscar(comBusca("gabriel"))).json()
    const where = m.buscarUsuarios.mock.calls[0][0].where
    expect(where.status).toBe("ativo")
    expect(where.OR).toEqual([
      { nome: { contains: "gabriel", mode: "insensitive" } },
      { email: { contains: "gabriel", mode: "insensitive" } },
    ])
    expect(usuarios).toEqual([{
      id: "gabriel", nome: "Gabriel Teste", email: "contato@produtora.test",
      empresas: [{ nome: "Contourline", papel: "videomaker" }],
    }])
  })
})
