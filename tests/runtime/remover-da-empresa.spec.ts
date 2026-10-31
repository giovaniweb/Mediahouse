import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { NextRequest } from "next/server"
const { estado } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaAuth } from "@/lib/prisma-auth"
import { prisma, prismaBase } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { DELETE } from "@/app/api/usuarios/[id]/route"
import { POST as mesclarPOST } from "@/app/api/usuarios/[id]/mesclar/route"

// Sob RLS, `usuarios` só aparece para quem tem vínculo com a empresa da sessão.
// Por isso quem está só nesta empresa mantém o vínculo ao ser desativado: sem
// ele, o nome sumia dos pedidos e comentários antigos. Nos testes de
// integração, que rodam como dono do banco, nada disso aparecia.
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST }) })
const p = `runtime-${randomUUID()}`, org = `${p}-org`, outra = `${p}-outra`
const id = (s: string) => `${p}-${s}`
const pessoas = ["gestora", "velho", "fica", "sai", "multi"].map(id)
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://localhost${url}`, init)
const excluir = (alvo: string) => DELETE(req(`/api/usuarios/${alvo}`, { method: "DELETE" }), { params: Promise.resolve({ id: alvo }) })
const membro = (usuarioId: string, organizacaoId = org) =>
  admin.usuarioOrganizacao.findUnique({ where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } } })
const status = async (usuarioId: string) => (await admin.usuario.findUnique({ where: { id: usuarioId } }))?.status

beforeAll(async () => {
  await admin.organizacao.createMany({ data: [org, outra].map(o => ({ id: o, nome: o, slug: o })) })
  await admin.usuario.createMany({ data: pessoas.map(u => ({ id: u, nome: u, tipo: "solicitante" as const, senhaHash: "sem-login-real" })) })
  await admin.usuarioOrganizacao.createMany({ data: [
    { usuarioId: id("gestora"), organizacaoId: org, papel: "admin", areas: [] },
    ...["velho", "fica", "sai", "multi"].map(s => ({ usuarioId: id(s), organizacaoId: org, papel: "solicitante" as const, areas: [] })),
    { usuarioId: id("multi"), organizacaoId: outra, papel: "solicitante", areas: [] },
  ] })
  // O histórico que tem de continuar com o nome de quem sai.
  await admin.demanda.create({ data: { id: id("pedido"), organizacaoId: org, codigo: id("pedido"), titulo: "Pedido antigo", descricao: "Teste", departamento: "growth", tipoVideo: "reels", cidade: "Teste", solicitanteId: id("velho") } })
  await admin.comentario.create({ data: { demandaId: id("pedido"), usuarioId: id("velho"), comentario: "Comentário antigo" } })
})
afterAll(async () => {
  await admin.organizacao.deleteMany({ where: { id: { in: [org, outra] } } })
  await admin.usuario.deleteMany({ where: { id: { in: pessoas } } })
  await Promise.all([admin.$disconnect(), prismaAuth.$disconnect(), prismaBase.$disconnect()])
})
beforeEach(() => { estado.sessao = { user: { id: id("gestora"), organizacaoId: org, tipo: "admin" } } })

describe("excluir e mesclar sob RLS", () => {
  it("excluir quem só está nesta empresa inativa a conta e mantém o vínculo", async () => {
    const res = await excluir(id("velho"))
    expect(res.status).toBe(200)
    expect(await membro(id("velho"))).not.toBeNull()
    expect(await status(id("velho"))).toBe("inativo")
  })

  it("o histórico de quem saiu continua com o nome dela", async () => {
    const pedido = await comOrg(org, () => prisma.demanda.findUnique({
      where: { id: id("pedido") },
      select: { solicitante: { select: { nome: true } }, comentarios: { select: { usuario: { select: { nome: true } } } } },
    }))
    expect(pedido?.solicitante?.nome).toBe(id("velho"))
    expect(pedido?.comentarios[0]?.usuario.nome).toBe(id("velho"))
  })

  it("mesclar desativa o secundário", async () => {
    const res = await mesclarPOST(
      req(`/api/usuarios/${id("fica")}/mesclar`, { method: "POST", body: JSON.stringify({ secundarioId: id("sai") }) }),
      { params: Promise.resolve({ id: id("fica") }) },
    )
    expect(res.status, await res.clone().text()).toBe(200)
    expect(await membro(id("sai"))).not.toBeNull()
    expect(await status(id("sai"))).toBe("inativo")
    expect(await status(id("fica"))).toBe("ativo")
  })

  it("quem está em outra empresa só perde o vínculo daqui", async () => {
    estado.sessao = { user: { id: id("gestora"), organizacaoId: org, tipo: "admin" } }
    const res = await excluir(id("multi"))
    expect(res.status).toBe(200)
    expect(await membro(id("multi"))).toBeNull()
    expect(await membro(id("multi"), outra)).not.toBeNull()
    expect(await status(id("multi"))).toBe("ativo")
  })
})
