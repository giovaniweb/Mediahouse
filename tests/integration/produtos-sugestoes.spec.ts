import { randomUUID } from "node:crypto"
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"

const { sessao, provedor } = vi.hoisted(() => ({
  sessao: { user: null as null | { id: string; organizacaoId: string; tipo: string } },
  provedor: vi.fn(() => { throw new Error("Sugestões não podem chamar IA") }),
}))
vi.mock("@anthropic-ai/sdk", () => ({ default: provedor }))
vi.mock("@/lib/claude", () => ({ analisarComClaude: provedor }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.user ? { user: sessao.user } : null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET } from "@/app/api/produtos/sugestoes/route"

const prefixo = `sug-${randomUUID()}`, a = `${prefixo}-a`, b = `${prefixo}-b`, u = `${prefixo}-u`
const requisicao = (id?: string) => GET(new NextRequest(`http://localhost/api/produtos/sugestoes${id === undefined ? "" : `?produtoId=${encodeURIComponent(id)}`}`))
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a, b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "sintetico" } })
  await db.usuarioOrganizacao.create({ data: { organizacaoId: a, usuarioId: u, papel: "admin", areas: [] } })
  await db.produto.createMany({ data: [
    ...Array.from({ length: 12 }, (_, i) => ({ id: `${prefixo}-${i}`, organizacaoId: a, nome: `Produto ${i}`, peso: 12 - i, createdAt: new Date("2026-01-01") })),
    { id: `${prefixo}-outro`, organizacaoId: b, nome: "Outra empresa" },
    { id: `${prefixo}-inativo`, organizacaoId: a, nome: "Inativo", ativo: false },
  ] })
})
beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv("ANTHROPIC_API_KEY", "sintetico-nao-usar")
  sessao.user = { id: u, organizacaoId: a, tipo: "admin" }
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: a } })
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await db.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await db.usuario.delete({ where: { id: u } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
describe("sugestões sem consumo de IA", () => {
  it("repete consulta sem provedor nem rede, conserva top 10 e informa origem", async () => {
    const primeira = await requisicao()
    const body = await primeira.json()
    expect(primeira.headers.get("cache-control")).toBe("private, no-store")
    expect(body.origem).toBe("regras-v1")
    expect(body.sugestoes).toHaveLength(10)
    expect(body.sugestoes[0].id).toBe(`${prefixo}-0`)
    expect(body.sugestoes.every((s: { sugestao: string }) => s.sugestao.length > 0)).toBe(true)
    expect(await (await requisicao()).json()).toEqual(body)
    expect(provedor).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it("consulta diretamente produto fora do top 10", async () => {
    const res = await requisicao(`${prefixo}-11`)
    expect(res.status).toBe(200)
    expect((await res.json()).sugestoes.map((s: { id: string }) => s.id)).toEqual([`${prefixo}-11`])
  })
  it("nega produto de outra empresa, inexistente e inativo sem distinguir existência", async () => {
    for (const id of [`${prefixo}-outro`, "inexistente", `${prefixo}-inativo`]) {
      expect((await requisicao(id)).status).toBe(404)
    }
  })
  it("nega acesso sem sessão, capacidade ou vínculo na empresa escolhida", async () => {
    sessao.user = null
    expect((await requisicao()).status).toBe(401)
    sessao.user = { id: u, organizacaoId: b, tipo: "admin" }
    expect((await requisicao()).status).toBe(403)
    sessao.user.organizacaoId = a
    await db.permissaoUsuario.create({ data: { organizacaoId: a, usuarioId: u, verProdutos: false } })
    expect((await requisicao()).status).toBe(403)
  })
  it("rejeita filtro vazio ou longo", async () => {
    expect((await requisicao("")).status).toBe(400)
    expect((await requisicao("x".repeat(201))).status).toBe(400)
  })
})
