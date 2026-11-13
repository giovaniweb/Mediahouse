import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId?: string; tipo: string } } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { semearPacoteInicial } from "@/lib/pacote-inicial"
import { POST as criarDemanda } from "@/app/api/demandas/route"

// O checklist automático da demanda nova vem dos modelos DA EMPRESA dela.
//
// Achado no ensaio do RLS de novembro/2026: a busca dos modelos não filtrava a
// empresa. Sem RLS (como a produção roda), um pedido "reels" da Contourline
// ganhava o checklist "Reels" da empresa criada depois, com o pacote inicial
// (GH Produção). Com RLS ligado o banco já escondia o modelo alheio; este teste
// roda como dono, sem RLS, que é onde o defeito aparece.

const p = `ckl-${randomUUID().slice(0, 8)}`
const comModelos = `${p}-com`, semModelos = `${p}-sem`, admin = `${p}-adm`
const json = (body: unknown) => new NextRequest("http://localhost/api/demandas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const pedido = { titulo: "Reels do teste", descricao: "Descrição longa o bastante", departamento: "audiovisual", tipoVideo: "reels", cidade: "Sete Lagoas", prioridade: "normal" }

beforeAll(async () => {
  await db.organizacao.createMany({ data: [
    { id: comModelos, nome: "Com modelos", slug: comModelos, prefixoCodigo: "CM" },
    { id: semModelos, nome: "Sem modelos", slug: semModelos, prefixoCodigo: "SM" },
  ] })
  await db.$transaction((tx) => semearPacoteInicial(tx, comModelos))
  await db.usuario.create({ data: { id: admin, nome: "Admin das duas", tipo: "admin", senhaHash: "sem-login" } })
  await db.usuarioOrganizacao.createMany({ data: [
    { usuarioId: admin, organizacaoId: comModelos, papel: "admin", areas: [] },
    { usuarioId: admin, organizacaoId: semModelos, papel: "admin", areas: [] },
  ] })
})
beforeEach(() => { estado.sessao = null })
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [comModelos, semModelos] } } })
  await db.usuario.deleteMany({ where: { id: admin } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("checklist automático da demanda nova", () => {
  it("não herda modelo de outra empresa", async () => {
    estado.sessao = { user: { id: admin, organizacaoId: semModelos, tipo: "admin" } }
    expect((await criarDemanda(json(pedido))).status).toBe(201)
    const salva = await db.demanda.findFirstOrThrow({ where: { organizacaoId: semModelos } })
    expect(await db.checklistItem.count({ where: { demandaId: salva.id } })).toBe(0)
  })

  it("usa o modelo da própria empresa", async () => {
    estado.sessao = { user: { id: admin, organizacaoId: comModelos, tipo: "admin" } }
    expect((await criarDemanda(json(pedido))).status).toBe(201)
    const salva = await db.demanda.findFirstOrThrow({ where: { organizacaoId: comModelos } })
    const modelo = await db.checklistTemplate.findFirstOrThrow({ where: { organizacaoId: comModelos, tipoVideo: "reels" }, include: { itens: true } })
    expect(await db.checklistItem.count({ where: { demandaId: salva.id } })).toBe(modelo.itens.length)
  })
})
