// "Enviar acesso" do videomaker pelo login real da aplicação (RLS ligada),
// 16/11/2026 — as trancas do banco entram em 17/11. Conta antiga recebe o link
// e o reenvio anula o anterior; sem conta, a conta nasce sob RLS (pessoa,
// vínculo, ligação ao perfil, permissões); outra empresa não enxerga nada.
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const sessao = vi.hoisted(() => ({ atual: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.atual }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/email", () => ({ sendEmailNotificacao: async () => ({ ok: true }) }))

import { prismaBase } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { comOrg } from "@/lib/org-contexto"
import { SENHA_PENDENTE } from "@/lib/convite-equipe"
import { GET as situacao, POST as enviar } from "@/app/api/videomakers/[id]/acesso/route"

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST }) })
const p = `acrls-${randomUUID().slice(0, 8)}`
const a = `${p}-a`, b = `${p}-b`, gestor = `${p}-g`, adminB = `${p}-gb`, contaAntiga = `${p}-u`
const vmAntigo = `${p}-vm1`, vmSem = `${p}-vm2`

const req = (id: string, method = "GET") => new NextRequest(`http://localhost/api/videomakers/${id}/acesso`, { method })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const como = (id: string, org: string) => { sessao.atual = { user: { id, organizacaoId: org, tipo: "admin", papel: "admin" } } }
const get = (org: string, id: string) => comOrg(org, () => situacao(req(id), params(id)))
const post = (org: string, id: string) => comOrg(org, () => enviar(req(id, "POST"), params(id)))

beforeAll(async () => {
  vi.stubEnv("EMAIL_ENCRYPTION_KEY", "chave-sintetica-acesso-rls")
  await admin.organizacao.createMany({ data: [{ id: a, nome: "Contour", slug: a }, { id: b, nome: "Outra", slug: b }] })
  await admin.usuario.createMany({ data: [
    { id: gestor, nome: "Gestora", tipo: "gestor", senhaHash: "sem-login-real" },
    { id: adminB, nome: "Admin B", tipo: "admin", senhaHash: "sem-login-real" },
    { id: contaAntiga, nome: "Maicon", email: `${p}.maicon@nuflow.local`, telefone: "21966259001", tipo: "videomaker", senhaHash: "$2a$04$abcdefghijklmnopqrstuuJ6v1T1m8m0cS9oCw8k2wJ0YH1b5a0eW" },
  ] })
  await admin.usuarioOrganizacao.createMany({ data: [
    { usuarioId: gestor, organizacaoId: a, papel: "gestor", areas: [] },
    { usuarioId: adminB, organizacaoId: b, papel: "admin", areas: [] },
    { usuarioId: contaAntiga, organizacaoId: a, papel: "videomaker", categoria: "externo", areas: ["audiovisual"] },
  ] })
  await admin.videomaker.createMany({ data: [
    { id: vmAntigo, nome: "Maicon", telefone: "21966259001", usuarioId: contaAntiga },
    { id: vmSem, nome: "Sem Conta", telefone: "21966259002" },
  ] })
  await admin.videomakerOrganizacao.createMany({ data: [{ organizacaoId: a, videomakerId: vmAntigo }, { organizacaoId: a, videomakerId: vmSem }] })
})

afterAll(async () => {
  const novo = (await admin.videomaker.findUnique({ where: { id: vmSem }, select: { usuarioId: true } }))?.usuarioId
  const contas = [gestor, adminB, contaAntiga, ...(novo ? [novo] : [])]
  const emails = (await admin.usuario.findMany({ where: { id: { in: contas } }, select: { email: true } })).flatMap(u => u.email ? [u.email] : [])
  await admin.passwordResetToken.deleteMany({ where: { email: { in: emails } } })
  await admin.$executeRaw`DELETE FROM limites_publicos WHERE chave LIKE ${`acesso-videomaker%${p}%`}`
  await admin.jobAutomacao.deleteMany({ where: { organizacaoId: { in: [a, b] } } })
  await admin.saidaWhatsapp.deleteMany({ where: { organizacaoId: { in: [a, b] } } })
  await admin.eventoAuditoria.deleteMany({ where: { organizacaoId: { in: [a, b] } } })
  await admin.permissaoUsuario.deleteMany({ where: { usuarioId: { in: contas } } })
  await admin.videomaker.deleteMany({ where: { id: { in: [vmAntigo, vmSem] } } })
  await admin.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await admin.usuario.deleteMany({ where: { id: { in: contas } } })
  await Promise.all([admin.$disconnect(), prismaAuth.$disconnect(), prismaBase.$disconnect()])
})

describe("enviar acesso com RLS", () => {
  it("outra empresa: 404", async () => {
    como(adminB, b)
    expect((await get(b, vmAntigo)).status).toBe(404)
    expect((await post(b, vmAntigo)).status).toBe(404)
  })

  it("conta antiga: a gestão manda, o reenvio anula o link anterior", async () => {
    como(gestor, a)
    expect((await (await get(a, vmAntigo)).json()).conta).toBe("com_senha")
    const r1 = await post(a, vmAntigo)
    expect(r1.status, JSON.stringify(await r1.clone().json())).toBe(200)
    expect(await r1.json()).toMatchObject({ whatsapp: "na_fila" })
    const [t1] = await admin.passwordResetToken.findMany({ where: { email: `${p}.maicon@nuflow.local`, usedAt: null } })
    await admin.$executeRaw`DELETE FROM limites_publicos WHERE chave = ${`acesso-videomaker:${vmAntigo}`}`
    expect((await post(a, vmAntigo)).status).toBe(200)
    const tokens = await admin.passwordResetToken.findMany({ where: { email: `${p}.maicon@nuflow.local` }, orderBy: { createdAt: "asc" } })
    expect(tokens).toHaveLength(2)
    expect(tokens.find(t => t.token === t1.token)?.usedAt).not.toBeNull()
    expect(tokens.filter(t => !t.usedAt)).toHaveLength(1)
    const j = await (await get(a, vmAntigo)).json()
    expect(j.ultimoEnvio).toMatchObject({ por: "Gestora" })
    expect(await admin.saidaWhatsapp.count({ where: { organizacaoId: a, estado: "cancelado", chave: { startsWith: `acesso-vm:${vmAntigo}:` } } })).toBe(1)
  })

  it("sem conta: a conta nasce sob RLS, ligada ao perfil, com o vínculo e as permissões", async () => {
    como(gestor, a)
    const r = await post(a, vmSem)
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200)
    expect(await r.json()).toMatchObject({ contaCriada: true, whatsapp: "na_fila" })
    const v = await admin.videomaker.findUniqueOrThrow({ where: { id: vmSem }, select: { usuarioId: true } })
    const u = await admin.usuario.findUniqueOrThrow({ where: { id: v.usuarioId! }, select: { senhaHash: true, email: true } })
    expect(u.senhaHash).toBe(SENHA_PENDENTE)
    expect(await admin.permissaoUsuario.count({ where: { usuarioId: v.usuarioId!, organizacaoId: a } })).toBe(1)
    expect((await (await get(a, vmSem)).json()).conta).toBe("aguardando_senha")
  })
})
