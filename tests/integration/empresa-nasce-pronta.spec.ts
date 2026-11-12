import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId?: string; tipo: string } } } }))
const { email } = vi.hoisted(() => ({ email: vi.fn(async () => ({ ok: true })) }))
vi.mock("@/lib/email", () => ({ sendEmailNotificacao: email }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { POST as criarEmpresa } from "@/app/api/admin/organizacoes/route"
import { POST as convidar } from "@/app/api/usuarios/convite/route"
import { GET as lerConvite } from "@/app/api/auth/convite/route"
import { POST as criarSenha } from "@/app/api/auth/redefinir-senha/route"
import { GET as passos, POST as passo } from "@/app/api/primeiros-passos/route"
import { POST as criarDemanda } from "@/app/api/demandas/route"
import { SENHA_PENDENTE } from "@/lib/convite-equipe"

// Do zero até a primeira demanda, pelas rotas de verdade (Onda 2A): o
// super-admin cria a empresa, o admin recebe o convite, cria a senha, convida a
// equipe e cria a primeira demanda, com o código da empresa.

const p = `nasce-${randomUUID().slice(0, 8)}`
const superAdmin = `${p}-super`
const emailAdmin = `${p}-admin@gh.test`, emailEquipe = `${p}-social@gh.test`
// Revisão do #142: conta antiga gravada com maiúscula, conta pendente de outra
// empresa, duas grafias do mesmo e-mail e uma pessoa nova com e-mail que falha.
const outraOrg = `${p}-outra`
const emailMaiusculo = `${p}-Antigo@GH.test`, emailAlheio = `${p}-alheio@gh.test`
const emailDuplo = `${p}-duplo@gh.test`, emailNovo = `${p}-novo@gh.test`
const emailsRevisao = [emailMaiusculo, emailAlheio, emailDuplo, emailDuplo.toUpperCase(), emailNovo]
const json = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
let orgId = "", adminId = "", tokenAdmin = ""
const tokenDoEmail = (n: number) => {
  const html = (email.mock.calls[n] as unknown as [{ html: string }])[0].html
  return /redefinir-senha\/([a-f0-9]{64})/.exec(html)?.[1] ?? ""
}

beforeAll(async () => {
  vi.stubEnv("NEXTAUTH_URL", "https://nuflow.test")
  await db.usuario.create({ data: { id: superAdmin, nome: "Giovani", tipo: "admin", senhaHash: "sem-login", superAdmin: true } })
})
beforeEach(() => { estado.sessao = { user: { id: superAdmin, tipo: "admin" } } })
afterAll(async () => {
  if (orgId) await db.organizacao.delete({ where: { id: orgId } })
  await db.organizacao.deleteMany({ where: { id: outraOrg } })
  await db.usuario.deleteMany({ where: { OR: [{ id: superAdmin }, { email: { in: [emailAdmin, emailEquipe, ...emailsRevisao] } }] } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("empresa nasce pronta", () => {
  it("o super-admin cria a empresa numa transação, com pacote e convite do admin", async () => {
    const res = await criarEmpresa(json("/api/admin/organizacoes", { nome: `GH Produções ${p}`, adminNome: "Gabriel Henrique", adminEmail: emailAdmin }))
    expect(res.status).toBe(201)
    const corpo = await res.json()
    orgId = corpo.organizacao.id
    expect(corpo.organizacao.prefixoCodigo).toBe("GH")
    expect(corpo.convite).toMatchObject({ enviado: true })
    expect(corpo.admin.jaTinhaConta).toBe(false)

    const [parametros, checklists, linhas, membro] = await Promise.all([
      db.configParametro.groupBy({ by: ["grupo"], where: { organizacaoId: orgId }, _count: true }),
      db.checklistTemplate.findMany({ where: { organizacaoId: orgId }, include: { itens: true } }),
      db.linhaProjeto.findMany({ where: { organizacaoId: orgId } }),
      db.usuarioOrganizacao.findFirstOrThrow({ where: { organizacaoId: orgId }, include: { usuario: true } }),
    ])
    expect(parametros.map((g) => g.grupo).sort()).toEqual(["areas_atuacao", "departamentos", "habilidades", "tipos_criativo", "tipos_video"])
    expect(checklists.map((c) => c.nome).sort()).toEqual(["Geral", "Reels", "Social Media"])
    expect(linhas.map((l) => l.nome)).toEqual(["Geral"])
    expect(membro).toMatchObject({ papel: "admin", recebeTodosAvisos: true, usuario: { email: emailAdmin, senhaHash: SENHA_PENDENTE } })
    adminId = membro.usuarioId

    tokenAdmin = tokenDoEmail(0)
    const registro = await db.passwordResetToken.findUniqueOrThrow({ where: { token: tokenAdmin } })
    const dias = (registro.expiresAt.getTime() - Date.now()) / 86400_000
    expect(dias).toBeGreaterThan(6.9)
    expect(dias).toBeLessThanOrEqual(7)
  })

  it("sem e-mail do admin, ou com prefixo inválido, nada é criado", async () => {
    const antes = await db.organizacao.count()
    expect((await criarEmpresa(json("/api/admin/organizacoes", { nome: "Sem admin" }))).status).toBe(400)
    expect((await criarEmpresa(json("/api/admin/organizacoes", { nome: "X", adminNome: "Y", adminEmail: "y@x.test", prefixoCodigo: "G1" }))).status).toBe(400)
    expect(await db.organizacao.count()).toBe(antes)
  })

  it("o link do convite dá as boas-vindas e, criada a senha, deixa de ser pendente", async () => {
    const info = await (await lerConvite(new NextRequest(`http://localhost/api/auth/convite?token=${tokenAdmin}`))).json()
    expect(info).toMatchObject({ valido: true, primeiroAcesso: true, nome: "Gabriel", email: emailAdmin })
    expect(info.empresa).toMatch(/^GH Produções/)
    expect((await criarSenha(json("/api/auth/redefinir-senha", { token: tokenAdmin, novaSenha: "Senha1234" }))).status).toBe(200)
    expect((await db.usuario.findUniqueOrThrow({ where: { id: adminId } })).senhaHash).not.toBe(SENHA_PENDENTE)
    expect((await (await lerConvite(new NextRequest(`http://localhost/api/auth/convite?token=${tokenAdmin}`))).json()).valido).toBe(false)
  })

  it("o admin vê os primeiros passos, convida a equipe e cria a primeira demanda com o código da empresa", async () => {
    estado.sessao = { user: { id: adminId, organizacaoId: orgId, tipo: "admin" } }
    const inicio = await (await passos()).json()
    expect(inicio.mostrar).toBe(true)
    expect(inicio.itens.filter((i: { feito: boolean }) => !i.feito)).toHaveLength(5)

    const convite = await convidar(json("/api/usuarios/convite", { email: emailEquipe, nome: "Bia Social", papel: "social" }))
    expect(convite.status).toBe(201)
    expect((await convite.json()).convite).toMatchObject({ enviado: true, jaTinhaConta: false })
    // Reenviar o mesmo e-mail pendente gera link novo; o anterior deixa de valer.
    const primeiro = tokenDoEmail(email.mock.calls.length - 1)
    expect((await convidar(json("/api/usuarios/convite", { email: emailEquipe, papel: "social" }))).status).toBe(200)
    expect((await db.passwordResetToken.findUniqueOrThrow({ where: { token: primeiro } })).usedAt).not.toBeNull()
    // Papel fora da lista do convite é recusado.
    expect((await convidar(json("/api/usuarios/convite", { email: "x@gh.test", nome: "X", papel: "videomaker" }))).status).toBe(400)

    await passo(json("/api/primeiros-passos", { acao: "link-copiado" }))
    const demanda = await criarDemanda(json("/api/demandas", {
      titulo: "Primeira demanda", descricao: "Vídeo institucional da GH", departamento: "audiovisual",
      tipoVideo: "video_institucional", cidade: "Sete Lagoas", prioridade: "normal",
    }))
    expect(demanda.status).toBe(201)
    const criada = (await demanda.json()).demanda ?? {}
    const salva = await db.demanda.findFirstOrThrow({ where: { organizacaoId: orgId } })
    expect(salva.codigo).toMatch(/^GH-\d{2}-0001$/)
    if (criada.codigo) expect(criada.codigo).toBe(salva.codigo)
    // O checklist veio do modelo "Geral" da própria empresa.
    expect(await db.checklistItem.count({ where: { demandaId: salva.id } })).toBe(7)

    const fim = await (await passos()).json()
    expect(fim.itens.filter((i: { feito: boolean }) => !i.feito).map((i: { chave: string }) => i.chave)).toEqual(["whatsapp", "produtos"])
    await passo(json("/api/primeiros-passos", { acao: "dispensar" }))
    expect((await (await passos()).json()).mostrar).toBe(false)
  })
})

describe("convite: e-mail com maiúscula e link só para quem nasceu agora (revisão do #142)", () => {
  beforeAll(async () => {
    await db.organizacao.create({ data: { id: outraOrg, nome: "Outra produtora", slug: outraOrg, ativo: true, prefixoCodigo: "OP" } })
    // Conta antiga com maiúscula, com senha, em outra empresa.
    await db.usuario.create({ data: { nome: "Antigo", email: emailMaiusculo, senhaHash: "$2b$10$" + "x".repeat(53), tipo: "editor",
      organizacoes: { create: { organizacaoId: outraOrg, papel: "editor" } } } })
    // Conta convidada pela outra empresa, ainda sem senha.
    await db.usuario.create({ data: { nome: "Alheio", email: emailAlheio, senhaHash: SENHA_PENDENTE, tipo: "editor",
      organizacoes: { create: { organizacaoId: outraOrg, papel: "editor" } } } })
    // Duas grafias do mesmo e-mail (o índice único é sobre o texto exato).
    await db.usuario.createMany({ data: [
      { nome: "Duplo a", email: emailDuplo, senhaHash: "sem-login", tipo: "editor" },
      { nome: "Duplo b", email: emailDuplo.toUpperCase(), senhaHash: "sem-login", tipo: "editor" },
    ] })
  })
  beforeEach(() => { estado.sessao = { user: { id: adminId, organizacaoId: orgId, tipo: "admin" } } })

  it("acha a conta antiga gravada com maiúscula: não cria segunda identidade", async () => {
    const res = await convidar(json("/api/usuarios/convite", { email: emailMaiusculo.toLowerCase(), nome: "Antigo", papel: "social" }))
    expect(res.status).toBe(201)
    expect((await res.json()).convite.jaTinhaConta).toBe(true)
    const contas = await db.usuario.findMany({ where: { email: { equals: emailMaiusculo, mode: "insensitive" } }, include: { organizacoes: true } })
    expect(contas).toHaveLength(1)
    expect(contas[0].email).toBe(emailMaiusculo)
    expect(contas[0].organizacoes.map((o) => o.organizacaoId).sort()).toEqual([orgId, outraOrg].sort())
  })

  it("duas grafias do mesmo e-mail: recusa em vez de escolher ou criar uma terceira", async () => {
    const res = await convidar(json("/api/usuarios/convite", { email: emailDuplo, nome: "Duplo", papel: "social" }))
    expect(res.status).toBe(409)
    expect(await db.usuario.count({ where: { email: { equals: emailDuplo, mode: "insensitive" } } })).toBe(2)
  })

  it("e-mail falhou: conta pendente de outra empresa NÃO devolve o token a quem convida", async () => {
    email.mockResolvedValueOnce({ ok: false, error: "fora do ar" } as never)
    const res = await convidar(json("/api/usuarios/convite", { email: emailAlheio, papel: "social" }))
    expect(res.status).toBe(201)
    const corpo = await res.json()
    expect(corpo.convite).toMatchObject({ enviado: false, link: null })
    // O token existe (foi para o e-mail da pessoa), mas não saiu na resposta.
    const tokens = await db.passwordResetToken.findMany({ where: { email: emailAlheio, usedAt: null } })
    expect(tokens).toHaveLength(1)
    expect(JSON.stringify(corpo)).not.toContain(tokens[0].token)
  })

  it("e-mail falhou no reenvio de alguém daqui: também sem link na resposta", async () => {
    email.mockResolvedValueOnce({ ok: false, error: "fora do ar" } as never)
    const res = await convidar(json("/api/usuarios/convite", { email: emailAlheio, papel: "social" }))
    expect(res.status).toBe(200)
    expect((await res.json()).convite).toMatchObject({ enviado: false, reenvio: true, link: null })
  })

  it("e-mail falhou para pessoa nova criada agora: o link volta, para mandar por outro caminho", async () => {
    email.mockResolvedValueOnce({ ok: false, error: "fora do ar" } as never)
    const res = await convidar(json("/api/usuarios/convite", { email: emailNovo, nome: "Novo", papel: "social" }))
    expect(res.status).toBe(201)
    const { convite } = await res.json()
    expect(convite.enviado).toBe(false)
    const token = (await db.passwordResetToken.findFirstOrThrow({ where: { email: emailNovo, usedAt: null } })).token
    expect(convite.link).toContain(token)
  })
})
