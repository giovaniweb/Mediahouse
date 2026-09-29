import { processarInbox } from "@/lib/whatsapp-inbox"
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { randomUUID } from "node:crypto"
vi.mock("@/lib/auth", () => ({ auth: async () => null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/whatsapp", () => ({ sendWhatsappMessage: vi.fn(async () => ({ id: "sintetico" })), getWhatsappConfig: vi.fn(async () => null) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: vi.fn() }))
vi.mock("@/app/api/demandas/route", () => ({ notificarLideresAudiovisual: vi.fn() }))
vi.mock("@/lib/claude", () => ({ executarAgenteComTools: vi.fn(), MODELO_WHATSAPP: "teste", TOOLS_WHATSAPP: [], TOOLS_WHATSAPP_DESCONHECIDO: [], SYSTEM_WHATSAPP: "teste" }))
vi.mock("@/lib/storage", () => ({ downloadEvolutionMedia: vi.fn(), uploadMedia: vi.fn() }))
vi.mock("@/lib/transcription", () => ({ transcreverAudio: vi.fn() }))
vi.mock("@/lib/secret-crypto", () => ({ decryptSecret: (s: string) => s, encryptSecret: (s: string) => s }))
import { POST as webhook } from "@/app/api/whatsapp/webhook/route"
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { executarFerramenta } from "@/lib/ia-tools-executor"
import { contextoUsuario, contextoSistema, contextoWhatsApp, type ContextoFerramenta } from "@/lib/ia-tool-contexto"
import { identidadeWhatsApp } from "@/lib/whatsapp-identidade"
import { comOrg } from "@/lib/org-contexto"
import { sendWhatsappMessage } from "@/lib/whatsapp"
const p = `tools-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, admin = `${p}-admin`, executor = `${p}-executor`, vm = `${p}-vm`, outro = `${p}-outro`
const tel = "5531999991001", telOutro = "5521999991001", telAdmin = "5531999991002", externo = "5531999991003"
const own = `${p}-own`, hidden = `${p}-hidden`, foreign = `${p}-foreign`
const humano = () => contextoUsuario(a, executor), gestor = () => contextoUsuario(a, admin)
const chamar = async (nome: string, input: unknown, ctx = humano()) => JSON.parse(await executarFerramenta(nome, input, ctx))
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.createMany({ data: [{ id: admin, nome: "Gestor", telefone: telAdmin, tipo: "admin", senhaHash: "sem-login" }, { id: executor, nome: "Executor", telefone: tel, tipo: "admin", senhaHash: "sem-login" }] })
  await db.usuarioOrganizacao.createMany({ data: [{ usuarioId: admin, organizacaoId: a, papel: "admin", areas: [] }, { usuarioId: admin, organizacaoId: b, papel: "solicitante", areas: [] }, { usuarioId: executor, organizacaoId: a, papel: "videomaker", areas: [] }] })
  await db.permissaoUsuario.create({ data: { usuarioId: executor, organizacaoId: a, verIA: true, verDemandas: true, editarDemanda: true, verAgenda: true } })
  await db.videomaker.createMany({ data: [{ id: vm, nome: "Próprio", telefone: tel, usuarioId: executor }, { id: outro, nome: "Outro DDD", telefone: telOutro }].map(v => ({ ...v, redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] })) })
  await db.videomakerOrganizacao.createMany({ data: [vm,outro].map(videomakerId => ({ organizacaoId: a, videomakerId, valorDiaria: 777 })) })
  await db.demanda.createMany({ data: [{ id: own, organizacaoId: a, videomakerId: vm }, { id: hidden, organizacaoId: a, videomakerId: outro }, { id: foreign, organizacaoId: b, videomakerId: vm }].map(d => ({ ...d, codigo: d.id, titulo: d.id, descricao: "sintética", cidade: "Teste", departamento: "growth", tipoVideo: "reels", solicitanteId: admin })) })
  await db.configWhatsapp.create({ data: { organizacaoId: a, instanceId: p, instanceUrl: "https://example.invalid", apiKey: "sintetica", webhookSecret: "segredo-sintetico" } })
  await db.custoVideomaker.create({ data: { organizacaoId: a, videomakerId: vm, valor: 777, dataReferencia: new Date() } })
})
beforeEach(() => vi.mocked(sendWhatsappMessage).mockClear())
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [a,b] } } })
  await db.videomaker.deleteMany({ where: { id: { in: [vm,outro] } } })
  await db.usuario.deleteMany({ where: { id: { in: [admin,executor] } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
describe("executor autorizado", () => {
  it("nega contexto ausente, string antiga e objeto forjado", async () => {
    for (const ctx of [undefined, a, { organizacaoId: a, principal: { tipo: "sistema", agente: "vistoria" } }]) expect(JSON.parse(await executarFerramenta("buscar_metricas", {}, ctx as ContextoFerramenta))).toHaveProperty("erro")
  })
  it("acesso ao chat não concede financeiro/métricas", async () => {
    for (const nome of ["buscar_custos", "buscar_metricas", "listar_gestores", "buscar_videomakers"]) expect(await chamar(nome, {})).toHaveProperty("erro")
  })
  it("consulta próprias sem herdar admin global", async () => {
    const r = await chamar("buscar_demandas", {})
    expect(r.demandas.map((d: { id: string }) => d.id)).toEqual([own])
    expect(await chamar("buscar_demanda_por_codigo", { codigo: hidden })).toHaveProperty("erro")
    expect(await chamar("buscar_historico_demanda", { demanda_id: foreign })).toHaveProperty("erro")
    const propria = await chamar("buscar_demanda_por_codigo", { codigo: own })
    expect(propria.id).toBe(own); expect(propria).not.toHaveProperty("publicToken")
  })
  it.each([null, [], "{}", { organizacaoId: b }, { usuario_id: admin }, { limite: 100000 }, { limite: "10" }])("recusa payload inválido/autoridade forjada: %j", async input => { expect(await chamar("buscar_demandas", input)).toHaveProperty("erro") })
  it("revalida revogação após emitir contexto", async () => {
    const ctx = humano(); await db.usuario.update({ where: { id: executor }, data: { status: "inativo" } })
    try { expect(await chamar("buscar_demandas", {}, ctx)).toHaveProperty("erro") } finally { await db.usuario.update({ where: { id: executor }, data: { status: "ativo" } }) }
  })
  it("cron não recebe custos nem campos financeiros", async () => {
    const ctx = contextoSistema(a, "vistoria")
    expect(await chamar("buscar_custos", {}, ctx)).toHaveProperty("erro")
    const m = await chamar("buscar_metricas", {}, ctx); expect(m).toHaveProperty("demandas"); expect(m).not.toHaveProperty("financeiro")
    const equipe = await chamar("buscar_videomakers", {}, ctx)
    expect(equipe.videomakers[0]).not.toHaveProperty("valorDiaria"); expect(equipe.videomakers[0]).not.toHaveProperty("custoUltimos30d")
    expect(await chamar("criar_demanda_rascunho", { titulo: "Não criar" }, ctx)).toHaveProperty("erro")
  })
  it("gestor pode consultar finanças da própria empresa", async () => {
    const r = await chamar("buscar_metricas", {}, gestor()); expect(r.financeiro.custoMes).toBe(777); expect(r.demandas.totalMes).toBe(2)
  })
  it("anexo exige escopo e mídia recebida", async () => {
    const ctx = contextoWhatsApp(a, tel, "https://example.invalid/arquivo")
    const input = { nome_arquivo: "teste", url_arquivo: "https://example.invalid/arquivo" }
    for (const demanda_id of [foreign, hidden]) expect(await chamar("vincular_arquivo_demanda", { ...input, demanda_id }, ctx)).toHaveProperty("erro")
    expect(await chamar("vincular_arquivo_demanda", { ...input, demanda_id: own, url_arquivo: "https://example.invalid/alheio" }, ctx)).toHaveProperty("erro")
    expect(await db.arquivo.count({ where: { demandaId: { in: [own,hidden,foreign] } } })).toBe(0)
    expect(await chamar("vincular_arquivo_demanda", { ...input, demanda_id: own }, ctx)).toHaveProperty("vinculado", true)
  })
  it("agenda alheia negada e própria permitida", async () => {
    expect(await chamar("buscar_agenda_videomaker", { videomaker_id: outro })).toHaveProperty("erro")
    expect(await chamar("criar_evento_agenda", { videomaker_id: outro, titulo: "Invasão", inicio: "2026-10-01T10:00:00Z" })).toHaveProperty("erro")
    expect(await chamar("buscar_agenda_videomaker", { videomaker_id: vm })).toHaveProperty("videomaker_id", vm)
    expect(await chamar("criar_evento_agenda", { videomaker_id: vm, titulo: "Próprio", inicio: "2026-10-01T10:00:00Z" })).toHaveProperty("criado", true)
    expect(await chamar("criar_evento_agenda", { videomaker_id: vm, titulo: "Forçar", inicio: "2026-10-01T10:00:00Z", forcar: true })).toHaveProperty("erro")
  })
  it("desconhecido não enumera e só responde à conversa", async () => {
    const ctx = contextoWhatsApp(a, externo)
    for (const nome of ["buscar_demandas", "buscar_metricas", "listar_gestores", "buscar_ideias", "buscar_videomakers"]) expect(await chamar(nome, {}, ctx)).toHaveProperty("erro")
    expect(await chamar("enviar_whatsapp", { telefone: telAdmin, mensagem: "Vazamento" }, ctx)).toHaveProperty("erro")
    expect(sendWhatsappMessage).not.toHaveBeenCalled()
    expect(await chamar("enviar_whatsapp", { telefone: externo, mensagem: "Resposta" }, ctx)).toHaveProperty("agendado", true)
    expect(sendWhatsappMessage).toHaveBeenCalledWith(externo, "Resposta", undefined, a)
  })
  it("rascunho externo não forja solicitante ou publica", async () => {
    const r = await chamar("criar_demanda_rascunho", { titulo: "Pedido", telefone_solicitante: telAdmin, nome_solicitante: "Externo" }, contextoWhatsApp(a, externo))
    expect(r.criado).toBe(true)
    const d = await db.demanda.findUniqueOrThrow({ where: { id: r.demanda_id } })
    expect(d.telefoneSolicitante).toBe(externo); expect(d.statusInterno).toBe("aguardando_aprovacao_interna"); expect(d.publicTokenAtivo).toBe(false)
  })
  it("cron só envia para destinatário ligado à notificação", async () => {
    const ctx = contextoSistema(a, "prazos")
    expect(await chamar("enviar_whatsapp", { telefone: externo, mensagem: "Invasão" }, ctx)).toHaveProperty("erro")
    expect(await chamar("enviar_whatsapp", { telefone: telOutro, mensagem: "Outro", demanda_id: own }, ctx)).toHaveProperty("erro")
    expect(sendWhatsappMessage).not.toHaveBeenCalled()
    expect(await chamar("enviar_whatsapp", { telefone: tel, mensagem: "Prazo", demanda_id: own }, ctx)).toHaveProperty("agendado", true)
  })
  it("mesmo sufixo em outro DDD/empresa não confunde identidade", async () => {
    const r = await comOrg(a, () => identidadeWhatsApp(a, telOutro)); expect(r.usuario).toBeNull(); expect(r.videomaker?.id).toBe(outro)
    const fora = await comOrg(b, () => identidadeWhatsApp(b, tel)); expect(fora.usuario).toBeNull(); expect(fora.videomaker).toBeNull()
  })
  it("webhook sem segredo, com segredo errado e LID solto não executa convite", async () => {
    await db.demanda.update({ where: { id: own }, data: { statusInterno: "videomaker_notificado" } })
    const enviar = (secret: string, remoteJid = `${tel}@s.whatsapp.net`) => webhook(new NextRequest("http://localhost/api/whatsapp/webhook", { method: "POST", headers: { "x-webhook-secret": secret }, body: JSON.stringify({ instance: p, event: "messages.upsert", data: { key: { id: randomUUID(), fromMe: false, remoteJid }, message: { conversation: "SIM" } } }) }))
    await enviar("errado")
    await enviar("segredo-sintetico", "12345678@lid")
    await db.configWhatsapp.update({ where: { organizacaoId: a }, data: { webhookSecret: null } })
    try { await enviar("segredo-sintetico") } finally { await db.configWhatsapp.update({ where: { organizacaoId: a }, data: { webhookSecret: "segredo-sintetico" } }) }
    await processarInbox(a)
    expect((await db.demanda.findUniqueOrThrow({ where: { id: own } })).statusInterno).toBe("videomaker_notificado")
    expect(sendWhatsappMessage).not.toHaveBeenCalled()
  })
  it("dois SIM autenticados gravam uma única transição/histórico", async () => {
    await db.demanda.update({ where: { id: own }, data: { statusInterno: "videomaker_notificado" } })
    const enviar = () => webhook(new NextRequest("http://localhost/api/whatsapp/webhook", { method: "POST", headers: { "x-webhook-secret": "segredo-sintetico" }, body: JSON.stringify({ instance: p, event: "messages.upsert", data: { key: { id: randomUUID(), fromMe: false, remoteJid: `${tel}@s.whatsapp.net` }, message: { conversation: "SIM" } } }) }))
    await Promise.all([enviar(), enviar()])
    await processarInbox(a)
    expect((await db.demanda.findUniqueOrThrow({ where: { id: own } })).statusInterno).toBe("videomaker_aceitou")
    expect(await db.historicoStatus.count({ where: { demandaId: own, statusNovo: "videomaker_aceitou" } })).toBe(1)
  })

  it("alerta não vincula demanda de outra empresa", async () => {
    const input = { tipo: "teste", mensagem: "Sintético", severidade: "aviso" }
    expect(await chamar("criar_alerta", { ...input, demanda_id: foreign }, gestor())).toHaveProperty("erro")
    expect(await db.alertaIA.count({ where: { organizacaoId: a, demandaId: foreign } })).toBe(0)
    expect(await chamar("criar_alerta", { ...input, demanda_id: own }, gestor())).toHaveProperty("criado", true)
  })
  it("número ambíguo não concede identidade interna", async () => {
    await db.usuario.update({ where: { id: admin }, data: { telefone: tel } })
    try {
      const ctx = contextoWhatsApp(a, tel)
      expect(await chamar("buscar_demandas", {}, ctx)).toHaveProperty("erro")
      expect(await chamar("buscar_metricas", {}, ctx)).toHaveProperty("erro")
    } finally { await db.usuario.update({ where: { id: admin }, data: { telefone: telAdmin } }) }
  })

  it("SIM sem código não escolhe entre dois convites pendentes", async () => {
    await db.demanda.updateMany({ where: { id: { in: [own, hidden] } }, data: { videomakerId: vm, statusInterno: "videomaker_notificado" } })
    try {
      await webhook(new NextRequest("http://localhost/api/whatsapp/webhook", { method: "POST", headers: { "x-webhook-secret": "segredo-sintetico" }, body: JSON.stringify({ instance: p, event: "messages.upsert", data: { key: { id: randomUUID(), fromMe: false, remoteJid: `${tel}@s.whatsapp.net` }, message: { conversation: "SIM" } } }) }))
      await processarInbox(a)
      expect(await db.demanda.count({ where: { id: { in: [own, hidden] }, statusInterno: "videomaker_notificado" } })).toBe(2)
    } finally { await db.demanda.update({ where: { id: hidden }, data: { videomakerId: outro, statusInterno: "pedido_criado" } }) }
  })

  it("audita mutação técnica e envio sem telefone/conteúdo", async () => {
    const r = await chamar("criar_alerta", { tipo: "prazo", mensagem: "conteudo-privado-auditoria", severidade: "info", demanda_id: own }, contextoSistema(a,"vistoria"))
    expect(r.criado).toBe(true)
    const e = await db.eventoAuditoria.findFirstOrThrow({ where: { organizacaoId: a, recursoId: r.id, acao: "ia.mutacao" } })
    expect(e.atorTipo).toBe("tecnico"); expect(e.atorId).toBe("agente.vistoria"); expect(JSON.stringify(e)).not.toContain("conteudo-privado")
    const antes = await db.eventoAuditoria.count({ where: { organizacaoId: a, acao: "ia.envio" } })
    expect(await chamar("enviar_whatsapp", { telefone: telAdmin, mensagem: "conteudo-privado-auditoria" }, gestor())).toHaveProperty("agendado",true)
    const envios = await db.eventoAuditoria.findMany({ where: { organizacaoId: a, acao: "ia.envio" }, orderBy: { createdAt: "desc" }, take: 2 })
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: a, acao: "ia.envio" } })).toBe(antes+2)
    expect(new Set(envios.map(e => e.correlationId)).size).toBe(1)
    expect(JSON.stringify(envios)).not.toContain(telAdmin); expect(JSON.stringify(envios)).not.toContain("conteudo-privado")
  })

})
