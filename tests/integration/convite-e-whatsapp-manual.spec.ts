import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import type { TipoUsuario } from "@prisma/client"

// Pedido do Giovani (11/11/2026), duas partes:
// 1. A linha "Quem vai" da gravação externa: trocar o videomaker (o convite
//    antigo vira "substituido" e quem saiu é avisado), reenviar o convite
//    (link novo) e avisar a mudança de data ou local depois do aceite.
// 2. "Enviar para um WhatsApp": o link de entrega ou de aprovação para um
//    número digitado, que não é pessoa cadastrada. A fila só aceita esse número
//    pela porta explícita do envio manual (whatsapp-outbox → destinoEnvioManual).
// Rotas reais e banco real; só a sessão e os avisos em segundo plano são simulados.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { PRESETS } from "@/lib/permissoes"
import { comOrg } from "@/lib/org-contexto"
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto"
import { emitirConvite } from "@/lib/convites"
import { EVENTO_CONVITE, EVENTO_WHATSAPP_MANUAL, STATUS_PARA_COLUNA } from "@/lib/status"
import { AUTOMACAO_ENVIO_MANUAL, criarSaida, hashTelefone, processarSaidas } from "@/lib/whatsapp-outbox"
import { PUT as editarDemanda } from "@/app/api/demandas/[id]/route"
import { POST as acaoDoConvite } from "@/app/api/demandas/[id]/convite/route"
import { POST as enviarWhatsapp } from "@/app/api/demandas/[id]/enviar-whatsapp/route"

const p = `cvwa-${randomUUID().slice(0, 8)}`, org = `${p}-org`, outra = `${p}-outra`
const pessoas = { admin: `${p}-admin`, editor: `${p}-editor`, solicitante: `${p}-solic`, videomaker: `${p}-vm-login` }
const papelDe: Record<keyof typeof pessoas, TipoUsuario> = { admin: "admin", editor: "editor", solicitante: "solicitante", videomaker: "videomaker" }
const vm1 = `${p}-vm1`, vm2 = `${p}-vm2`, vmLogin = `${p}-vm3`
const tel1 = "5541998760001", tel2 = "5541998760002"
const http = vi.mocked(fetch)

function como(quem: keyof typeof pessoas) {
  const papel = papelDe[quem]
  estado.sessao = { user: { id: pessoas[quem], organizacaoId: org, tipo: papel, papel, name: quem === "admin" ? "Giovani" : quem } }
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const put = (id: string, corpo: object) => editarDemanda(new NextRequest(`http://localhost/api/demandas/${id}`, { method: "PUT", body: JSON.stringify(corpo) }), params(id))
const convite = (id: string, acao: string) => acaoDoConvite(new NextRequest(`http://localhost/api/demandas/${id}/convite`, { method: "POST", body: JSON.stringify({ acao }) }), params(id))
const enviar = (id: string, corpo: Record<string, unknown>) => enviarWhatsapp(new NextRequest(`http://localhost/api/demandas/${id}/enviar-whatsapp`, {
  method: "POST", body: JSON.stringify({ chave: randomUUID(), ...corpo }) }), params(id))
const emitir = (demandaId: string, videomakerId: string) => comOrg(org, () => db.$transaction((tx) => emitirConvite(tx, { organizacaoId: org, usuarioId: pessoas.admin }, demandaId, videomakerId)))
const saidas = (chave: string) => db.saidaWhatsapp.findMany({ where: { organizacaoId: org, chave: { startsWith: chave } } })
const texto = (s: { conteudoCifrado: string | null }) => decryptSecret(s.conteudoCifrado!)
/** Deixa na fila só esta saída: as dos testes anteriores (1s entre envios) não entram na conta. */
async function soEsta(saidaId: string) {
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: org, NOT: { referencia: saidaId } } })
  await db.saidaWhatsapp.updateMany({ where: { organizacaoId: org, estado: "aguardando", NOT: { id: saidaId } }, data: { estado: "cancelado" } })
}

let n = 0
async function card(extra: Record<string, unknown> = {}) {
  const id = `${p}-c${++n}`
  const statusInterno = (extra.statusInterno as keyof typeof STATUS_PARA_COLUNA | undefined) ?? "videomaker_notificado"
  await db.demanda.create({ data: { id, codigo: id, organizacaoId: org, titulo: "Gravação sintética", descricao: "Teste", cidade: "Curitiba",
    departamento: "audiovisual", tipoVideo: "reels", solicitanteId: pessoas.solicitante, classificacao: "solicitacao_cobertura",
    clienteFinalNome: "Clínica Teste", ...extra, statusInterno, statusVisivel: STATUS_PARA_COLUNA[statusInterno] } })
  return id
}

beforeAll(async () => {
  vi.stubEnv("NEXTAUTH_URL", "https://nuflow.test")
  vi.stubEnv("EMAIL_ENCRYPTION_KEY", "chave-sintetica-convite-whatsapp")
  vi.stubEnv("WHATSAPP_EVOLUTION_CONTRATO", "2.3.7")
  await db.organizacao.createMany({ data: [org, outra].map((id) => ({ id, nome: id, slug: id })) })
  for (const [quem, id] of Object.entries(pessoas) as [keyof typeof pessoas, string][]) {
    const papel = papelDe[quem]
    await db.usuario.create({ data: { id, nome: quem, email: `${id}@exemplo.test`, tipo: papel, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: id, organizacaoId: org, papel, areas: ["audiovisual"] } })
    if (papel !== "admin") await db.permissaoUsuario.create({ data: { usuarioId: id, organizacaoId: org, ...PRESETS[papel] } })
  }
  for (const [id, nome, telefone, usuarioId] of [[vm1, "Ana Antiga", tel1, null], [vm2, "Bruno Novo", tel2, null], [vmLogin, "Caio", null, pessoas.videomaker]] as const) {
    await db.videomaker.create({ data: { id, nome, telefone, usuarioId, redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
    await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: id, tipoContrato: "externo", valorDiaria: 500 } })
  }
  await db.configWhatsapp.create({ data: { organizacaoId: org, instanceId: `${p}-inst`, instanceUrl: "https://example.invalid", apiKey: "api-nao-expor", ativo: true, webhookSecret: encryptSecret("segredo") } })
})

beforeEach(() => {
  estado.sessao = null
  http.mockReset(); http.mockResolvedValue(Response.json({ key: { id: randomUUID() } }))
})

afterAll(async () => {
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: { in: [org, outra] } } })
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: { in: [org, outra] } } })
  await db.demanda.deleteMany({ where: { organizacaoId: { in: [org, outra] } } })
  await db.videomakerOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: { in: [vm1, vm2, vmLogin] } } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.deleteMany({ where: { id: { in: [org, outra] } } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  vi.unstubAllEnvs()
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("Quem vai: trocar o videomaker", () => {
  it("o convite antigo vira substituído, o novo recebe o convite e quem saiu é avisado", async () => {
    const id = await card({ videomakerId: vm1 })
    const antigo = await emitir(id, vm1)
    como("admin")
    expect((await put(id, { videomakerId: vm2 })).status).toBe(200)
    expect((await db.conviteVideomaker.findUniqueOrThrow({ where: { id: antigo.id } })).status).toBe("substituido")
    const novo = await db.conviteVideomaker.findFirstOrThrow({ where: { demandaId: id, videomakerId: vm2 } })
    expect(novo.status).toBe("pendente")
    expect(await saidas(`convite:${novo.id}`)).toHaveLength(1)
    const aviso = await saidas(`convite-substituido:${antigo.id}`)
    expect(aviso).toHaveLength(1)
    expect(aviso[0].telefoneHash).toBe(hashTelefone(tel1))
    expect(texto(aviso[0])).toContain("passou para outro videomaker")
  })

  it("funciona depois do aceite: o aceito de quem saiu também vira substituído", async () => {
    const id = await card({ videomakerId: vm1, statusInterno: "captacao_agendada" })
    const aceito = await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vm1, status: "aceito", respondidoEm: new Date(), expiresAt: new Date(Date.now() + 3600_000) } })
    como("admin")
    expect((await put(id, { videomakerId: vm2 })).status).toBe(200)
    expect((await db.conviteVideomaker.findUniqueOrThrow({ where: { id: aceito.id } })).status).toBe("substituido")
    expect(await db.demanda.findUniqueOrThrow({ where: { id } })).toMatchObject({ videomakerId: vm2, statusInterno: "videomaker_notificado" })
    expect(await saidas(`convite-substituido:${aceito.id}`)).toHaveLength(1)
  })

  it("tirar o videomaker sem pôr outro (o Recusou) não avisa ninguém", async () => {
    const id = await card({ videomakerId: vm1 })
    const c = await emitir(id, vm1)
    como("admin")
    expect((await put(id, { videomakerId: null })).status).toBe(200)
    expect((await db.conviteVideomaker.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("substituido")
    expect(await saidas(`convite-substituido:${c.id}`)).toHaveLength(0)
  })

  it("quem não é gestão não troca", async () => {
    const id = await card({ videomakerId: vm1 })
    como("editor")
    expect((await put(id, { videomakerId: vm2 })).status).toBe(403)
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).videomakerId).toBe(vm1)
  })
})

describe("Quem vai: reenviar o convite", () => {
  it("o vencido gera link novo, de 48h, com WhatsApp novo, e fica no histórico", async () => {
    const id = await card({ videomakerId: vm1 })
    const vencido = await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vm1, expiresAt: new Date(Date.now() - 1000) } })
    como("admin")
    const r = await convite(id, "reenviar")
    expect(r.status).toBe(200)
    expect((await db.conviteVideomaker.findUniqueOrThrow({ where: { id: vencido.id } })).status).toBe("substituido")
    const novo = await db.conviteVideomaker.findFirstOrThrow({ where: { demandaId: id, status: "pendente" } })
    expect(novo.token).not.toBe(vencido.token)
    expect(novo.expiresAt.getTime() - Date.now()).toBeGreaterThan(47 * 3600_000)
    const s = await saidas(`convite:${novo.id}`)
    expect(s).toHaveLength(1)
    expect(texto(s[0])).toContain(`/convite/${novo.token}`)
    expect(await db.historicoStatus.count({ where: { demandaId: id, statusNovo: EVENTO_CONVITE } })).toBe(1)
  })

  it("o pendente ainda no prazo também é trocado por um novo (a pessoa não recebeu)", async () => {
    const id = await card({ videomakerId: vm1 })
    const c = await emitir(id, vm1)
    como("admin")
    expect((await convite(id, "reenviar")).status).toBe(200)
    expect((await db.conviteVideomaker.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("substituido")
    expect(await db.conviteVideomaker.count({ where: { demandaId: id, status: "pendente" } })).toBe(1)
  })

  it("com o convite aceito, não reenvia (409)", async () => {
    const id = await card({ videomakerId: vm1 })
    await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vm1, status: "aceito", respondidoEm: new Date(), expiresAt: new Date(Date.now() + 3600_000) } })
    como("admin")
    const r = await convite(id, "reenviar")
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/Avisar mudança/)
  })

  it("sem WhatsApp válido do videomaker, diz o motivo e não mexe no convite", async () => {
    const id = await card({ videomakerId: vmLogin })
    const c = await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vmLogin, expiresAt: new Date(Date.now() - 1000) } })
    como("admin")
    const r = await convite(id, "reenviar")
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/WhatsApp válido/)
    expect((await db.conviteVideomaker.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("pendente")
  })

  it("quem não é gestão não reenvia, e o card de outra empresa não existe", async () => {
    const id = await card({ videomakerId: vm1 })
    como("editor")
    expect((await convite(id, "reenviar")).status).toBe(403)
    como("solicitante")
    expect((await convite(id, "reenviar")).status).toBe(403)
    await db.demanda.create({ data: { id: `${p}-fora`, codigo: `${p}-fora`, organizacaoId: outra, titulo: "x", descricao: "x", cidade: "x",
      departamento: "audiovisual", tipoVideo: "reels", solicitanteId: pessoas.admin, statusInterno: "videomaker_notificado", videomakerId: vm1 } })
    como("admin")
    expect((await convite(`${p}-fora`, "reenviar")).status).toBe(404)
    expect(await db.saidaWhatsapp.count({ where: { organizacaoId: org, referencia: { startsWith: p } } })).toBe(0)
  })
})

describe("Quem vai: a mensagem do convite que perdeu a validade sai da fila", () => {
  // Revisão do PR #137: reenviar ou trocar invalidava o token, mas a mensagem
  // antiga, ainda aguardando ou em falha (reenviável), entregava um link morto.
  it("reenviar cancela a saída antiga (aguardando ou em falha) e deixa só a nova", async () => {
    const id = await card({ videomakerId: vm1 })
    const c = await emitir(id, vm1)
    const [antiga] = await saidas(`convite:${c.id}`)
    expect(antiga.estado).toBe("aguardando")
    como("admin")
    expect((await convite(id, "reenviar")).status).toBe(200)
    expect(await db.saidaWhatsapp.findUniqueOrThrow({ where: { id: antiga.id } })).toMatchObject({ estado: "cancelado", motivo: "convite_substituido", revisao: antiga.revisao + 1 })
    const novo = await db.conviteVideomaker.findFirstOrThrow({ where: { demandaId: id, status: "pendente" } })
    // Uma em falha (o operador poderia reenviar) também sai.
    const [nova] = await saidas(`convite:${novo.id}`)
    expect(nova.estado).toBe("aguardando")
    await db.saidaWhatsapp.update({ where: { id: nova.id }, data: { estado: "falhou", motivo: "http_500" } })
    expect((await convite(id, "reenviar")).status).toBe(200)
    expect((await db.saidaWhatsapp.findUniqueOrThrow({ where: { id: nova.id } })).estado).toBe("cancelado")
    // O que já foi para a rede não se desfaz.
    const terceiro = await db.conviteVideomaker.findFirstOrThrow({ where: { demandaId: id, status: "pendente" } })
    const [ida] = await saidas(`convite:${terceiro.id}`)
    await db.saidaWhatsapp.update({ where: { id: ida.id }, data: { estado: "desconhecido" } })
    expect((await convite(id, "reenviar")).status).toBe(200)
    expect((await db.saidaWhatsapp.findUniqueOrThrow({ where: { id: ida.id } })).estado).toBe("desconhecido")
  })

  it("a fila não manda a mensagem cancelada, mesmo com o job já agendado", async () => {
    const id = await card({ videomakerId: vm1 })
    const c = await emitir(id, vm1)
    como("admin")
    expect((await convite(id, "reenviar")).status).toBe(200)
    const [antiga] = await saidas(`convite:${c.id}`)
    await db.jobAutomacao.deleteMany({ where: { organizacaoId: org, NOT: { referencia: antiga.id } } })
    await processarSaidas(org)
    expect(http).not.toHaveBeenCalled()
    expect((await db.saidaWhatsapp.findUniqueOrThrow({ where: { id: antiga.id } })).estado).toBe("cancelado")
  })

  it("trocar cancela o convite e o aviso de mudança ainda na fila de quem saiu", async () => {
    const id = await card({ videomakerId: vm1, statusInterno: "captacao_agendada", localGravacao: "Rua A, 10" })
    await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vm1, status: "aceito", respondidoEm: new Date(), expiresAt: new Date(Date.now() + 3600_000) } })
    como("admin")
    expect((await convite(id, "avisar-mudanca")).status).toBe(200)
    const [mudanca] = await saidas(`convite-mudanca:${id}:`)
    expect((await put(id, { videomakerId: vm2 })).status).toBe(200)
    expect(await db.saidaWhatsapp.findUniqueOrThrow({ where: { id: mudanca.id } })).toMatchObject({ estado: "cancelado", motivo: "convite_substituido" })
    const novo = await db.conviteVideomaker.findFirstOrThrow({ where: { demandaId: id, videomakerId: vm2 } })
    expect((await saidas(`convite:${novo.id}`))[0].estado).toBe("aguardando")
  })
})

describe("Quem vai: avisar mudança", () => {
  it("manda a data e o local de agora uma vez por conteúdo; mudou de novo, sai de novo", async () => {
    const id = await card({ videomakerId: vm1, statusInterno: "captacao_agendada",
      localGravacao: "Rua A, 10", dataCaptacao: new Date("2026-11-20T17:00:00Z") })
    const aceito = await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vm1, status: "aceito", respondidoEm: new Date(), expiresAt: new Date(Date.now() + 3600_000) } })
    como("admin")
    expect((await convite(id, "avisar-mudanca")).status).toBe(200)
    const [primeira] = await saidas(`convite-mudanca:${id}:`)
    expect(texto(primeira)).toContain("Rua A, 10")
    expect(texto(primeira)).toContain("14:00")
    expect(texto(primeira)).toContain(`/convite/${aceito.token}`)
    expect((await convite(id, "avisar-mudanca")).status).toBe(409)
    await db.demanda.update({ where: { id }, data: { localGravacao: "Rua B, 20" } })
    expect((await convite(id, "avisar-mudanca")).status).toBe(200)
    expect(await saidas(`convite-mudanca:${id}:`)).toHaveLength(2)
    expect(await db.historicoStatus.count({ where: { demandaId: id, statusNovo: EVENTO_CONVITE } })).toBe(2)
  })

  it("antes do aceite não há o que avisar", async () => {
    const id = await card({ videomakerId: vm1 })
    como("admin")
    expect((await convite(id, "avisar-mudanca")).status).toBe(409)
  })
})

describe("Enviar para um WhatsApp", () => {
  it("a gestão manda o link do vídeo a um número de fora; registro, fila, histórico e o número salvo no card", async () => {
    const id = await card({ statusInterno: "aprovado", videomakerId: vm1, linkFinal: "https://drive.test/final.mp4" })
    como("admin")
    const r = await enviar(id, { link: "entrega", telefone: "(41) 99876-5432", nome: "Maria Souza", salvarNoCard: true })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, para: "(41) 99876-5432", nome: "Maria Souza", salvouNoCard: true })
    const d = await db.demanda.findUniqueOrThrow({ where: { id } })
    expect(d).toMatchObject({ clienteFinalTelefone: "5541998765432", clienteFinalNome: "Clínica Teste", publicTokenAtivo: true })
    const log = await db.logAutomacao.findFirstOrThrow({ where: { demandaId: id, automacao: AUTOMACAO_ENVIO_MANUAL } })
    const [s] = await db.saidaWhatsapp.findMany({ where: { organizacaoId: org, referencia: log.id } })
    expect(s).toMatchObject({ destinatarioTipo: "envio_manual", destinatarioId: log.id, telefoneHash: hashTelefone("5541998765432"), origem: "manual" })
    expect(texto(s)).toContain(`https://nuflow.test/d/${d.publicToken}`)
    expect(texto(s)).toContain("Olá, Maria!")
    const h = await db.historicoStatus.findFirstOrThrow({ where: { demandaId: id, statusNovo: EVENTO_WHATSAPP_MANUAL } })
    expect(h.observacao).toBe("Link do vídeo enviado pelo WhatsApp para Maria Souza · (41) 99876-5432 · por Giovani")
    // A fila manda de verdade para o número externo.
    await soEsta(s.id)
    await processarSaidas(org)
    expect(http).toHaveBeenCalledTimes(1)
    expect((await db.saidaWhatsapp.findUniqueOrThrow({ where: { id: s.id } })).estado).toBe("aceito")
    // Um segundo envio com "salvar" não troca o número que já está no card.
    expect((await enviar(id, { link: "entrega", telefone: "(11) 91234-5678", salvarNoCard: true })).status).toBe(200)
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).clienteFinalTelefone).toBe("5541998765432")
  })

  it("aprovação: sem link pendente, 409; com ele, manda o /aprovar e salva só o número de quem pediu", async () => {
    const id = await card({ statusInterno: "revisao_pendente", classificacao: null })
    como("admin")
    expect((await enviar(id, { link: "aprovacao", telefone: "21 98765-4321" })).status).toBe(409)
    const a = await db.aprovacaoVideo.create({ data: { demandaId: id, urlVideo: "https://drive.test/v.mp4", expiresAt: new Date(Date.now() + 5 * 86400_000) } })
    const r = await enviar(id, { link: "aprovacao", telefone: "21 98765-4321", nome: "Carla", salvarNoCard: true })
    expect(r.status).toBe(200)
    const log = await db.logAutomacao.findFirstOrThrow({ where: { demandaId: id, automacao: AUTOMACAO_ENVIO_MANUAL } })
    const [s] = await db.saidaWhatsapp.findMany({ where: { organizacaoId: org, referencia: log.id } })
    expect(texto(s)).toContain(`https://nuflow.test/aprovar/${a.token}`)
    expect(await db.demanda.findUniqueOrThrow({ where: { id } })).toMatchObject({ telefoneSolicitante: "5521987654321", nomeSolicitante: null })
  })

  it("número inválido é recusado com a frase do erro e nada entra na fila", async () => {
    const id = await card({ statusInterno: "aprovado", linkFinal: "https://drive.test/final.mp4" })
    como("admin")
    const r = await enviar(id, { link: "entrega", telefone: "(20) 99876-5432" })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/DDD/)
    expect(await db.logAutomacao.count({ where: { demandaId: id } })).toBe(0)
  })

  it("quem não pode mexer no card não manda: o solicitante leva 403, o videomaker de fora 404", async () => {
    const id = await card({ statusInterno: "aprovado", linkFinal: "https://drive.test/final.mp4" })
    como("solicitante")
    expect((await enviar(id, { link: "entrega", telefone: "(41) 99876-5432" })).status).toBe(403)
    como("videomaker")
    expect((await enviar(id, { link: "entrega", telefone: "(41) 99876-5432" })).status).toBe(404)
    estado.sessao = null
    expect((await enviar(id, { link: "entrega", telefone: "(41) 99876-5432" })).status).toBe(401)
    expect(await db.logAutomacao.count({ where: { demandaId: id } })).toBe(0)
  })

  it("sem vídeo final não há link de entrega", async () => {
    const id = await card({ statusInterno: "aprovado" })
    como("admin")
    expect((await enviar(id, { link: "entrega", telefone: "(41) 99876-5432" })).status).toBe(409)
  })

  it("passa de 20 envios por card em 24h, 429", async () => {
    const id = await card({ statusInterno: "aprovado", linkFinal: "https://drive.test/final.mp4" })
    await db.logAutomacao.createMany({ data: Array.from({ length: 20 }, () => ({ demandaId: id, automacao: AUTOMACAO_ENVIO_MANUAL, outputJson: {} })) })
    como("admin")
    expect((await enviar(id, { link: "entrega", telefone: "(41) 99876-5432" })).status).toBe(429)
  })

  it("a porta da fila não abre com autorização forjada: outra empresa, outro número ou registro velho", async () => {
    const id = await card({ statusInterno: "aprovado" })
    const telefone = "5541998765432"
    const fora = await db.demanda.create({ data: { id: `${p}-fora2`, codigo: `${p}-fora2`, organizacaoId: outra, titulo: "x", descricao: "x", cidade: "x",
      departamento: "audiovisual", tipoVideo: "reels", solicitanteId: pessoas.admin } })
    const logDeFora = await db.logAutomacao.create({ data: { demandaId: fora.id, automacao: AUTOMACAO_ENVIO_MANUAL, outputJson: { telefoneHash: hashTelefone(telefone) } } })
    const outroNumero = await db.logAutomacao.create({ data: { demandaId: id, automacao: AUTOMACAO_ENVIO_MANUAL, outputJson: { telefoneHash: hashTelefone("5511912345678") } } })
    const velho = await db.logAutomacao.create({ data: { demandaId: id, automacao: AUTOMACAO_ENVIO_MANUAL, outputJson: { telefoneHash: hashTelefone(telefone) }, createdAt: new Date(Date.now() - 25 * 3600_000) } })
    const outraAutomacao = await db.logAutomacao.create({ data: { demandaId: id, automacao: "link_publico_gerado", outputJson: { telefoneHash: hashTelefone(telefone) } } })
    for (const envioManual of [logDeFora.id, outroNumero.id, velho.id, outraAutomacao.id]) {
      await expect(comOrg(org, () => db.$transaction((tx) => criarSaida(tx, { organizacaoId: org, origem: "manual", envioManual, referencia: envioManual,
        chave: `forjado:${randomUUID()}`, telefone, texto: "x", expiraEm: new Date(Date.now() + 3600_000) })))).rejects.toThrow("Destinatário não autorizado")
    }
    // E só pela origem manual.
    const valido = await db.logAutomacao.create({ data: { demandaId: id, automacao: AUTOMACAO_ENVIO_MANUAL, outputJson: { telefoneHash: hashTelefone(telefone) } } })
    await expect(comOrg(org, () => db.$transaction((tx) => criarSaida(tx, { organizacaoId: org, origem: "legado", envioManual: valido.id, referencia: valido.id,
      chave: `forjado:${randomUUID()}`, telefone, texto: "x", expiraEm: new Date(Date.now() + 3600_000) })))).rejects.toThrow()
  })

  it("na hora de mandar, a fila confere de novo: autorização vencida cancela sem chamar o WhatsApp", async () => {
    const id = await card({ statusInterno: "aprovado", linkFinal: "https://drive.test/final.mp4" })
    como("admin")
    expect((await enviar(id, { link: "entrega", telefone: "(41) 99876-5432" })).status).toBe(200)
    const log = await db.logAutomacao.findFirstOrThrow({ where: { demandaId: id, automacao: AUTOMACAO_ENVIO_MANUAL } })
    await db.logAutomacao.update({ where: { id: log.id }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } })
    await soEsta((await db.saidaWhatsapp.findFirstOrThrow({ where: { organizacaoId: org, referencia: log.id } })).id)
    await processarSaidas(org)
    expect(http).not.toHaveBeenCalled()
    expect(await db.saidaWhatsapp.findFirstOrThrow({ where: { organizacaoId: org, referencia: log.id } })).toMatchObject({ estado: "cancelado", motivo: "destinatario_alterado" })
  })
})
