import { randomUUID } from "node:crypto"
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
const { sessao } = vi.hoisted(() => ({ sessao: { user: null as null | { id: string; organizacaoId: string; tipo: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.user ? { user: sessao.user } : null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/google-drive", () => ({ criarPastaDrive: vi.fn(() => { throw new Error("Rede proibida") }) }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as detalhe, PUT as atualizar } from "@/app/api/eventos/[id]/route"
import { GET as lista, POST as criar } from "@/app/api/eventos/route"
import { GET as dashboard } from "@/app/api/eventos/dashboard/route"
import { POST as custo, PATCH as corrigirCusto, DELETE as excluirCusto } from "@/app/api/eventos/[id]/custos/route"
import { POST as relatorio } from "@/app/api/eventos/[id]/relatorio/route"
const p = `fin-evt-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`, ea = `${p}-ea`, eb = `${p}-eb`, vm = `${p}-vm`, da = `${p}-da`, dbb = `${p}-db`
const req = (method = "GET", body?: unknown) => new NextRequest("http://localhost/api/eventos", { method, ...(body ? { body: JSON.stringify(body) } : {}) })
const params = (id = ea) => ({ params: Promise.resolve({ id }) })
const permissao = (financeiro: boolean, av = false) => db.permissaoUsuario.create({ data: { usuarioId: u, organizacaoId: a, verEventos: true, verFinanceiroEvento: financeiro, verCustos: av } })
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a, b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "teste" } })
  await db.usuarioOrganizacao.create({ data: { organizacaoId: a, usuarioId: u, papel: "admin", areas: [] } })
  const datas = { dataInicio: new Date("2026-09-01"), dataFim: new Date("2026-09-02") }
  await db.eventoGestao.createMany({ data: [[a, ea], [b, eb]].map(([organizacaoId, id]) => ({ id, organizacaoId, codigo: id, nome: id, createdById: u, orcamentoPrevisto: 500, orcamentoAprovado: 400, ...datas })) })
  await db.custoEvento.createMany({ data: [
    { id: `${p}-estimado`, eventoId: ea, descricao: "Custo privado", valorPrevisto: 100 },
    { id: `${p}-zero`, eventoId: ea, descricao: "Zero", valorPrevisto: 50, valorReal: 0 },
    { id: `${p}-real`, eventoId: ea, descricao: "Real", valorPrevisto: 25, valorReal: 20 },
    { eventoId: eb, descricao: "OUTRA-EMPRESA", valorPrevisto: 99999, valorReal: 88888 },
  ] })
  await db.demanda.createMany({ data: [[a, da], [b, dbb]].map(([organizacaoId, id]) => ({ id, organizacaoId, codigo: id, titulo: id, descricao: "Teste", departamento: "growth", tipoVideo: "reels", cidade: "Teste", solicitanteId: u, eventoGestaoId: ea, statusVisivel: "finalizado" })) })
  await db.videomaker.create({ data: { id: vm, nome: vm, redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
  await db.custoVideomaker.createMany({ data: [
    { organizacaoId: a, demandaId: da, valor: 30 },
    { organizacaoId: b, demandaId: da, valor: 999 },
    { organizacaoId: a, demandaId: dbb, valor: 999 },
  ].map(c => ({ ...c, videomakerId: vm, dataReferencia: new Date() })) })
})
beforeEach(async () => {
  sessao.user = { id: u, organizacaoId: a, tipo: "admin" }
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: a } })
})
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await db.videomaker.delete({ where: { id: vm } }); await db.usuario.delete({ where: { id: u } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
describe("financeiro de eventos por permissão e empresa", () => {
  it("detalhe distingue previsão, zero e realizado, sem somar audiovisual", async () => {
    const antes = await db.eventoGestao.findUniqueOrThrow({ where: { id: ea } })
    const r = await detalhe(req(), params()), body = await r.json()
    expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toContain("no-store")
    expect(body.financeiro).toEqual({ custoEventoPrevisto: 175, custoEventoReal: 20, itensSemRealizado: 1, custoAudiovisual: 30 })
    expect(body.evento.demandas).toHaveLength(1)
    expect(body.evento.percentualConclusao).toBe(100)
    expect((await db.eventoGestao.findUniqueOrThrow({ where: { id: ea } })).updatedAt).toEqual(antes.updatedAt)
    expect(JSON.stringify(body)).not.toContain("OUTRA-EMPRESA")
  })
  it("sem financeiro não expõe orçamento ou custos no detalhe, lista, painel e resumo", async () => {
    await permissao(false, true)
    const detail = await (await detalhe(req(), params())).json()
    expect(detail.financeiro).toBeNull()
    for (const campo of ["orcamentoPrevisto", "orcamentoAprovado", "custos"]) expect(detail.evento).not.toHaveProperty(campo)
    const list = await (await lista(req())).json(); expect(list.eventos).toHaveLength(1)
    expect(list.eventos[0]).not.toHaveProperty("orcamentoPrevisto"); expect(list.eventos[0]._count).not.toHaveProperty("custos")
    expect((await (await dashboard()).json()).financeiro).toBeNull()
    expect((await (await relatorio(req("POST"), params())).json()).relatorio).not.toContain("Financeiro")
  })
  it("financeiro de evento não concede acesso ao custo audiovisual", async () => {
    await permissao(true, false)
    const body = await (await detalhe(req(), params())).json()
    expect(body.financeiro.custoEventoReal).toBe(20); expect(body.financeiro).not.toHaveProperty("custoAudiovisual")
    expect((await (await relatorio(req("POST"), params())).json()).relatorio).not.toContain("Custos audiovisuais vinculados:")
  })
  it("painel usa apenas empresa atual e realizado conhecido", async () => {
    const body = await (await dashboard()).json()
    expect(body.financeiro).toEqual({ totalPrevisto: 500, custosPrevistos: 175, realizadoInformado: 20, itensSemRealizado: 1, pagamentosPendentes: 3 })
    expect(body).not.toHaveProperty("totalGasto")
  })
  it("sem lançamentos permanece ausente, não zero", async () => {
    const vazio = await db.eventoGestao.create({ data: { organizacaoId: a, codigo: `${p}-vazio`, nome: "Vazio", createdById: u, dataInicio: new Date(), dataFim: new Date() } })
    const body = await (await detalhe(req(), params(vazio.id))).json()
    expect(body.financeiro).toMatchObject({ custoEventoPrevisto: null, custoEventoReal: null, custoAudiovisual: null })
    await db.eventoGestao.delete({ where: { id: vazio.id } })
  })
  it("não permite contornar financeiro por criação/edição/custos", async () => {
    await permissao(false)
    expect((await atualizar(req("PUT", { orcamentoPrevisto: 0 }), params())).status).toBe(403)
    expect((await criar(req("POST", { nome: "Não criar", dataInicio: "2026-09-01", orcamentoPrevisto: 0 }))).status).toBe(403)
    expect((await custo(req("POST", { descricao: "x", valorPrevisto: 1 }), params())).status).toBe(403)
    expect((await corrigirCusto(req("PATCH", { id: `${p}-real`, valorReal: 0 }), params())).status).toBe(403)
    expect((await excluirCusto(req("DELETE"), params())).status).toBe(403)
    const r = await atualizar(req("PUT", { nome: ea }), params())
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ evento: { id: ea } })
  })
  it("grava zero realizado e zero de orçamento sem converter em ausente", async () => {
    expect((await corrigirCusto(req("PATCH", { id: `${p}-zero`, valorReal: 0 }), params())).status).toBe(200)
    expect((await db.custoEvento.findUniqueOrThrow({ where: { id: `${p}-zero` } })).valorReal).toBe(0)
    expect((await atualizar(req("PUT", { orcamentoPrevisto: 0 }), params())).status).toBe(200)
    expect((await db.eventoGestao.findUniqueOrThrow({ where: { id: ea } })).orcamentoPrevisto).toBe(0)
    await db.eventoGestao.update({ where: { id: ea }, data: { orcamentoPrevisto: 500 } })
  })
  it("nega empresa alheia, capacidade revogada e ausência de sessão", async () => {
    expect((await detalhe(req(), params(eb))).status).toBe(404)
    expect((await corrigirCusto(req("PATCH", { id: `${p}-real`, valorReal: 1 }), params(eb))).status).toBe(404)
    await db.permissaoUsuario.create({ data: { organizacaoId: a, usuarioId: u, verEventos: false } })
    expect((await detalhe(req(), params())).status).toBe(403); expect((await lista(req())).status).toBe(403); expect((await dashboard()).status).toBe(403)
    sessao.user = null; expect((await detalhe(req(), params())).status).toBe(401)
  })
})
