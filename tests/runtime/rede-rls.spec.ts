// As rotas da rede (Onda 2B) com o RLS ligado, como a aplicação vai rodar:
// login próprio sem BYPASSRLS. A empresa B não lê comentário, nome nem contato
// da empresa A; o convite, o aceite e a contestação passam pelas funções do banco.
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
const { sessao } = vi.hoisted(() => ({ sessao: { user: null as null | { id: string; organizacaoId?: string; tipo: string; papel?: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.user ? { user: sessao.user } : null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
// O perfil importa o cliente administrativo só para o DELETE, que não entra aqui.
vi.mock("@/lib/prisma-admin", () => ({ prismaAdmin: {} }))
import { GET as avaliacoesDoPerfil } from "@/app/api/videomakers/[id]/avaliar/route"
import { GET as perfil } from "@/app/api/videomakers/[id]/route"
import { GET as buscaRede } from "@/app/api/rede/videomakers/route"
import { POST as convidar } from "@/app/api/rede/convites/route"
import { GET as minhaRede, POST as agirNaRede } from "@/app/api/me/rede/route"

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST }) })
const p = `rede-rls-${randomUUID().slice(0, 8)}`
const A = `${p}-a`, B = `${p}-b`, uA = `${p}-ua`, uB = `${p}-ub`, uVm = `${p}-uvm`, vm = `${p}-vm`
const NOME_A = `Empresa Alfa ${p}`
const como = (id: string, organizacaoId: string, tipo = "admin") => { sessao.user = { id, organizacaoId, tipo, papel: tipo } }
const get = (url: string) => new NextRequest(`http://localhost${url}`)
const post = (url: string, corpo: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } })
const params = { params: Promise.resolve({ id: vm }) }

beforeAll(async () => {
  await admin.organizacao.createMany({ data: [[A, NOME_A], [B, `Empresa Beta ${p}`]].map(([id, nome]) => ({ id, nome, slug: id })) })
  // As duas com o módulo "rede" (pago, por empresa); sem ele, B nem busca.
  await admin.moduloOrganizacao.createMany({ data: [A, B].map(organizacaoId => ({ organizacaoId, modulo: "rede", ativo: true })) })
  await admin.usuario.createMany({ data: [uA, uB, uVm].map(id => ({ id, nome: id, tipo: id === uVm ? "videomaker" : "admin", senhaHash: "sintetico" })) })
  await admin.usuarioOrganizacao.createMany({ data: [[uA, A], [uB, B], [uVm, A]].map(([usuarioId, organizacaoId]) => ({ usuarioId, organizacaoId, papel: usuarioId === uVm ? "videomaker" : "admin", areas: [] })) })
  await admin.videomaker.create({ data: { id: vm, nome: `Videomaker ${p}`, cidade: "Sete Lagoas", estado: "MG", telefone: "31988887777", redesSociais: [], areasAtuacao: [], habilidades: ["Drone"], equipamentos: [], usuarioId: uVm } })
  await admin.videomakerOrganizacao.create({ data: { organizacaoId: A, videomakerId: vm } })
  await admin.avaliacaoVideomaker.createMany({ data: [5, 4, 2].map((nota, i) => ({ id: `${p}-av${i}`, videomakerId: vm, nota, comentario: `PRIVADO-A-${i}`, organizacaoId: A })) })
})

afterAll(async () => {
  await admin.videomaker.deleteMany({ where: { id: vm } })
  await admin.organizacao.deleteMany({ where: { id: { in: [A, B] } } })
  await admin.usuario.deleteMany({ where: { id: { in: [uA, uB, uVm] } } })
  await admin.$disconnect()
})

describe("rede sob RLS", () => {
  it("B vê a média e nada de A; A vê os próprios comentários", async () => {
    como(uB, B)
    const r = await avaliacoesDoPerfil(get(`/api/videomakers/${vm}/avaliar`), params)
    const texto = await r.text()
    expect(JSON.parse(texto)).toMatchObject({ avaliacoes: [], score: { media: 3.7, avaliacoes: 3 } })
    for (const segredo of ["PRIVADO-A", NOME_A]) expect(texto).not.toContain(segredo)
    const perfilB = await (await perfil(get(`/api/videomakers/${vm}`), params)).json()
    expect(perfilB.videomaker).toMatchObject({ telefone: null, naLista: false })
    const busca = await (await buscaRede(get("/api/rede/videomakers?especialidade=Drone"))).json()
    expect(busca.videomakers.map((v: { id: string }) => v.id)).toContain(vm)

    como(uA, A)
    const deA = await (await avaliacoesDoPerfil(get(`/api/videomakers/${vm}/avaliar`), params)).json()
    expect(deA.avaliacoes).toHaveLength(3)
  })

  it("convite, aceite e contato; contestação tira a nota da média", async () => {
    como(uB, B)
    expect((await convidar(post("/api/rede/convites", { videomakerId: vm }))).status).toBe(201)
    como(uVm, A, "videomaker")
    const minha = await (await minhaRede()).json()
    const convite = minha.convites.find((c: { empresa: string }) => c.empresa === `Empresa Beta ${p}`)
    expect((await agirNaRede(post("/api/me/rede", { acao: "responder", conviteId: convite.id, aceitar: true }))).status).toBe(200)
    expect((await agirNaRede(post("/api/me/rede", { acao: "contestar", avaliacaoId: `${p}-av2`, motivo: "Retaliação por recusa de trabalho" }))).status).toBe(200)
    expect((await (await minhaRede()).json()).score).toEqual({ media: null, avaliacoes: 2 })

    como(uB, B)
    const perfilB = await (await perfil(get(`/api/videomakers/${vm}`), params)).json()
    expect(perfilB.videomaker).toMatchObject({ telefone: "31988887777", naLista: true })
    expect((await (await avaliacoesDoPerfil(get(`/api/videomakers/${vm}/avaliar`), params)).json()).avaliacoes).toEqual([])
  })
})
