import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"

// Cadastro de designer pela área pública: o que vai para onde, e a decisão da
// equipe (aprovar/recusar) só vale para candidatura pendente DESTA empresa.

const mocks = vi.hoisted(() => ({
  acesso: vi.fn(),
  create: vi.fn(),
  findFirstVinculo: vi.fn(),
  findFirstFiscal: vi.fn(),
  alerta: vi.fn(),
  updateManyVinculo: vi.fn(),
  updateManyDesigner: vi.fn(),
  findManyVinculo: vi.fn(),
}))

vi.mock("@/lib/acesso", () => ({ requireAcesso: (...a: unknown[]) => mocks.acesso(...a) }))
vi.mock("@/lib/org", () => ({ orgPublica: async () => "org-B" }))
vi.mock("@/lib/org-contexto", () => ({ declararOrg: () => {} }))
vi.mock("@/lib/limite-formulario", () => ({ barrarExcesso: async () => null }))
vi.mock("@/lib/videomaker-dados", () => ({ cifrarOuNulo: (v: unknown) => (typeof v === "string" && v ? `cifrado(${v})` : null) }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    designer: { create: mocks.create, updateMany: mocks.updateManyDesigner },
    designerOrganizacao: { findFirst: mocks.findFirstVinculo, updateMany: mocks.updateManyVinculo, findMany: mocks.findManyVinculo },
    designerDadosFiscais: { findFirst: mocks.findFirstFiscal },
    alertaIA: { create: mocks.alerta },
  },
}))

const { POST } = await import("@/app/api/publico/designer/route")
const { PATCH } = await import("@/app/api/growth/designers/[id]/route")
const { GET } = await import("@/app/api/growth/designers/route")

const corpo = {
  nome: "Ana Designer", cpfCnpj: "12345678901", email: "ana@estudio.test", telefone: "(31) 97777-6666",
  cidade: "Belo Horizonte", estado: "mg", chavePix: "ana@pix", dadosBancarios: "Banco 1, ag 2, cc 3",
  portfolio: "behance.net/ana", areasAtuacao: ["Motion"], redesSociais: ["@ana", ""], valorDiaria: 400,
}
const post = (c: unknown) => POST(new NextRequest("http://localhost/api/publico/designer?org=clinica-b", {
  method: "POST", body: JSON.stringify(c), headers: { "content-type": "application/json" },
}))
const patch = (acao: string) => PATCH(new NextRequest("http://localhost/api/growth/designers/d1", {
  method: "PATCH", body: JSON.stringify({ acao }), headers: { "content-type": "application/json" },
}), { params: Promise.resolve({ id: "d1" }) })

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.acesso.mockResolvedValue({ organizacaoId: "org-B", usuarioId: "u1", papel: "gestor", permissoes: {} })
  mocks.create.mockResolvedValue({ id: "d1" })
  mocks.findFirstVinculo.mockResolvedValue(null)
  mocks.findFirstFiscal.mockResolvedValue(null)
})

describe("POST /api/publico/designer", () => {
  it("perfil só com o público; candidatura pendente e fiscais (PIX e banco cifrados) na empresa", async () => {
    const r = await post(corpo)
    expect(r.status).toBe(201)
    const { data } = mocks.create.mock.calls[0][0]
    expect(data).toMatchObject({ nome: "Ana Designer", estado: "MG", status: "pendente", portfolio: "https://behance.net/ana", especialidade: ["Motion"], redesSociais: ["@ana"] })
    expect(data).not.toHaveProperty("cpfCnpj")
    expect(data).not.toHaveProperty("chavePix")
    expect(data.vinculos.create).toEqual({ organizacaoId: "org-B", status: "pendente", valorDiaria: 400, observacoes: null })
    expect(data.fiscais.create).toMatchObject({ organizacaoId: "org-B", cpfCnpj: "12345678901", chavePix: "cifrado(ana@pix)", dadosBancarios: "cifrado(Banco 1, ag 2, cc 3)" })
    expect(mocks.alerta).toHaveBeenCalledWith({ data: expect.objectContaining({ organizacaoId: "org-B", tipoAlerta: "novo_designer_pendente" }) })
  })

  it("duplicidade é conferida só nesta empresa e devolve 409 sem criar nada", async () => {
    mocks.findFirstFiscal.mockResolvedValue({ id: "x" })
    const r = await post(corpo)
    expect(r.status).toBe(409)
    expect(mocks.findFirstVinculo.mock.calls[0][0].where.organizacaoId).toBe("org-B")
    expect(mocks.findFirstFiscal.mock.calls[0][0].where.organizacaoId).toBe("org-B")
    expect(mocks.create).not.toHaveBeenCalled()
  })
})

describe("aprovar ou recusar designer", () => {
  it("exige a permissão de gerenciar a equipe criativa", async () => {
    mocks.acesso.mockResolvedValue(NextResponse.json({ error: "Sem permissão" }, { status: 403 }))
    expect((await patch("aprovar")).status).toBe(403)
    expect((await GET()).status).toBe(403)
    expect(mocks.acesso).toHaveBeenCalledWith("gerenciarDesigners")
    expect(mocks.updateManyVinculo).not.toHaveBeenCalled()
  })

  it("aprovar: só a candidatura pendente desta empresa vira ativa, e o perfil sai de pendente", async () => {
    mocks.updateManyVinculo.mockResolvedValue({ count: 1 })
    const r = await patch("aprovar")
    expect(r.status).toBe(200)
    expect(mocks.updateManyVinculo).toHaveBeenCalledWith({ where: { organizacaoId: "org-B", designerId: "d1", status: "pendente" }, data: { status: "ativo" } })
    expect(mocks.updateManyDesigner).toHaveBeenCalledWith({ where: { id: "d1", status: "pendente" }, data: { status: "ativo" } })
  })

  it("recusar: vira inativo e não mexe no perfil da rede", async () => {
    mocks.updateManyVinculo.mockResolvedValue({ count: 1 })
    await patch("recusar")
    expect(mocks.updateManyVinculo.mock.calls[0][0].data).toEqual({ status: "inativo" })
    expect(mocks.updateManyDesigner).not.toHaveBeenCalled()
  })

  it("já decidida ou de outra empresa: 404", async () => {
    mocks.updateManyVinculo.mockResolvedValue({ count: 0 })
    expect((await patch("aprovar")).status).toBe(404)
    expect(mocks.updateManyDesigner).not.toHaveBeenCalled()
  })

  it("ação desconhecida: 400", async () => {
    expect((await patch("apagar")).status).toBe(400)
  })

  it("a lista lê só pendentes e ativos desta empresa, fora da lista negra", async () => {
    mocks.findManyVinculo.mockResolvedValue([])
    await GET()
    expect(mocks.findManyVinculo.mock.calls[0][0].where).toEqual({ organizacaoId: "org-B", status: { in: ["pendente", "ativo"] }, emListaNegra: false })
  })
})
