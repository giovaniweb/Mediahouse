import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/claude", () => ({ claude: {}, analisarComClaude: vi.fn(), extrairJSON: vi.fn(), executarAgenteComTools: vi.fn(), MODELO_POTENTE: "teste", MODELO_RAPIDO: "teste", SYSTEM_VIDEOOPS: "", TOOLS_VIDEOOPS: [] }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { identidadeWhatsApp } from "@/lib/whatsapp-identidade"
import { DELETE } from "@/app/api/usuarios/[id]/route"
import { POST as mesclarPOST } from "@/app/api/usuarios/[id]/mesclar/route"

// O caso real (30/10/2026): o cadastro inativo de uma pessoa, com o mesmo
// WhatsApp do cadastro ativo, deixava o número "ambíguo" e todo aviso para ele
// era descartado. Excluir e mesclar têm que tirar o cadastro velho da conta —
// sem apagar o vínculo, que segura o nome no histórico (ver tests/runtime).
const prefix = `integ-${randomUUID()}`
const org = `${prefix}-org`, orgSoAdmin = `${prefix}-org2`
const id = (s: string) => `${prefix}-${s}`
const base = String(Math.floor(Math.random() * 1e6)).padStart(6, "0")
const tel = (n: number) => `553198${base}${n}`
const usuarios = ["admin", "joao", "joaoVelho", "kev1", "kev2", "fab", "fab2", "chefe", "operador"].map(id)
const videomakers = [id("vk1"), id("vk2")]

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://localhost${url}`, init)
const excluir = (alvo: string) => DELETE(req(`/api/usuarios/${alvo}`, { method: "DELETE" }), { params: Promise.resolve({ id: alvo }) })
const quem = (telefone: string) => identidadeWhatsApp(org, telefone, db)
const membro = (usuarioId: string, organizacaoId = org) =>
  db.usuarioOrganizacao.findUnique({ where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } } })
const conta = (usuarioId: string) => db.usuario.findUnique({ where: { id: usuarioId }, select: { status: true, telefone: true } })

beforeAll(async () => {
  await db.organizacao.createMany({ data: [org, orgSoAdmin].map(o => ({ id: o, nome: o, slug: o })) })
  const pessoa = (s: string, telefone: string | null, status: "ativo" | "inativo" = "ativo") =>
    ({ id: id(s), nome: s, tipo: "solicitante" as const, senhaHash: "sem-login-real", telefone, status })
  await db.usuario.createMany({ data: [
    pessoa("admin", null),
    pessoa("joao", tel(1)), pessoa("joaoVelho", tel(1), "inativo"),
    pessoa("kev1", tel(2)), pessoa("kev2", tel(2)),
    pessoa("fab", tel(3)), pessoa("fab2", tel(3)),
    pessoa("chefe", null), pessoa("operador", null),
  ] })
  await db.usuarioOrganizacao.createMany({ data: [
    { usuarioId: id("admin"), organizacaoId: org, papel: "admin", areas: [] },
    { usuarioId: id("joao"), organizacaoId: org, papel: "editor", areas: [] },
    { usuarioId: id("joaoVelho"), organizacaoId: org, papel: "solicitante", areas: [] },
    { usuarioId: id("kev1"), organizacaoId: org, papel: "videomaker", areas: [] },
    { usuarioId: id("kev2"), organizacaoId: org, papel: "videomaker", areas: [] },
    { usuarioId: id("fab"), organizacaoId: org, papel: "solicitante", areas: [] },
    { usuarioId: id("fab2"), organizacaoId: org, papel: "solicitante", areas: [] },
    { usuarioId: id("chefe"), organizacaoId: orgSoAdmin, papel: "admin", areas: [] },
    { usuarioId: id("operador"), organizacaoId: orgSoAdmin, papel: "gestor", areas: [] },
  ] })
  await db.permissaoUsuario.create({ data: { usuarioId: id("operador"), organizacaoId: orgSoAdmin, gerenciarUsuarios: true } })
  // O espelho de videomaker de cada cadastro também conta na identificação.
  for (const [vk, dono] of [[id("vk1"), id("kev1")], [id("vk2"), id("kev2")]]) {
    await db.videomaker.create({ data: { id: vk, nome: dono, usuarioId: dono, telefone: tel(2), redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
    await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: vk, status: "ativo" } })
  }
})
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [org, orgSoAdmin] } } })
  await db.videomaker.deleteMany({ where: { id: { in: videomakers } } })
  await db.usuario.deleteMany({ where: { id: { in: usuarios } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
beforeEach(() => { estado.sessao = { user: { id: id("admin"), organizacaoId: org, tipo: "admin" } } })

describe("excluir e mesclar liberam o WhatsApp do cadastro que fica", () => {
  it("cadastro inativo com o mesmo número: excluir apaga o WhatsApp dele e o número volta a ser da pessoa ativa", async () => {
    expect((await quem(tel(1))).usuario).toBeNull()

    const res = await excluir(id("joaoVelho"))
    expect(res.status).toBe(200)
    expect((await res.json()).escopo).toBe("global")

    expect(await membro(id("joaoVelho"))).not.toBeNull()
    expect(await conta(id("joaoVelho"))).toEqual({ status: "inativo", telefone: null })
    expect((await quem(tel(1))).usuario?.id).toBe(id("joao"))
  })

  it("duplicado com perfil de videomaker: o perfil também fica inativo nesta empresa", async () => {
    expect((await quem(tel(2))).usuario).toBeNull()

    expect((await excluir(id("kev2"))).status).toBe(200)

    expect(await conta(id("kev2"))).toEqual({ status: "inativo", telefone: null })
    const vinculo = await db.videomakerOrganizacao.findUnique({ where: { organizacaoId_videomakerId: { organizacaoId: org, videomakerId: id("vk2") } } })
    expect(vinculo?.status).toBe("inativo")
    const identidade = await quem(tel(2))
    expect(identidade.usuario?.id).toBe(id("kev1"))
    expect(identidade.videomaker?.id).toBe(id("vk1"))
  })

  it("mesclar apaga o WhatsApp do secundário, em vez de só inativá-lo", async () => {
    expect((await quem(tel(3))).usuario).toBeNull()

    const res = await mesclarPOST(
      req(`/api/usuarios/${id("fab")}/mesclar`, { method: "POST", body: JSON.stringify({ secundarioId: id("fab2") }) }),
      { params: Promise.resolve({ id: id("fab") }) },
    )
    expect(res.status).toBe(200)

    expect(await conta(id("fab2"))).toEqual({ status: "inativo", telefone: null })
    expect((await quem(tel(3))).usuario?.id).toBe(id("fab"))
  })

  it("não deixa a empresa sem admin", async () => {
    estado.sessao = { user: { id: id("operador"), organizacaoId: orgSoAdmin, tipo: "gestor" } }
    const res = await excluir(id("chefe"))
    expect(res.status).toBe(409)
    expect(await membro(id("chefe"), orgSoAdmin)).not.toBeNull()
  })

  it("não exclui a si mesmo", async () => {
    expect((await excluir(id("admin"))).status).toBe(400)
  })
})
