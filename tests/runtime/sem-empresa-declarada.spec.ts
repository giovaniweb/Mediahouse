// Caminhos que o ensaio de 04/10/2026 (dump de 07/09, app_user/app_auth reais)
// achou quebrados sob RLS. Todos têm a mesma raiz: acontecem ANTES de haver
// empresa declarada — cadastro de pessoa, seletor de empresa, cron, link por
// token — ou escrevem no que é global, como a média do profissional. Com a
// conexão de dono tudo isso funcionava; com o login restrito, ou dava 500, ou
// devolvia vazio sem erro nenhum.
//
// Roda pelo login real da aplicação (membro de app_user, sem bypass), via
// scripts/teste-runtime-rls.mjs.
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { NextRequest } from "next/server"

const sessao = vi.hoisted(() => ({ atual: null as null | { user: { id: string; organizacaoId: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.atual }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))

import { prisma, prismaBase } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { comOrg } from "@/lib/org-contexto"
import { criarUsuarioComVinculo, usuarioIdPorEmail } from "@/lib/criar-usuario"
import { orgPorRelatorioToken } from "@/lib/relatorio-executivo"
import { GET as abrirAprovacao, POST as responderAprovacao } from "@/app/api/aprovacao-video/[token]/route"
import { GET as minhasEmpresas, POST as trocarEmpresa } from "@/app/api/me/organizacoes/route"
import { POST as esqueciSenha } from "@/app/api/auth/esqueci-senha/route"
import { POST as avaliarPorQr } from "@/app/api/publico/avaliar/route"
import { GET as cronAgentes } from "@/app/api/cron/agentes/route"

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST }) })
const p = `semctx-${randomUUID()}`
const a = `${p}-a`, b = `${p}-b`, u = `${p}-u`, v = `${p}-v`, da = `${p}-da`, vm = `${p}-vm`
const emailV = `${v}@example.invalid`, tokenAprovacao = `${p}-aprov`, tokenRelatorio = `${p}-relatorio-token`
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://ensaio.invalid${url}`, init)
const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })

beforeAll(async () => {
  await admin.organizacao.createMany({ data: [
    { id: a, nome: a, slug: a, relatorioToken: tokenRelatorio },
    { id: b, nome: b, slug: b },
  ] })
  await admin.usuario.createMany({ data: [
    { id: u, nome: "Duas empresas", email: `${u}@example.invalid`, tipo: "admin", senhaHash: "sem-login-real" },
    { id: v, nome: "Só a B", email: emailV, tipo: "solicitante", senhaHash: "sem-login-real" },
  ] })
  await admin.usuarioOrganizacao.createMany({ data: [
    { usuarioId: u, organizacaoId: a, papel: "admin", areas: [] },
    { usuarioId: u, organizacaoId: b, papel: "admin", areas: [] },
    { usuarioId: v, organizacaoId: b, papel: "solicitante", areas: [] },
  ] })
  await admin.demanda.create({ data: { id: da, organizacaoId: a, codigo: da, titulo: da, descricao: "Teste", departamento: "growth",
    tipoVideo: "reels", cidade: "Teste", solicitanteId: u, statusInterno: "revisao_pendente", statusVisivel: "aprovacao" } })
  await admin.aprovacaoVideo.create({ data: { demandaId: da, token: tokenAprovacao, urlVideo: "/api/midia/x.mp4", status: "pendente",
    expiresAt: new Date(Date.now() + 86_400_000) } })
  await admin.videomaker.create({ data: { id: vm, nome: "Profissional da rede" } })
  // Avaliação PRIVADA da empresa B: a média global tem que contá-la mesmo
  // quando a nova avaliação chega por QR, sem empresa nenhuma.
  await admin.avaliacaoVideomaker.create({ data: { videomakerId: vm, nota: 1, organizacaoId: b, origem: "interna" } })
})

afterAll(async () => {
  await admin.avaliacaoVideomaker.deleteMany({ where: { videomakerId: vm } })
  await admin.videomaker.deleteMany({ where: { id: vm } })
  await admin.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await admin.passwordResetToken.deleteMany({ where: { email: emailV } })
  await admin.usuario.deleteMany({ where: { id: { startsWith: p } } })
  await admin.usuario.deleteMany({ where: { email: { startsWith: p } } })
  await Promise.all([admin.$disconnect(), prismaAuth.$disconnect(), prismaBase.$disconnect()])
})

describe("cadastro de pessoa sob RLS", () => {
  it("prisma.usuario.create é recusado: a pessoa nova ainda não tem vínculo para ser lida de volta", async () => {
    await expect(comOrg(a, () => prisma.usuario.create({
      data: { nome: "Recusada", email: `${p}-recusada@example.invalid`, tipo: "solicitante", senhaHash: "x" },
    }))).rejects.toThrow(/row-level security/i)
  })

  it("a pessoa nasce com vínculo e volta legível para a empresa", async () => {
    const email = `${p}-nova@example.invalid`
    const pessoa = await criarUsuarioComVinculo(a, { nome: "Nova", email, telefone: null, tipo: "solicitante", senhaHash: "x" },
      { papel: "solicitante", categoria: "solicitante", areas: [] }, { id: true, email: true })
    expect(pessoa.email).toBe(email)
    expect(await admin.usuarioOrganizacao.count({ where: { usuarioId: pessoa.id, organizacaoId: a } })).toBe(1)
    // E só para ela: a outra empresa continua sem enxergar.
    expect(await comOrg(b, () => prisma.usuario.findUnique({ where: { id: pessoa.id } }))).toBeNull()
  })

  it("quem já existe em outra empresa é achado pelo e-mail, sem expor a pessoa", async () => {
    expect(await comOrg(a, () => prisma.usuario.findUnique({ where: { email: emailV } }))).toBeNull()
    expect(await usuarioIdPorEmail(emailV)).toBe(v)
  })
})

describe("seletor de empresa", () => {
  it("lista as duas empresas e troca para a outra", async () => {
    sessao.atual = { user: { id: u, organizacaoId: a } }
    try {
      const lista = await (await minhasEmpresas()).json() as { organizacoes: { id: string }[] }
      expect(lista.organizacoes.map(o => o.id).sort()).toEqual([a, b])
      const troca = await trocarEmpresa(req("/api/me/organizacoes", json({ organizacaoId: b })))
      expect(troca.status).toBe(200)
      expect(troca.headers.get("set-cookie")).toContain(`org_ativa=${b}`)
    } finally { sessao.atual = null }
  })
})

describe("cron sem empresa declarada", () => {
  it("enxerga as empresas e processa cada uma", async () => {
    process.env.CRON_SECRET = "cron-do-teste-runtime"
    // O cursor restringe a rodada às duas empresas deste teste (ids > prefixo).
    const r = await cronAgentes(req(`/api/cron/agentes?agente=limpeza&cursor=${p}`, { headers: { authorization: "Bearer cron-do-teste-runtime" } }))
    const corpo = await r.json() as { organizacoes: number }
    expect(r.status).toBe(200)
    expect(corpo.organizacoes).toBe(2)
  })
})

describe("links públicos por token", () => {
  it("aprovação de vídeo abre e é respondida pelo cliente", async () => {
    const params = Promise.resolve({ token: tokenAprovacao })
    expect((await abrirAprovacao(req(`/api/aprovacao-video/${tokenAprovacao}`), { params })).status).toBe(200)
    const r = await responderAprovacao(req(`/api/aprovacao-video/${tokenAprovacao}`, json({ acao: "aprovar", aprovadoPor: "Cliente" })), { params })
    expect(r.status).toBe(200)
    expect((await admin.demanda.findUniqueOrThrow({ where: { id: da } })).statusInterno).toBe("aprovado")
    // Token desconhecido segue no 404 de sempre.
    expect((await abrirAprovacao(req("/api/aprovacao-video/nao-existe"), { params: Promise.resolve({ token: "nao-existe" }) })).status).toBe(404)
  })

  it("relatório executivo resolve a empresa pelo token", async () => {
    expect(await orgPorRelatorioToken(tokenRelatorio)).toBe(a)
  })
})

describe("recuperação de senha", () => {
  it("o pedido novo invalida o token anterior sem precisar de DELETE", async () => {
    const anterior = `${p}-token-anterior`
    await admin.passwordResetToken.create({ data: { email: emailV, token: anterior, expiresAt: new Date(Date.now() + 3_600_000) } })
    // O envio do e-mail não está configurado aqui; o que importa é o banco.
    await esqueciSenha(req("/api/auth/esqueci-senha", json({ email: emailV })))
    const tokens = await admin.passwordResetToken.findMany({ where: { email: emailV } })
    expect(tokens.find(t => t.token === anterior)?.usedAt).not.toBeNull()
    expect(tokens.filter(t => t.usedAt === null)).toHaveLength(1)
  })
})

describe("avaliação pública por QR", () => {
  it("grava e recalcula a média global, contando a avaliação privada de outra empresa", async () => {
    const r = await avaliarPorQr(req("/api/publico/avaliar", json({ videomakerId: vm, nota: 5 })))
    expect(r.status).toBe(200)
    expect((await admin.videomaker.findUniqueOrThrow({ where: { id: vm } })).avaliacao).toBe(3)
  })
})
