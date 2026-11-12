import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Avisos por pessoa (12/11/2026), com banco real: a gestão escolhe o que cada
// pessoa recebe, e os três canais obedecem. A prova principal é a primeira:
// sem configuração, NADA muda.
const { sessao } = vi.hoisted(() => ({ sessao: { user: null as null | { id: string; organizacaoId: string; tipo: string; papel: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => (sessao.user ? { user: sessao.user } : null) }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { comOrg } from "@/lib/org-contexto"
import { criarSaida, processarSaidas, MOTIVO_DESLIGADO } from "@/lib/whatsapp-outbox"
import { encryptSecret } from "@/lib/secret-crypto"
import { filtrarEmails, podeAvisar } from "@/lib/preferencias-aviso"
import type { CategoriaAviso } from "@/lib/avisos-categorias"
import { GET as lerAvisos, PUT as salvarAvisos } from "@/app/api/avisos-por-pessoa/route"
import { GET as sino } from "@/app/api/notificacoes/route"

const p = `avpessoa-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const tel = () => `5541${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const gente = {
  giovani: { id: `${p}-giovani`, papel: "admin", email: `giovani@${p}.test`, telefone: tel() },
  thalisson: { id: `${p}-thalisson`, papel: "gestor", email: `thalisson@${p}.test`, telefone: tel() },
  debora: { id: `${p}-debora`, papel: "gestor", email: `debora@${p}.test`, telefone: tel() },
  luisa: { id: `${p}-luisa`, papel: "solicitante", email: `luisa@${p}.test`, telefone: tel() },
}
const cardDoThalisson = `${p}-d1`, cardDosOutros = `${p}-d2`
const http = vi.mocked(fetch)

const entrar = (quem: keyof typeof gente) => {
  const g = gente[quem]
  sessao.user = { id: g.id, organizacaoId: org, tipo: g.papel, papel: g.papel }
}
const saida = (quem: keyof typeof gente, e: { categoria?: CategoriaAviso; chave?: string; referencia?: string }) =>
  comOrg(org, () => db.$transaction((tx) => criarSaida(tx, {
    organizacaoId: org, origem: e.chave?.startsWith("grav:") ? "manual" : "legado", chave: e.chave ?? randomUUID(),
    referencia: e.referencia ?? "aviso", telefone: gente[quem].telefone, texto: "AVISO-SINTETICO",
    expiraEm: new Date(Date.now() + 86400_000), categoria: e.categoria,
  })))
const salvar = async (alvo: keyof typeof gente, categorias: object[]) => salvarAvisos(new NextRequest("http://localhost/api/avisos-por-pessoa", {
  method: "PUT", body: JSON.stringify({ usuarioId: gente[alvo].id, categorias }),
}))
const so = (ligadas: Partial<Record<CategoriaAviso, "tudo" | "meus">>) =>
  (["pedidos", "andamento", "comentarios", "gravacoes", "social", "eventos", "prazos", "resumos", "sistema"] as CategoriaAviso[]).map((categoria) => {
    const r = ligadas[categoria]
    return { categoria, sino: !!r, email: !!r, whatsapp: !!r, recorte: r ?? "tudo", travada: false }
  })
const alertasDoSino = async () => ((await (await sino()).json()) as { alertas: { tipoAlerta?: string; mensagem: string }[] }).alertas.map((a) => a.mensagem).sort()

beforeAll(async () => {
  vi.stubEnv("EMAIL_ENCRYPTION_KEY", "chave-sintetica-avisos-pessoa")
  vi.stubEnv("WHATSAPP_EVOLUTION_CONTRATO", "2.3.7")
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const g of Object.values(gente)) {
    await db.usuario.create({ data: { id: g.id, nome: g.id, email: g.email, tipo: g.papel as "admin", telefone: g.telefone, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: g.id, organizacaoId: org, papel: g.papel as "admin", areas: ["audiovisual"] } })
  }
  await db.configWhatsapp.create({ data: { organizacaoId: org, instanceId: `${p}-inst`, instanceUrl: "https://example.invalid", apiKey: "api-nao-expor", ativo: true, webhookSecret: encryptSecret("segredo") } })
  for (const [id, gestorId] of [[cardDoThalisson, gente.thalisson.id], [cardDosOutros, gente.giovani.id]]) {
    await db.demanda.create({ data: {
      id, organizacaoId: org, codigo: `AV-${id.slice(-2)}`, titulo: `Card ${id.slice(-2)}`, descricao: "Teste.",
      area: "audiovisual", departamento: "audiovisual", tipoVideo: "institucional", cidade: "Curitiba",
      solicitanteId: gente.giovani.id, gestorId, statusInterno: "editando", statusVisivel: "producao",
    } })
  }
})

beforeEach(async () => {
  http.mockReset(); http.mockResolvedValue(Response.json({ key: { id: randomUUID() } }))
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: org } })
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.preferenciaAviso.deleteMany({ where: { organizacaoId: org } })
})

afterAll(async () => {
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: org } })
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: org } }).catch(() => undefined)
  await db.preferenciaAviso.deleteMany({ where: { organizacaoId: org } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.configWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } }).catch(() => undefined)
  await db.usuario.deleteMany({ where: { id: { in: Object.values(gente).map((g) => g.id) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()]); vi.unstubAllEnvs()
})

describe("sem configuração, nada muda", () => {
  it("WhatsApp, e-mail e sino seguem iguais para todas as categorias", async () => {
    for (const categoria of ["pedidos", "andamento", "gravacoes", "prazos", "sistema"] as CategoriaAviso[]) {
      const s = await saida("thalisson", { categoria, referencia: cardDosOutros })
      expect(s.estado).toBe("aguardando")
      expect(s.conteudoCifrado).not.toBeNull()
    }
    expect(await db.jobAutomacao.count({ where: { organizacaoId: org } })).toBe(5)
    const emails = Object.values(gente).map((g) => g.email)
    expect(await comOrg(org, () => filtrarEmails(db, { organizacaoId: org, categoria: "andamento", demandaId: cardDosOutros }, emails))).toEqual(emails)
    await db.alertaIA.createMany({ data: [
      { organizacaoId: org, tipoAlerta: "nova_demanda_audiovisual", mensagem: "pedido" },
      { organizacaoId: org, tipoAlerta: "material_recebido", mensagem: "material" },
      { organizacaoId: org, tipoAlerta: "regra_prazo_vencido", mensagem: "prazo", demandaId: cardDosOutros },
    ] })
    entrar("thalisson")
    expect(await alertasDoSino()).toEqual(["material", "pedido", "prazo"])
  })
})

describe("Thalisson: só as demandas, nos cards em que está", () => {
  it("andamento e prazos só dos cards dele; gravações não chegam; pedidos novos sim", async () => {
    entrar("giovani")
    const r = await salvar("thalisson", so({ pedidos: "tudo", andamento: "meus", comentarios: "meus", prazos: "meus", resumos: "tudo" }))
    expect(r.status).toBe(200)

    expect((await saida("thalisson", { categoria: "andamento", referencia: cardDoThalisson })).estado).toBe("aguardando")
    const fora = await saida("thalisson", { categoria: "andamento", referencia: cardDosOutros })
    expect(fora).toMatchObject({ estado: "cancelado", motivo: MOTIVO_DESLIGADO, conteudoCifrado: null, telefoneCifrado: null })
    expect((await saida("thalisson", { categoria: "pedidos" })).estado).toBe("aguardando")
    expect((await saida("thalisson", { chave: `grav:${cardDosOutros}:material:2026-11-12:operacao:abc`, referencia: cardDosOutros })).estado).toBe("cancelado")

    // A prova de que o desligado não sai: só os dois que passaram vão para a rede.
    await processarSaidas(org)
    expect(http).toHaveBeenCalledTimes(2)
    expect(http.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).text)).toEqual(["AVISO-SINTETICO", "AVISO-SINTETICO"])

    await db.alertaIA.createMany({ data: [
      { organizacaoId: org, tipoAlerta: "regra_prazo_vencido", mensagem: "prazo do card dele", demandaId: cardDoThalisson },
      { organizacaoId: org, tipoAlerta: "regra_prazo_vencido", mensagem: "prazo de outro card", demandaId: cardDosOutros },
      { organizacaoId: org, tipoAlerta: "material_recebido", mensagem: "material" },
      { organizacaoId: org, tipoAlerta: "nova_demanda_audiovisual", mensagem: "pedido" },
      { organizacaoId: org, tipoAlerta: "tipo_que_ainda_nao_existe", mensagem: "desconhecido passa" },
    ] })
    entrar("thalisson")
    expect(await alertasDoSino()).toEqual(["desconhecido passa", "pedido", "prazo do card dele"])
    // O Giovani, sem configuração, continua vendo tudo.
    entrar("giovani")
    expect(await alertasDoSino()).toHaveLength(5)
  })
})

describe("Débora: só os avisos dos videomakers", () => {
  it("gravações chegam nos três canais; o resto não", async () => {
    entrar("giovani")
    expect((await salvar("debora", so({ gravacoes: "tudo" }))).status).toBe(200)
    expect((await saida("debora", { chave: `grav:${cardDosOutros}:confirmada:2026-11-12:operacao:abc`, referencia: cardDosOutros })).estado).toBe("aguardando")
    expect((await saida("debora", { categoria: "andamento", referencia: cardDosOutros })).estado).toBe("cancelado")
    expect((await saida("debora", { categoria: "pedidos" })).estado).toBe("cancelado")
    // Sem categoria (senha, convite, envio à mão): sempre sai.
    expect((await saida("debora", {})).estado).toBe("aguardando")
    const emails = Object.values(gente).map((g) => g.email)
    expect(await comOrg(org, () => filtrarEmails(db, { organizacaoId: org, categoria: "gravacoes" }, emails))).toEqual(emails)
    expect(await comOrg(org, () => filtrarEmails(db, { organizacaoId: org, categoria: "andamento" }, emails))).toEqual(emails.filter((e) => e !== gente.debora.email))
    // E-mail que não é de pessoa da empresa (financeiro, compras) passa sempre.
    expect(await comOrg(org, () => filtrarEmails(db, { organizacaoId: org, categoria: "andamento" }, ["compras@fora.test"]))).toEqual(["compras@fora.test"])
  })
})

describe("quem pode mudar", () => {
  it("a pessoa muda as dela, não a dos outros, e não destrava o que a gestão travou", async () => {
    entrar("giovani")
    await salvar("luisa", so({ gravacoes: "tudo" }).map((c) => (c.categoria === "pedidos" ? { ...c, travada: true } : c)))
    entrar("luisa")
    expect((await salvar("thalisson", so({}))).status).toBe(403)
    expect((await lerAvisos(new NextRequest(`http://localhost/api/avisos-por-pessoa?usuarioId=${gente.thalisson.id}`))).status).toBe(403)
    const minhas = await (await lerAvisos(new NextRequest("http://localhost/api/avisos-por-pessoa"))).json()
    expect(minhas).toMatchObject({ pessoa: { id: gente.luisa.id }, comoGestao: false, pessoas: [] })
    const r = await salvar("luisa", so({ pedidos: "tudo", andamento: "tudo", gravacoes: "tudo" }).map((c) => ({ ...c, travada: false })))
    expect(r.status).toBe(200)
    const linhas = await db.preferenciaAviso.findMany({ where: { organizacaoId: org, usuarioId: gente.luisa.id } })
    // A travada ficou como a gestão deixou; a pessoa não destrava.
    expect(linhas.find((l) => l.categoria === "pedidos")).toMatchObject({ sino: false, whatsapp: false, travada: true })
    // Voltar ao padrão apaga a linha: sem linha é "recebe como sempre".
    expect(linhas.find((l) => l.categoria === "andamento")).toBeUndefined()
    expect(await comOrg(org, () => podeAvisar(db, { organizacaoId: org, categoria: "andamento" }, gente.luisa.id, "whatsapp"))).toBe(true)
    expect(await comOrg(org, () => podeAvisar(db, { organizacaoId: org, categoria: "pedidos" }, gente.luisa.id, "whatsapp"))).toBe(false)
    // Fica na Auditoria quem mudou de quem.
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: org, acao: "avisos.preferencias", recursoId: gente.luisa.id } })).toBe(2)
  })
})
