import { randomUUID } from "node:crypto"
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
const { sessao } = vi.hoisted(() => ({ sessao: { user: null as null | { id: string; organizacaoId: string; tipo: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.user ? { user: sessao.user } : null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { PATCH } from "@/app/api/ia/politica/route"
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { criarOrcamentoIA } from "@/lib/ia-orcamento"
import * as auditoria from "@/lib/auditoria"
const p = `pol-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`
const padrao = { habilitada: true, tokensDia: 100000, simultaneas: 2 }
const patch = (nova: unknown, anterior: unknown = padrao) => PATCH(new NextRequest("http://localhost/api/ia/politica", { method: "PATCH", body: JSON.stringify({ anterior, nova }) }))
const politica = () => db.politicaIA.findUnique({ where: { organizacaoId: a } })
const eventos = () => db.eventoAuditoria.findMany({ where: { organizacaoId: a, recurso: "politica_ia" } })
const orcamento = criarOrcamentoIA(db)
const reservar = () => orcamento.reservar({ organizacaoId: a, usuarioId: u, finalidade: "teste.politica" }, "claude-haiku-4-5", 1000, 1000)
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a, b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "sintetico" } })
  await db.usuarioOrganizacao.create({ data: { organizacaoId: a, usuarioId: u, papel: "admin", areas: [] } })
})
beforeEach(async () => {
  vi.restoreAllMocks(); sessao.user = { id: u, organizacaoId: a, tipo: "admin" }
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: a } })
  await db.politicaIA.deleteMany({ where: { organizacaoId: { in: [a, b] } } })
  await db.consumoIA.deleteMany({ where: { organizacaoId: a } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: a } })
})
afterAll(async () => {
  vi.restoreAllMocks()
  await db.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await db.usuario.delete({ where: { id: u } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
describe("edição auditada dos limites de IA", () => {
  it("materializa política padrão e registra antes/depois com ator correto", async () => {
    const nova = { ...padrao, tokensDia: 50000, simultaneas: 1 }
    const r = await patch(nova)
    expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("private, no-store")
    expect(await politica()).toMatchObject({ ...nova, entradaBytes: 32768, saidaTokens: 4096 })
    expect(await eventos()).toMatchObject([{ atorId: u, acao: "configuracao.alterada", antes: padrao, depois: nova }])
    expect(await db.politicaIA.findUnique({ where: { organizacaoId: b } })).toBeNull()
  })
  it("repetição sem mudança não duplica auditoria", async () => {
    const nova = { ...padrao, habilitada: false }
    expect((await patch(nova)).status).toBe(200); expect((await patch(nova)).status).toBe(200)
    expect(await eventos()).toHaveLength(1)
  })
  it("preserva parâmetros técnicos fora do formulário", async () => {
    await db.politicaIA.create({ data: { organizacaoId: a, entradaBytes: 8000, saidaTokens: 2000 } })
    expect((await patch({ ...padrao, tokensDia: 50000 })).status).toBe(200)
    expect(await politica()).toMatchObject({ entradaBytes: 8000, saidaTokens: 2000 })
  })
  it("edições concorrentes divergentes resultam em um sucesso e um conflito", async () => {
    const r = await Promise.all([patch({ ...padrao, tokensDia: 60000 }), patch({ ...padrao, tokensDia: 70000 })])
    expect(r.map(v => v.status).sort()).toEqual([200, 409]); expect(await eventos()).toHaveLength(1)
  })
  it("falha de auditoria reverte a configuração", async () => {
    vi.spyOn(auditoria, "registrarAuditoria").mockRejectedValueOnce(new Error("segredo-interno"))
    const r = await patch({ ...padrao, habilitada: false })
    expect(r.status).toBe(503); expect(JSON.stringify(await r.json())).not.toContain("segredo")
    expect(await politica()).toBeNull(); expect(await eventos()).toHaveLength(0)
  })
  it("nega sessão, capacidade e vínculo de outra organização", async () => {
    sessao.user = null; expect((await patch(padrao)).status).toBe(401)
    sessao.user = { id: u, organizacaoId: b, tipo: "admin" }; expect((await patch(padrao)).status).toBe(403)
    sessao.user.organizacaoId = a
    await db.permissaoUsuario.create({ data: { organizacaoId: a, usuarioId: u, gerenciarConfig: false } })
    expect((await patch(padrao)).status).toBe(403); expect(await politica()).toBeNull()
  })
  it.each([{ ...padrao, tokensDia: -1 }, { ...padrao, tokensDia: 1000001 }, { ...padrao, tokensDia: 1.5 }, { ...padrao, simultaneas: 0 }, { ...padrao, simultaneas: 6 }, { ...padrao, habilitada: "false" }, { ...padrao, organizacaoId: b }, { ...padrao, entradaBytes: 999 }])("recusa valores fora do contrato %j", async nova => {
    expect((await patch(nova)).status).toBe(400); expect(await politica()).toBeNull(); expect(await eventos()).toHaveLength(0)
  })
  it("desativação impede checkpoint e nova reserva, sem apagar consumo", async () => {
    const r = await reservar()
    expect((await patch({ ...padrao, habilitada: false })).status).toBe(200)
    await expect(orcamento.iniciar(r)).rejects.toMatchObject({ codigo: "indisponivel" })
    await expect(reservar()).rejects.toMatchObject({ codigo: "indisponivel" })
    expect((await orcamento.resumo(a)).tokensComprometidos).toBe(3024)
  })
  it("redução abaixo do gasto bloqueia novas chamadas e preserva envio já iniciado", async () => {
    const r = await reservar(); await orcamento.iniciar(r)
    expect((await patch({ ...padrao, tokensDia: 0 })).status).toBe(200)
    await expect(reservar()).rejects.toMatchObject({ codigo: "orcamento" })
    await orcamento.reconciliar(r, { entrada: 100, saida: 50, cacheLeitura: null, cacheEscrita: null, provedorId: "msg-teste" })
    expect((await orcamento.resumo(a)).tokensMedidos).toBe(150)
  })
})
