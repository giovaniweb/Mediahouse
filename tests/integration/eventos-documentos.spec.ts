import { randomUUID } from "node:crypto"
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
const { sessao } = vi.hoisted(() => ({ sessao: { user: null as null | { id: string; organizacaoId: string; tipo: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.user ? { user: sessao.user } : null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { POST as criarDoc, PATCH as editarDoc, DELETE as excluirDoc } from "@/app/api/eventos/[id]/documentos/route"
import { POST as criarAp, PATCH as decidir } from "@/app/api/eventos/[id]/aprovacoes/route"
import { GET as detalhe } from "@/app/api/eventos/[id]/route"
import { GET as lista } from "@/app/api/eventos/route"
import { GET as painel } from "@/app/api/eventos/dashboard/route"
import { POST as resumo } from "@/app/api/eventos/[id]/relatorio/route"
import * as auditoria from "@/lib/auditoria"
const p = `docs-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`, ea = `${p}-ea`, eb = `${p}-eb`, contrato = `${p}-contrato`, briefing = `${p}-briefing`, ap = `${p}-ap`, financeiro = `${p}-fin`
const req = (body?: unknown, query = "") => new NextRequest(`http://localhost/api/teste${query}`, { method: "POST", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
const params = (id = ea) => ({ params: Promise.resolve({ id }) })
const semFinanceiro = () => db.permissaoUsuario.create({ data: { organizacaoId: a, usuarioId: u, verEventos: true, verFinanceiroEvento: false } })
const auditorias = () => db.eventoAuditoria.findMany({ where: { organizacaoId: a, acao: { in: ["evento.documento", "evento.aprovacao"] } } })
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a, b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "teste" } })
  await db.usuarioOrganizacao.create({ data: { organizacaoId: a, usuarioId: u, papel: "admin", areas: [] } })
  await db.eventoGestao.createMany({ data: [[a, ea], [b, eb]].map(([organizacaoId, id]) => ({ id, organizacaoId, codigo: id, nome: id, createdById: u, dataInicio: new Date(), dataFim: new Date() })) })
})
beforeEach(async () => {
  vi.restoreAllMocks(); sessao.user = { id: u, organizacaoId: a, tipo: "admin" }
  await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: u, organizacaoId: a } }, data: { papel: "admin" } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: a } })
  await db.eventoGestaoDocumento.deleteMany({ where: { eventoId: ea } })
  await db.eventoGestaoAprovacao.deleteMany({ where: { eventoId: ea } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: a } })
  await db.eventoGestaoDocumento.createMany({ data: [{ id: contrato, eventoId: ea, nome: "SEGREDO-CONTRATO", categoria: "contratos", url: "https://example.invalid/segredo" }, { id: briefing, eventoId: ea, nome: "Briefing", categoria: "briefing", url: "javascript:alert(1)" }] })
  await db.eventoGestaoAprovacao.createMany({ data: [{ id: ap, eventoId: ea, tipo: "layout" }, { id: financeiro, eventoId: ea, tipo: "orcamento", observacao: "SEGREDO-APROVACAO" }] })
})
afterAll(async () => {
  vi.restoreAllMocks(); await db.organizacao.deleteMany({ where: { id: { in: [a, b] } } }); await db.usuario.delete({ where: { id: u } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
describe("documentos e aprovações de eventos", () => {
  it("não expõe contratos/aprovações financeiras ou sua contagem sem permissão", async () => {
    await semFinanceiro()
    const d = await (await detalhe(req(), params())).json()
    expect(d.evento.documentos).toHaveLength(1); expect(d.evento.aprovacoes).toHaveLength(1)
    expect(JSON.stringify(d)).not.toContain("SEGREDO")
    expect(d.evento.documentos[0].url).toBeNull()
    expect((await (await lista(req())).json()).eventos[0]._count.documentos).toBe(1)
    expect((await (await painel()).json()).docsPendentes).toBe(1)
    expect((await (await resumo(req(), params())).json()).relatorio).toContain("Documentos cadastrados: 1")
  })
  it("não permite criar, editar, excluir ou decidir conteúdo financeiro sem permissão", async () => {
    await semFinanceiro()
    expect((await criarDoc(req({ nome: "x", categoria: "contratos" }), params())).status).toBe(403)
    expect((await editarDoc(req({ id: contrato, url: null }), params())).status).toBe(404)
    expect((await excluirDoc(req(undefined, `?docId=${contrato}`), params())).status).toBe(404)
    expect((await criarAp(req({ tipo: "orcamento" }), params())).status).toBe(403)
    expect((await decidir(req({ id: financeiro, status: "aprovado" }), params())).status).toBe(404)
    expect(await auditorias()).toHaveLength(0)
  })
  it("papel global admin não permite decidir com vínculo solicitante", async () => {
    await semFinanceiro()
    await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: u, organizacaoId: a } }, data: { papel: "solicitante" } })
    expect((await criarAp(req({ tipo: "layout" }), params())).status).toBe(201)
    expect((await decidir(req({ id: ap, status: "aprovado" }), params())).status).toBe(403)
    expect((await editarDoc(req({ id: briefing, status: "aprovado" }), params())).status).toBe(403)
    await db.eventoGestaoDocumento.update({ where: { id: briefing }, data: { status: "aprovado" } })
    expect((await editarDoc(req({ id: briefing, status: "pendente" }), params())).status).toBe(403)
    expect((await excluirDoc(req(undefined, `?docId=${briefing}`), params())).status).toBe(403)
  })
  it("registra decisão com ator/antes/depois, sem observação, e não duplica retry", async () => {
    const body = { id: ap, status: "aprovado", observacao: "TEXTO-PRIVADO" }
    expect((await decidir(req(body), params())).status).toBe(200)
    expect((await decidir(req(body), params())).status).toBe(200)
    const e = await auditorias(); expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({ atorId: u, antes: { decisao: "pendente" }, depois: { decisao: "aprovado" } })
    expect(JSON.stringify(e)).not.toContain("TEXTO-PRIVADO")
  })
  it("decisões concorrentes divergentes preservam a primeira", async () => {
    const r = await Promise.all([decidir(req({ id: ap, status: "aprovado" }), params()), decidir(req({ id: ap, status: "reprovado" }), params())])
    expect(r.map(x => x.status).sort()).toEqual([200, 409]); expect(await auditorias()).toHaveLength(1)
  })
  it("falha na auditoria reverte criação e decisão", async () => {
    const spy = vi.spyOn(auditoria, "registrarAuditoria").mockRejectedValue(new Error("erro secreto"))
    expect((await criarDoc(req({ nome: "Não persistir" }), params())).status).toBe(503)
    const r = await decidir(req({ id: ap, status: "aprovado" }), params()); expect(r.status).toBe(503)
    expect(JSON.stringify(await r.json())).not.toContain("secreto")
    expect(await db.eventoGestaoDocumento.count({ where: { eventoId: ea } })).toBe(2)
    expect((await db.eventoGestaoAprovacao.findUniqueOrThrow({ where: { id: ap } })).status).toBe("pendente")
    spy.mockRestore()
  })
  it.each(["javascript:alert(1)", "data:text/html,test", "https://user:senha@example.invalid", "arquivo-local"])('recusa link inseguro %s', async url => {
    expect((await criarDoc(req({ nome: "x", url }), params())).status).toBe(400)
    expect((await editarDoc(req({ id: briefing, url }), params())).status).toBe(400)
  })
  it("valida status/ator e isola evento e empresa", async () => {
    expect((await decidir(req({ id: ap, status: "qualquer" }), params())).status).toBe(400)
    expect((await decidir(req({ id: ap, status: "aprovado", aprovadoPor: "outro" }), params())).status).toBe(400)
    expect((await criarDoc(req({ nome: "x", prazo: "2026-02-30" }), params())).status).toBe(400)
    expect((await criarDoc(req({ nome: "x" }), params(eb))).status).toBe(404)
    expect((await decidir(req({ id: ap, status: "aprovado" }), params(eb))).status).toBe(404)
    sessao.user = null; expect((await criarDoc(req({ nome: "x" }), params())).status).toBe(401)
  })
  it("criação, edição e exclusão válidas auditam sem copiar link", async () => {
    const r = await criarDoc(req({ nome: "Teste", linkExterno: "https://example.invalid/privado" }), params())
    expect(r.status).toBe(201); const { documento } = await r.json()
    expect((await editarDoc(req({ id: documento.id, status: "em_analise" }), params())).status).toBe(200)
    expect((await excluirDoc(req(undefined, `?docId=${documento.id}`), params())).status).toBe(200)
    const e = await auditorias(); expect(e).toHaveLength(3); expect(JSON.stringify(e)).not.toContain("https://")
  })
})
