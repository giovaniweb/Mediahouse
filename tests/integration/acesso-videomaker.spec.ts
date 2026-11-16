import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import type { TipoUsuario } from "@prisma/client"

// "Enviar acesso" na ficha do videomaker (16/11/2026). Rotas reais e banco
// real; só a sessão e o e-mail são simulados. O caso real era o Maicon
// Andrade: conta antiga criada por script (e-mail interno @nuflow.local, senha
// antiga), sem nenhum jeito de mandar o acesso de novo.
const { estado, emails } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
  emails: [] as { destinatario: string; html: string }[],
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))
vi.mock("@/lib/email", () => ({ sendEmailNotificacao: async (e: { destinatario: string; html: string }) => { emails.push(e); return { ok: true } } }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { decryptSecret } from "@/lib/secret-crypto"
import { hashTelefone } from "@/lib/whatsapp-outbox"
import { SENHA_PENDENTE } from "@/lib/convite-equipe"
import { GET as situacao, POST as enviar } from "@/app/api/videomakers/[id]/acesso/route"
import { GET as validarLink, POST as trocarSenha } from "@/app/api/auth/redefinir-senha/route"
import { GET as conviteDoLink } from "@/app/api/auth/convite/route"

const p = `acvm-${randomUUID().slice(0, 8)}`
const org = `${p}-org`, outra = `${p}-outra`
const pessoas = { admin: `${p}-admin`, gestor: `${p}-gestor`, editor: `${p}-editor`, adminOutra: `${p}-adm-outra` }
const vm = { antigo: `${p}-vm-antigo`, semConta: `${p}-vm-sem`, compartilhado: `${p}-vm-comp`, pendente: `${p}-vm-pend` }
const conta = { antigo: `${p}-u-antigo`, compartilhado: `${p}-u-comp` }
const tel = { antigo: "21966250001", semConta: "21966250002", compPerfil: "21966250003", compConta: "5521966250004", pendente: "21966250005" }
const emailAntigo = `${p}.maicon@nuflow.local`

function como(quem: keyof typeof pessoas, papel: TipoUsuario, organizacaoId = org) {
  estado.sessao = { user: { id: pessoas[quem], organizacaoId, tipo: papel, papel, name: quem } }
}
const req = (url: string, method = "GET") => new NextRequest(`http://localhost${url}`, { method })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const get = (id: string) => situacao(req(`/api/videomakers/${id}/acesso`), params(id))
const post = (id: string) => enviar(req(`/api/videomakers/${id}/acesso`, "POST"), params(id))
const saidas = (id: string) => db.saidaWhatsapp.findMany({ where: { organizacaoId: org, chave: { startsWith: `acesso-vm:${id}:` } }, orderBy: { createdAt: "asc" } })
const tokenDoTexto = (t: string) => /redefinir-senha\/([a-f0-9]{64})/.exec(t)?.[1]
/** Zera o limite de 5 minutos para testar o reenvio em seguida. */
const liberarLimite = (id: string) => db.$executeRaw`DELETE FROM limites_publicos WHERE chave = ${`acesso-videomaker:${id}`}`

beforeAll(async () => {
  vi.stubEnv("NEXTAUTH_URL", "https://nuflow.test")
  vi.stubEnv("EMAIL_ENCRYPTION_KEY", "chave-sintetica-acesso-videomaker")
  await db.organizacao.createMany({ data: [{ id: org, nome: `${p} Contour`, slug: org }, { id: outra, nome: `${p} Outra`, slug: outra }] })
  const papeis: [keyof typeof pessoas, TipoUsuario, string][] = [["admin", "admin", org], ["gestor", "gestor", org], ["editor", "editor", org], ["adminOutra", "admin", outra]]
  for (const [quem, papel, o] of papeis) {
    await db.usuario.create({ data: { id: pessoas[quem], nome: `${p} ${quem}`, tipo: papel, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: pessoas[quem], organizacaoId: o, papel, areas: ["audiovisual"] } })
  }
  // A conta antiga (como a do Maicon): e-mail interno e senha já gravada.
  await db.usuario.create({ data: { id: conta.antigo, nome: "Maicon Andrade", email: emailAntigo, telefone: tel.antigo, tipo: "videomaker", senhaHash: await bcrypt.hash("nuflow0001", 4) } })
  await db.usuarioOrganizacao.create({ data: { usuarioId: conta.antigo, organizacaoId: org, papel: "videomaker", categoria: "externo", areas: ["audiovisual"] } })
  // Conta compartilhada: também está na outra empresa, com telefone próprio.
  await db.usuario.create({ data: { id: conta.compartilhado, nome: "Gabriel Comp", email: `${p}-gabriel@gh.test`, telefone: tel.compConta, tipo: "videomaker", senhaHash: await bcrypt.hash("qualquer1", 4) } })
  await db.usuarioOrganizacao.createMany({ data: [
    { usuarioId: conta.compartilhado, organizacaoId: org, papel: "videomaker", categoria: "externo", areas: ["audiovisual"] },
    { usuarioId: conta.compartilhado, organizacaoId: outra, papel: "admin", areas: ["audiovisual"] },
  ] })
  await db.videomaker.createMany({ data: [
    { id: vm.antigo, nome: "Maicon Andrade", telefone: tel.antigo, email: emailAntigo, usuarioId: conta.antigo },
    { id: vm.semConta, nome: "Sem Conta Silva", telefone: tel.semConta },
    // O telefone do PERFIL foi trocado pela gestão daqui; a conta tem outro.
    { id: vm.compartilhado, nome: "Gabriel Comp", telefone: tel.compPerfil, usuarioId: conta.compartilhado },
    { id: vm.pendente, nome: "Candidato Pendente", telefone: tel.pendente },
  ] })
  await db.videomakerOrganizacao.createMany({ data: [
    { organizacaoId: org, videomakerId: vm.antigo },
    { organizacaoId: org, videomakerId: vm.semConta },
    { organizacaoId: org, videomakerId: vm.compartilhado },
    { organizacaoId: org, videomakerId: vm.pendente, status: "pendente" },
  ] })
})

beforeEach(() => { como("admin", "admin"); emails.length = 0 })

afterAll(async () => {
  const vms = Object.values(vm)
  const criadas = (await db.videomaker.findMany({ where: { id: { in: vms } }, select: { usuarioId: true } })).flatMap(v => v.usuarioId ? [v.usuarioId] : [])
  const todas = [...new Set([...criadas, ...Object.values(conta), ...Object.values(pessoas)])]
  const emailsDasContas = (await db.usuario.findMany({ where: { id: { in: todas } }, select: { email: true } })).flatMap(u => u.email ? [u.email] : [])
  await db.passwordResetToken.deleteMany({ where: { email: { in: emailsDasContas } } })
  for (const id of vms) await db.$executeRaw`DELETE FROM limites_publicos WHERE chave = ${`acesso-videomaker:${id}`}`
  await db.$executeRaw`DELETE FROM limites_publicos WHERE chave LIKE ${`acesso-videomaker-org:${p}%`}`
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: { in: [org, outra] } } })
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: { in: [org, outra] } } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: { in: [org, outra] } } })
  await db.permissaoUsuario.deleteMany({ where: { usuarioId: { in: todas } } })
  await db.videomakerOrganizacao.deleteMany({ where: { videomakerId: { in: vms } } })
  await db.videomaker.deleteMany({ where: { id: { in: vms } } })
  await db.usuarioOrganizacao.deleteMany({ where: { usuarioId: { in: todas } } })
  await db.usuario.deleteMany({ where: { id: { in: todas } } })
  await db.organizacao.deleteMany({ where: { id: { in: [org, outra] } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("quem pode", () => {
  it("outra empresa recebe 404 (não fica sabendo do cadastro)", async () => {
    como("adminOutra", "admin", outra)
    expect((await get(vm.antigo)).status).toBe(404)
    expect((await post(vm.antigo)).status).toBe(404)
  })
  it("o próprio videomaker e quem não é gestão recebem 404", async () => {
    estado.sessao = { user: { id: conta.antigo, organizacaoId: org, tipo: "videomaker", papel: "videomaker", name: "Maicon" } }
    expect((await get(vm.antigo)).status).toBe(404)
    expect((await post(vm.antigo)).status).toBe(404)
    como("editor", "editor")
    expect((await post(vm.antigo)).status).toBe(404)
    expect(await saidas(vm.antigo)).toHaveLength(0)
  })
  it("sem sessão, 401", async () => {
    estado.sessao = null
    expect((await post(vm.antigo)).status).toBe(401)
  })
  it("candidato pendente: 409, a aprovação é que cria o acesso", async () => {
    expect((await post(vm.pendente)).status).toBe(409)
  })
})

describe("conta antiga (o caso do Maicon)", () => {
  let primeiroToken = ""

  it("a ficha mostra que ele tem conta com senha e nunca recebeu o acesso por aqui", async () => {
    const res = await get(vm.antigo)
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j).toMatchObject({ conta: "com_senha", ultimoEnvio: null, bloqueio: null, compartilhada: false })
    expect(j.destino.whatsapp).toBe("(21) 9••••-0001")
    expect(j.destino.email).toBeNull() // e-mail interno não recebe nada
  })

  it("a gestão manda: WhatsApp na fila com o link de criar senha, sem senha no texto, e registro na auditoria", async () => {
    como("gestor", "gestor")
    const res = await post(vm.antigo)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, contaCriada: false, whatsapp: "na_fila", email: "sem_email" })
    expect(emails).toHaveLength(0)

    const [s] = await saidas(vm.antigo)
    expect(s).toMatchObject({ estado: "aguardando", origem: "manual", telefoneHash: hashTelefone(`55${tel.antigo}`), destinatarioId: conta.antigo })
    const texto = decryptSecret(s.conteudoCifrado!)
    expect(texto).toContain("Olá, Maicon!")
    expect(texto).toContain(`seu número de telefone (${tel.antigo})`)
    expect(texto).not.toMatch(/senha:\*?\s*nuflow/i)
    expect(texto).not.toContain("nuflow0001")
    primeiroToken = tokenDoTexto(texto)!
    expect(primeiroToken).toBeTruthy()

    const audit = await db.eventoAuditoria.findMany({ where: { organizacaoId: org, acao: "videomaker.acesso", recursoId: vm.antigo } })
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ atorId: pessoas.gestor, recurso: "videomaker", resultado: "sucesso" })
    expect(JSON.stringify(audit[0].depois)).not.toContain(tel.antigo)

    // O link é o da recuperação: válido, e não é de primeiro acesso (ele já tinha senha).
    expect(await (await validarLink(req(`/api/auth/redefinir-senha?token=${primeiroToken}`))).json()).toEqual({ valido: true })
  })

  it("a ficha passa a mostrar o último envio e segura o reenvio por 5 minutos", async () => {
    const j = await (await get(vm.antigo)).json()
    expect(j.ultimoEnvio).toMatchObject({ por: `${p} gestor`, whatsapp: "aguardando" })
    expect(new Date(j.proximoEnvioEm).getTime()).toBeGreaterThan(Date.now())
    const res = await post(vm.antigo)
    expect(res.status).toBe(429)
    expect(await saidas(vm.antigo)).toHaveLength(1)
  })

  it("o reenvio invalida o link anterior e cancela a mensagem antiga que ainda estava na fila", async () => {
    await liberarLimite(vm.antigo)
    const res = await post(vm.antigo)
    expect(res.status).toBe(200)
    const [velha, nova] = await saidas(vm.antigo)
    expect(velha).toMatchObject({ estado: "cancelado", motivo: "substituido" })
    expect(nova.estado).toBe("aguardando")
    const segundoToken = tokenDoTexto(decryptSecret(nova.conteudoCifrado!))!
    expect(segundoToken).not.toBe(primeiroToken)

    expect(await (await validarLink(req(`/api/auth/redefinir-senha?token=${primeiroToken}`))).json()).toMatchObject({ valido: false })
    const recusado = await trocarSenha(new NextRequest("http://localhost/api/auth/redefinir-senha", { method: "POST", body: JSON.stringify({ token: primeiroToken, novaSenha: "senhaNova123" }) }))
    expect(recusado.status).toBe(400)

    // O link novo troca a senha: a antiga deixa de valer, a nova passa.
    const ok = await trocarSenha(new NextRequest("http://localhost/api/auth/redefinir-senha", { method: "POST", body: JSON.stringify({ token: segundoToken, novaSenha: "senhaNova123" }) }))
    expect(ok.status).toBe(200)
    const depois = await db.usuario.findUniqueOrThrow({ where: { id: conta.antigo }, select: { senhaHash: true } })
    expect(await bcrypt.compare("senhaNova123", depois.senhaHash)).toBe(true)
    expect(await bcrypt.compare("nuflow0001", depois.senhaHash)).toBe(false)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: org, acao: "videomaker.acesso", recursoId: vm.antigo } })).toBe(2)
  })
})

describe("sem conta", () => {
  it("cria a conta como no cadastro (vínculo de videomaker, permissões), sem senha, e manda o link de primeiro acesso", async () => {
    expect((await (await get(vm.semConta)).json()).conta).toBe("sem_conta")
    const res = await post(vm.semConta)
    expect(res.status).toBe(200)
    const corpo = await res.json()
    expect(corpo, JSON.stringify(corpo)).toMatchObject({ contaCriada: true, whatsapp: "na_fila" })

    const v = await db.videomaker.findUniqueOrThrow({ where: { id: vm.semConta }, select: { usuarioId: true } })
    expect(v.usuarioId).toBeTruthy()
    const u = await db.usuario.findUniqueOrThrow({ where: { id: v.usuarioId! }, select: { email: true, telefone: true, senhaHash: true, tipo: true } })
    expect(u).toMatchObject({ senhaHash: SENHA_PENDENTE, tipo: "videomaker", telefone: tel.semConta })
    expect(u.email).toMatch(/@nuflow\.local$/)
    expect(await db.usuarioOrganizacao.findFirst({ where: { usuarioId: v.usuarioId!, organizacaoId: org }, select: { papel: true, categoria: true } }))
      .toMatchObject({ papel: "videomaker", categoria: "externo" })
    expect(await db.permissaoUsuario.count({ where: { usuarioId: v.usuarioId!, organizacaoId: org } })).toBe(1)

    const [s] = await saidas(vm.semConta)
    const token = tokenDoTexto(decryptSecret(s.conteudoCifrado!))!
    const link = await (await conviteDoLink(req(`/api/auth/convite?token=${token}`))).json()
    expect(link).toMatchObject({ valido: true, primeiroAcesso: true, nome: "Sem", empresa: `${p} Contour`, loginTelefone: tel.semConta })
    expect((await (await get(vm.semConta)).json()).conta).toBe("aguardando_senha")
  })
})

describe("conta compartilhada com outra empresa", () => {
  it("o link vai para o telefone e o e-mail da própria conta, nunca para o telefone do perfil", async () => {
    const j = await (await get(vm.compartilhado)).json()
    expect(j.compartilhada).toBe(true)
    expect(j.destino.whatsapp).toBe("(21) 9••••-0004")
    const res = await post(vm.compartilhado)
    expect(res.status).toBe(200)
    const [s] = await saidas(vm.compartilhado)
    expect(s.telefoneHash).toBe(hashTelefone(tel.compConta))
    expect(s.telefoneHash).not.toBe(hashTelefone(`55${tel.compPerfil}`))
    expect(emails.map(e => e.destinatario)).toEqual([`${p}-gabriel@gh.test`])
  })
  it("sem telefone nem e-mail na conta: 409, nada é enviado", async () => {
    await db.usuario.update({ where: { id: conta.compartilhado }, data: { telefone: null, email: `${p}-gabriel@nuflow.local` } })
    await liberarLimite(vm.compartilhado)
    const res = await post(vm.compartilhado)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Esqueci minha senha/)
    expect(await saidas(vm.compartilhado)).toHaveLength(1)
  })
})
