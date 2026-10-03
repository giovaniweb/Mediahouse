import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { POST as config } from "@/app/api/config/empresa/route"
import { PUT as permissoes } from "@/app/api/permissoes/route"
import { POST as publicar } from "@/app/api/biblioteca/[id]/publicacao/route"
import { GET as ler } from "@/app/api/auditoria/route"
import { backfillAuditado } from "@/lib/backfill-auditado"
const p = `audit-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`, alvo = `${p}-alvo`, d = `${p}-d`, arq = `${p}-arq`
const ator = { organizacaoId: a, usuarioId: u }
const req = (body: unknown) => new NextRequest("http://localhost/api/teste", { method: "POST", body: JSON.stringify(body) })
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.createMany({ data: [u,alvo].map(id => ({ id, nome: id, tipo: "admin", senhaHash: "sem-login" })) })
  await db.usuarioOrganizacao.createMany({ data: [{ organizacaoId: a, usuarioId: u, papel: "admin" as const }, { organizacaoId: b, usuarioId: u, papel: "solicitante" as const }, { organizacaoId: a, usuarioId: alvo, papel: "solicitante" as const }].map(m => ({ ...m, areas: [] })) })
  await db.demanda.create({ data: { id: d, organizacaoId: a, codigo: d, titulo: d, descricao: "Teste", departamento: "growth", tipoVideo: "reels", cidade: "Teste", solicitanteId: u, statusVisivel: "finalizado" } })
  await db.arquivo.create({ data: { id: arq, demandaId: d, tipoArquivo: "final", nomeArquivo: "Teste", url: "https://example.invalid/final.mp4" } })
})
beforeEach(async () => { estado.sessao = { user: { id: u, organizacaoId: a, tipo: "admin" } }; await db.eventoAuditoria.deleteMany({ where: { organizacaoId: { in: [a,b] } } }) })
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [a,b] } } })
  await db.usuario.deleteMany({ where: { id: { in: [u,alvo] } } })
  await Promise.all([db.$disconnect(),prismaAuth.$disconnect()])
})
describe("auditoria de operações reais", () => {
  it("configuração gera evento sem conteúdo fiscal e repetição não gera mudança", async () => {
    expect((await config(req({ cnpj: "cnpj-secreto", pixKey: "pix-secreto" }))).status).toBe(200)
    const eventos = await db.eventoAuditoria.findMany({ where: { organizacaoId: a } }); expect(eventos).toHaveLength(1)
    expect(eventos[0].atorId).toBe(u); expect(eventos[0].acao).toBe("configuracao.alterada")
    expect(JSON.stringify(eventos)).not.toContain("-secreto")
    expect((await config(req({ cnpj: "cnpj-secreto", pixKey: "pix-secreto" }))).status).toBe(200)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: a } })).toBe(1)
  })
  it("permissão registra antes/depois atômicos e ignora retry sem mudança", async () => {
    expect((await permissoes(req({ usuarioId: alvo, verCustos: true }))).status).toBe(200)
    expect((await permissoes(req({ usuarioId: alvo, verCustos: true }))).status).toBe(200)
    const eventos = await db.eventoAuditoria.findMany({ where: { organizacaoId: a } }); expect(eventos).toHaveLength(1)
    expect(eventos[0].depois).toMatchObject({ verCustos: true })
  })
  it("publicação usa evento próprio e não cria status falso na demanda", async () => {
    const params = { params: Promise.resolve({ id: arq }) }
    expect((await publicar(req({ publicar: true }),params)).status).toBe(200)
    expect((await publicar(req({ publicar: true }),params)).status).toBe(200)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: a, acao: "arquivo.publicacao" } })).toBe(1)
    expect(await db.historicoStatus.count({ where: { demandaId: d, statusNovo: "publicacao" } })).toBe(0)
  })
  it("rollback não deixa alteração nem evento de sucesso", async () => {
    await expect(db.$transaction(async tx => {
      await tx.demanda.update({ where: { id: d }, data: { titulo: "rollback" } })
      await registrarAuditoria(tx, ator, { acao: "usuario.alterado", recurso: "demanda", recursoId: d, correlationId: correlacaoAuditoria() })
      throw new Error("rollback")
    })).rejects.toThrow("rollback")
    expect((await db.demanda.findUniqueOrThrow({ where: { id: d } })).titulo).toBe(d)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: a } })).toBe(0)
  })
  it("chave do mesmo evento evita duplicação em retry", async () => {
    const evento = { acao: "configuracao.alterada" as const, recurso: "config_empresa", recursoId: a, correlationId: correlacaoAuditoria() }
    await db.$transaction(async tx => { await registrarAuditoria(tx,ator,evento); await registrarAuditoria(tx,ator,evento) })
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: a } })).toBe(1)
  })
  it("acesso negado identificável registra somente ação/capacidade", async () => {
    estado.sessao = { user: { id: u, organizacaoId: b, tipo: "admin" } }
    expect((await config(req({ cnpj: "nao-gravar-segredo" }))).status).toBe(403)
    const e = await db.eventoAuditoria.findFirstOrThrow({ where: { organizacaoId: b } })
    expect(e.resultado).toBe("negado"); expect(e.recursoId).toBe("gerenciarConfig"); expect(JSON.stringify(e)).not.toContain("segredo")
    expect((await ler(new NextRequest("http://localhost/api/auditoria?fonte=seguranca"))).status).toBe(403)
  })
  it("leitura não cruza empresa nem exibe payload expirado", async () => {
    const evento = { acao: "configuracao.alterada" as const, recurso: "config_empresa", recursoId: a, correlationId: correlacaoAuditoria(), depois: { conectado: true } }
    await registrarAuditoria(db,ator,evento)
    await registrarAuditoria(db,{ organizacaoId: b, tecnico: "rotina" },{ ...evento, correlationId: correlacaoAuditoria() })
    await db.eventoAuditoria.updateMany({ where: { organizacaoId: a }, data: { payloadExpiraEm: new Date(0) } })
    const r = await ler(new NextRequest("http://localhost/api/auditoria?fonte=seguranca")); expect(r.headers.get("cache-control")).toContain("no-store")
    const body = await r.json(); expect(body.eventos).toHaveLength(1); expect(body.eventos[0].organizacaoId).toBe(a); expect(body.eventos[0].depois).toBeNull()
  })
  it("backfill legado não cria arquivos sem lote revisado", async () => {
    await expect(backfillAuditado("arquivos",ator)).rejects.toThrow("lote simulado")
  })
  it("retenção técnica remove só payload vencido e preserva envelope", async () => {
    await registrarAuditoria(db,ator,{ acao: "configuracao.alterada", recurso: "config_empresa", recursoId: a, correlationId: correlacaoAuditoria(), depois: { ativo: true } })
    const evento = await db.eventoAuditoria.findFirstOrThrow({ where: { organizacaoId: a } })
    await db.eventoAuditoria.update({ where: { id: evento.id }, data: { payloadExpiraEm: new Date(0) } })
    const executar = (args: string[] = []) => JSON.parse(execFileSync(process.execPath,["scripts/retencao-auditoria.mjs",...args], {
      env: { NODE_ENV: "test", PATH: process.env.PATH, ADMIN_DATABASE_URL: process.env.DATABASE_URL_TEST, ORGANIZACAO_AUDITORIA: a, CONFIRMAR_RETENCAO_AUDITORIA: "sim" }, encoding: "utf8",
    }))
    expect(executar().payloadsRemovidos).toBe(0)
    expect((await db.eventoAuditoria.findUniqueOrThrow({ where: { id: evento.id } })).depois).not.toBeNull()
    expect(executar(["--aplicar"]).payloadsRemovidos).toBe(1)
    const depois = await db.eventoAuditoria.findUniqueOrThrow({ where: { id: evento.id } })
    expect(depois.antes).toBeNull(); expect(depois.depois).toBeNull()
    expect(depois.atorId).toBe(u); expect(depois.acao).toBe(evento.acao); expect(depois.createdAt).toEqual(evento.createdAt)
  })

})
