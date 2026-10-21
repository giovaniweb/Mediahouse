// Onda 2A sob RLS: o convite da equipe, o primeiro acesso, os primeiros passos
// e o código da empresa pelo login real da aplicação (app_user e app_auth, sem
// bypass), via scripts/teste-runtime-rls.mjs. A criação da empresa usa a conexão
// de dono (painel do super-admin), então aqui ela vem pronta da fixture.
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { NextRequest } from "next/server"

const sessao = vi.hoisted(() => ({ atual: null as null | { user: { id: string; organizacaoId: string; tipo: string } } }))
const email = vi.hoisted(() => vi.fn(async () => ({ ok: true })))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.atual }))
vi.mock("@/lib/email", () => ({ sendEmailNotificacao: email }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))

import { prismaBase } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { semearPacoteInicial } from "@/lib/pacote-inicial"
import { SENHA_PENDENTE } from "@/lib/convite-equipe"
import { POST as convidar } from "@/app/api/usuarios/convite/route"
import { GET as listarPessoas } from "@/app/api/usuarios/route"
import { GET as lerConvite } from "@/app/api/auth/convite/route"
import { POST as criarSenha } from "@/app/api/auth/redefinir-senha/route"
import { GET as passos, POST as passo } from "@/app/api/primeiros-passos/route"
import { POST as criarDemanda } from "@/app/api/demandas/route"

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST }) })
const p = `nasce-rls-${randomUUID().slice(0, 8)}`
const a = `${p}-a`, b = `${p}-b`, adminA = `${p}-adm`, deB = `${p}-deb`
const novo = `${p}-novo@example.invalid`, emailDeB = `${p}-deb@example.invalid`
const req = (url: string, body?: unknown) => new NextRequest(`http://ensaio.invalid${url}`,
  body === undefined ? undefined : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })
const ultimoToken = () => /redefinir-senha\/([a-f0-9]{64})/.exec((email.mock.calls.at(-1) as unknown as [{ html: string }])[0].html)?.[1] ?? ""

beforeAll(async () => {
  await admin.organizacao.createMany({ data: [
    { id: a, nome: "GH Produções", slug: a, prefixoCodigo: "GH" },
    { id: b, nome: "Outra", slug: b, prefixoCodigo: "OUT" },
  ] })
  await admin.$transaction((tx) => semearPacoteInicial(tx, a))
  await admin.usuario.createMany({ data: [
    { id: adminA, nome: "Gabriel", email: `${adminA}@example.invalid`, tipo: "admin", senhaHash: "sem-login-real" },
    { id: deB, nome: "Já trabalha na B", email: emailDeB, tipo: "editor", senhaHash: "$2b$04$abcdefghijklmnopqrstuuJ0Ht3Cvhm0G2o2Bmg5K8lZx6a7CDq3e" },
  ] })
  await admin.usuarioOrganizacao.createMany({ data: [
    { usuarioId: adminA, organizacaoId: a, papel: "admin", areas: [] },
    { usuarioId: deB, organizacaoId: b, papel: "editor", areas: [] },
  ] })
  sessao.atual = { user: { id: adminA, organizacaoId: a, tipo: "admin" } }
})

afterAll(async () => {
  await admin.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await admin.usuario.deleteMany({ where: { OR: [{ id: { in: [adminA, deB] } }, { email: novo }] } })
  await admin.passwordResetToken.deleteMany({ where: { email: { in: [novo, emailDeB] } } })
  await Promise.all([admin.$disconnect(), prismaBase.$disconnect(), prismaAuth.$disconnect()])
})

describe("empresa nova sob RLS", () => {
  it("convida quem não tem conta: nasce pendente, aparece na lista e cria a senha pelo link", async () => {
    const res = await convidar(req("/api/usuarios/convite", { email: novo, nome: "Bia Social", papel: "social" }))
    expect(res.status).toBe(201)
    const lista = await (await listarPessoas(req("/api/usuarios"))).json()
    const bia = lista.usuarios.find((u: { email: string }) => u.email === novo)
    expect(bia).toMatchObject({ convitePendente: true, papel: "social" })
    expect(bia).not.toHaveProperty("senhaHash")

    const token = ultimoToken()
    const info = await (await lerConvite(req(`/api/auth/convite?token=${token}`))).json()
    expect(info).toMatchObject({ valido: true, primeiroAcesso: true, empresa: "GH Produções", email: novo })
    expect((await criarSenha(req("/api/auth/redefinir-senha", { token, novaSenha: "Senha1234" }))).status).toBe(200)
    expect((await admin.usuario.findUniqueOrThrow({ where: { email: novo } })).senhaHash).not.toBe(SENHA_PENDENTE)
  })

  it("convida quem já trabalha em outra empresa: entra nesta sem link de senha e sem trazer nada da outra", async () => {
    const res = await convidar(req("/api/usuarios/convite", { email: emailDeB, papel: "editor" }))
    expect(res.status).toBe(201)
    expect((await res.json()).convite).toMatchObject({ jaTinhaConta: true, link: null })
    expect(await admin.usuarioOrganizacao.count({ where: { usuarioId: deB } })).toBe(2)
    expect((await admin.usuario.findUniqueOrThrow({ where: { id: deB } })).senhaHash).toMatch(/^\$2b\$/)
    // Segunda vez: já está na equipe e tem senha.
    expect((await convidar(req("/api/usuarios/convite", { email: emailDeB, papel: "editor" }))).status).toBe(409)
  })

  it("primeiros passos e a primeira demanda, com o código e o checklist da própria empresa", async () => {
    expect((await (await passos()).json()).mostrar).toBe(true)
    await passo(req("/api/primeiros-passos", { acao: "link-copiado" }))
    const res = await criarDemanda(req("/api/demandas", {
      titulo: "Primeira demanda", descricao: "Institucional da GH Produções", departamento: "audiovisual",
      tipoVideo: "video_institucional", cidade: "Sete Lagoas", prioridade: "normal",
    }))
    expect(res.status).toBe(201)
    const d = await admin.demanda.findFirstOrThrow({ where: { organizacaoId: a } })
    expect(d.codigo).toMatch(/^GH-\d{2}-0001$/)
    expect(await admin.checklistItem.count({ where: { demandaId: d.id } })).toBe(7)
    const restantes = (await (await passos()).json()).itens.filter((i: { feito: boolean }) => !i.feito).map((i: { chave: string }) => i.chave)
    expect(restantes).toEqual(["whatsapp", "produtos"])
  })
})
