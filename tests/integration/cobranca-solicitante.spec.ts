import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import type { StatusInterno, TipoUsuario } from "@prisma/client"

// Cobrança diária a quem pediu (Giovani, 25/11/2026): a rotina "cobranca" cobra
// uma vez por dia quem pediu, até aprovar (Aprovação) ou marcar como postado
// (Para Postar); da 2ª vez em diante com a arte de brincadeira; o link "foi
// postado" confirma sem login; a ficha cobra na hora e manda a outro número.
// Rotas reais e banco real; só a sessão e os avisos em segundo plano são simulados.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))
// O desenho (next/og) tem teste próprio em tests/unit; aqui o fetch é falso e o
// next/og depende dele para carregar o WASM. Guarda a família pedida.
const { desenhar } = vi.hoisted(() => ({ desenhar: vi.fn(async (familia: string) => ({ base64: "iVBORw0KGgo=", mimetype: "image/png", nomeArquivo: `nuflow-${familia}.png` })) }))
vi.mock("@/lib/avisos-arte-imagem", () => ({ imagemDoAviso: desenhar }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { PRESETS } from "@/lib/permissoes"
import { comOrg } from "@/lib/org-contexto"
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { executarRotina } from "@/lib/automacoes-regras"
import { contextoRegraValido, type ContextoRegra } from "@/lib/regras-operacionais"
import { MOTIVO_DESLIGADO, processarSaidas } from "@/lib/whatsapp-outbox"
import { POST as cobrarAgora } from "@/app/api/demandas/[id]/cobrar-solicitante/route"
import { POST as enviarWhatsapp } from "@/app/api/demandas/[id]/enviar-whatsapp/route"
import { GET as lerPostado, POST as confirmarPostado } from "@/app/api/publico/postagem/[token]/route"

const p = `cobsol-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = { admin: `${p}-admin`, solicitante: `${p}-solic`, outro: `${p}-outro` }
const papelDe: Record<keyof typeof pessoas, TipoUsuario> = { admin: "admin", solicitante: "solicitante", outro: "solicitante" }
const telSolicitante = "5541998770001", telOutro = "5541998770002", telDigitado = "5541998770099"
const http = vi.mocked(fetch)
const QUARTA = new Date("2026-11-25T12:00:00Z"), QUINTA = new Date("2026-11-26T12:00:00Z"), SABADO = new Date("2026-11-28T12:00:00Z")

function como(quem: keyof typeof pessoas) {
  const papel = papelDe[quem]
  estado.sessao = { user: { id: pessoas[quem], organizacaoId: org, tipo: papel, papel, name: quem } }
}
const params = <T extends string>(k: T, v: string) => ({ params: Promise.resolve({ [k]: v } as Record<T, string>) })
const cobrar = (id: string) => cobrarAgora(new NextRequest(`http://localhost/api/demandas/${id}/cobrar-solicitante`, { method: "POST" }), params("id", id))
const enviar = (id: string, corpo: Record<string, unknown>) => enviarWhatsapp(new NextRequest(`http://localhost/api/demandas/${id}/enviar-whatsapp`, {
  method: "POST", body: JSON.stringify({ chave: randomUUID(), ...corpo }) }), params("id", id))
const postadoGet = (token: string) => lerPostado(new NextRequest(`http://localhost/api/publico/postagem/${token}`), params("token", token))
const postadoPost = (token: string, corpo: object) => confirmarPostado(new NextRequest(`http://localhost/api/publico/postagem/${token}`, {
  method: "POST", body: JSON.stringify(corpo) }), params("token", token))
const saidasDo = (id: string) => db.saidaWhatsapp.findMany({ where: { organizacaoId: org, referencia: id, origem: "regra" }, orderBy: { createdAt: "asc" } })
const texto = (s: { conteudoCifrado: string | null }) => decryptSecret(s.conteudoCifrado!)
const ligar = (ativo: boolean) => db.moduloOrganizacao.upsert({
  where: { organizacaoId_modulo: { organizacaoId: org, modulo: "cobranca" } }, update: { ativo }, create: { organizacaoId: org, modulo: "cobranca", ativo } })

let n = 0
async function card(statusInterno: StatusInterno, extra: Record<string, unknown> = {}) {
  const id = `${p}-c${++n}`
  await db.demanda.create({ data: { id, codigo: `VOP-${n}`, organizacaoId: org, titulo: `Vídeo ${n}`, descricao: "Teste", cidade: "Curitiba",
    departamento: "growth", tipoVideo: "reels", solicitanteId: pessoas.solicitante, nomeSolicitante: "Ana Souza", ...extra,
    statusInterno, statusVisivel: STATUS_PARA_COLUNA[statusInterno] } })
  return id
}
/** Só as demandas deste teste andam na rotina: as dos testes anteriores saem da coluna. */
async function soEstes(...ids: string[]) {
  await db.demanda.updateMany({ where: { organizacaoId: org, id: { notIn: ids } }, data: { statusInterno: "encerrado", statusVisivel: "finalizado" } })
}

beforeAll(async () => {
  vi.stubEnv("NEXTAUTH_URL", "https://nuflow.test")
  vi.stubEnv("EMAIL_ENCRYPTION_KEY", "chave-sintetica-cobranca-solicitante")
  vi.stubEnv("WHATSAPP_EVOLUTION_CONTRATO", "2.3.7")
  vi.stubEnv("COBRANCA_SOLICITANTE", "")
  await db.organizacao.create({ data: { id: org, nome: org, slug: org } })
  for (const [quem, id] of Object.entries(pessoas) as [keyof typeof pessoas, string][]) {
    const papel = papelDe[quem]
    const telefone = quem === "solicitante" ? telSolicitante : quem === "outro" ? telOutro : null
    await db.usuario.create({ data: { id, nome: quem === "solicitante" ? "Ana Souza" : quem, email: `${id}@exemplo.test`, tipo: papel, senhaHash: "sem-login", telefone } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: id, organizacaoId: org, papel, areas: ["audiovisual"] } })
    if (papel !== "admin") await db.permissaoUsuario.create({ data: { usuarioId: id, organizacaoId: org, ...PRESETS[papel] } })
  }
  await db.configWhatsapp.create({ data: { organizacaoId: org, instanceId: `${p}-inst`, instanceUrl: "https://example.invalid", apiKey: "api-nao-expor", ativo: true, webhookSecret: encryptSecret("segredo") } })
})

beforeEach(() => {
  estado.sessao = null
  http.mockReset(); http.mockResolvedValue(Response.json({ key: { id: randomUUID() } }))
  vi.useFakeTimers({ toFake: ["Date"], now: QUARTA })
})
afterEach(() => { vi.useRealTimers() })

afterAll(async () => {
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: org } })
  await db.agenteExecucao.deleteMany({ where: { organizacaoId: org } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.preferenciaAviso.deleteMany({ where: { organizacaoId: org } })
  await db.moduloOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.deleteMany({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  vi.unstubAllEnvs()
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("rotina diária", () => {
  it("nasce desligada: sem o módulo, ninguém é cobrado", async () => {
    const id = await card("revisao_pendente")
    await soEstes(id)
    await executarRotina(org, "cobranca")
    expect(await saidasDo(id)).toHaveLength(0)
  })

  it("Aprovação: cobra uma vez por dia, com o link de aprovação; da 2ª vez com a arte", async () => {
    await ligar(true)
    const id = await card("revisao_pendente")
    await soEstes(id)
    await db.aprovacaoVideo.create({ data: { token: `${p}-aprov`, demandaId: id, urlVideo: "https://x.test/v.mp4", nomeVideo: "v", status: "pendente", expiresAt: new Date(QUARTA.getTime() + 30 * 86400_000) } })
    const antes = await db.demanda.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })

    await executarRotina(org, "cobranca")
    await executarRotina(org, "cobranca") // mesmo dia: não repete
    let s = await saidasDo(id)
    expect(s).toHaveLength(1)
    expect(s[0].destinatarioTipo).toBe("usuario")
    expect(s[0].regraContexto).toMatchObject({ tipo: "solicitante", id, regra: "cobranca_aprovacao", revisao: "2026-11-25:1" })
    expect((s[0].regraContexto as { arte?: string }).arte).toBeUndefined()
    expect(texto(s[0])).toContain(`https://nuflow.test/aprovar/${p}-aprov`)
    expect(texto(s[0])).toContain("Olá, Ana!")
    const d = await db.demanda.findUniqueOrThrow({ where: { id } })
    expect([d.cobrancasSolicitante, d.cobrancaSolicitanteEtapa]).toEqual([1, "aprovar"])
    // A cobrança não conta como movimentação do card.
    expect(d.updatedAt).toEqual(antes.updatedAt)

    vi.setSystemTime(QUINTA)
    await executarRotina(org, "cobranca")
    s = await saidasDo(id)
    expect(s).toHaveLength(2)
    expect(s[1].regraContexto).toMatchObject({ revisao: "2026-11-26:2", arte: "videospc_aprovar" })
    expect(texto(s[1])).toContain("Lembrete nº 2")
  })

  it("fim de semana não cobra", async () => {
    await ligar(true)
    const id = await card("revisao_pendente")
    await soEstes(id)
    vi.setSystemTime(SABADO)
    await executarRotina(org, "cobranca")
    expect(await saidasDo(id)).toHaveLength(0)
  })

  it("para quando o card sai da coluna, e não cobra ajuste nem gravação externa", async () => {
    await ligar(true)
    const id = await card("edicao_finalizada")
    const ajuste = await card("ajuste_solicitado")
    const externa = await card("revisao_pendente", { tipoGravacao: "conteudo" })
    await soEstes(id, ajuste, externa)
    await executarRotina(org, "cobranca")
    expect(await saidasDo(ajuste)).toHaveLength(0)
    expect(await saidasDo(externa)).toHaveLength(0)
    const [s] = await saidasDo(id)
    const c = s.regraContexto as ContextoRegra
    expect(await comOrg(org, () => db.$transaction((tx) => contextoRegraValido(tx, org, c, new Date())))).toBe(true)
    await db.demanda.update({ where: { id }, data: { statusInterno: "aprovado", statusVisivel: "para_postar" } })
    expect(await comOrg(org, () => db.$transaction((tx) => contextoRegraValido(tx, org, c, new Date())))).toBe(false)
    // Desligar a empresa também segura o que já estava na fila.
    await db.demanda.update({ where: { id }, data: { statusInterno: "edicao_finalizada", statusVisivel: "aprovacao" } })
    await ligar(false)
    expect(await comOrg(org, () => db.$transaction((tx) => contextoRegraValido(tx, org, c, new Date())))).toBe(false)
    await ligar(true)
  })

  it("a chave de ambiente desliga tudo ou restringe a números de teste", async () => {
    await ligar(true)
    const id = await card("aprovado")
    await soEstes(id)
    vi.stubEnv("COBRANCA_SOLICITANTE", "desligado")
    await executarRotina(org, "cobranca")
    expect(await saidasDo(id)).toHaveLength(0)
    vi.stubEnv("COBRANCA_SOLICITANTE", "teste:41 99877-0002")
    await executarRotina(org, "cobranca")
    expect(await saidasDo(id)).toHaveLength(0) // o número de quem pediu não está na lista
    vi.stubEnv("COBRANCA_SOLICITANTE", `teste:${telSolicitante}`)
    await executarRotina(org, "cobranca")
    expect(await saidasDo(id)).toHaveLength(1)
    vi.stubEnv("COBRANCA_SOLICITANTE", "")
  })

  it("respeita a preferência de quem pediu: desligou Prazos e cobranças, não sai nem conta", async () => {
    await ligar(true)
    const id = await card("revisao_pendente")
    await soEstes(id)
    await db.preferenciaAviso.create({ data: { organizacaoId: org, usuarioId: pessoas.solicitante, categoria: "prazos", whatsapp: false } })
    await executarRotina(org, "cobranca")
    const s = await saidasDo(id)
    expect(s.map((x) => [x.estado, x.motivo])).toEqual([["cancelado", MOTIVO_DESLIGADO]])
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).cobrancasSolicitante).toBe(0)
    await db.preferenciaAviso.deleteMany({ where: { organizacaoId: org } })
  })
})

describe("Para Postar: o link “foi postado”", () => {
  it("vai na cobrança, confirma sem login, finaliza o card e vale uma vez só", async () => {
    await ligar(true)
    const id = await card("postagem_pendente", { area: "design" })
    await soEstes(id)
    await executarRotina(org, "cobranca")
    const [s] = await saidasDo(id)
    const d = await db.demanda.findUniqueOrThrow({ where: { id } })
    expect(d.postagemToken).toBeTruthy()
    expect(d.postagemTokenExpiraEm!.getTime()).toBeGreaterThan(QUARTA.getTime() + 13 * 86400_000)
    expect(texto(s)).toContain(`https://nuflow.test/postado/${d.postagemToken}`)
    expect(texto(s)).toContain("A arte de")

    const lido = await postadoGet(d.postagemToken!)
    expect(lido.status).toBe(200)
    expect(await lido.json()).toMatchObject({ codigo: d.codigo, esperando: true, ehArte: true, nome: "Ana" })
    expect((await postadoGet("token-que-nao-existe")).status).toBe(404)

    const r = await postadoPost(d.postagemToken!, { tipo: "reels", link: "https://instagram.com/p/abc" })
    expect(r.status).toBe(200)
    const depois = await db.demanda.findUniqueOrThrow({ where: { id } })
    expect([depois.statusInterno, depois.statusVisivel, depois.postagemTipo, depois.linkPostagem]).toEqual(["postado", "finalizado", "reels", "https://instagram.com/p/abc"])
    expect(depois.dataPostagem).toBeTruthy()
    expect(depois.postagemToken).toBeNull()
    const h = await db.historicoStatus.findFirst({ where: { demandaId: id, statusNovo: "postado" } })
    expect(h?.observacao).toContain("pelo link da cobrança")
    expect((await postadoPost(d.postagemToken!, {})).status).toBe(404)
  })

  it("link vencido ou card fora de Para Postar não confirma", async () => {
    const vencido = await card("aprovado", { postagemToken: `${p}-venc`, postagemTokenExpiraEm: new Date(QUARTA.getTime() - 1000) })
    expect((await postadoPost(`${p}-venc`, {})).status).toBe(404)
    const fora = await card("revisao_pendente", { postagemToken: `${p}-fora`, postagemTokenExpiraEm: new Date(QUARTA.getTime() + 86400_000) })
    expect((await postadoPost(`${p}-fora`, {})).status).toBe(409)
    expect((await db.demanda.findUniqueOrThrow({ where: { id: fora } })).statusInterno).toBe("revisao_pendente")
    expect((await db.demanda.findUniqueOrThrow({ where: { id: vencido } })).statusInterno).toBe("aprovado")
    expect((await postadoPost(`${p}-fora`, { link: "javascript:alert(1)" })).status).toBe(400)
  })
})

describe("ficha do card", () => {
  it("Cobrar agora conta a vez e não deixa repetir em seguida; quem não pode, não cobra", async () => {
    await ligar(true)
    const id = await card("revisao_pendente")
    como("outro")
    expect((await cobrar(id)).status).toBe(404) // fora do escopo dela
    como("admin")
    const r = await cobrar(id)
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, vez: 1, etapa: "aprovar" })
    expect((await cobrar(id)).status).toBe(429)
    vi.setSystemTime(new Date(QUARTA.getTime() + 11 * 60_000))
    expect(await (await cobrar(id)).json()).toMatchObject({ vez: 2 })
    const s = await saidasDo(id)
    expect(s).toHaveLength(2)
    expect((s[1].regraContexto as { arte?: string }).arte).toBe("videospc_aprovar")
    // Sem link de aprovação, o card no NuFlow.
    expect(texto(s[0])).toContain(`https://nuflow.test/demandas/${id}`)
  })

  it("Cobrar agora com a cobrança desligada ou fora da etapa explica o porquê", async () => {
    const id = await card("editando")
    como("admin")
    await ligar(true)
    expect(await (await cobrar(id)).json()).toMatchObject({ motivo: "fora_da_etapa" })
    await ligar(false)
    const outro = await card("revisao_pendente")
    expect(await (await cobrar(outro)).json()).toMatchObject({ motivo: "desligada" })
  })

  it("Mandar para outro número: a cobrança com a arte, para o número digitado", async () => {
    await ligar(false) // o envio à mão não depende da rotina ligada
    const id = await card("aprovado")
    como("admin")
    const r = await enviar(id, { link: "cobranca", telefone: "(41) 99877-0099", nome: "Chefe da Ana" })
    expect(r.status).toBe(200)
    const s = await db.saidaWhatsapp.findMany({ where: { organizacaoId: org, destinatarioTipo: "envio_manual", chave: { startsWith: "arte:videospc_postar:envio-manual:" } } })
    expect(s).toHaveLength(1)
    expect(texto(s[0])).toContain("Olá, Chefe!")
    const d = await db.demanda.findUniqueOrThrow({ where: { id } })
    expect(texto(s[0])).toContain(`/postado/${d.postagemToken}`)
    expect(decryptSecret(s[0].telefoneCifrado!)).toBe(telDigitado)
    const fora = await card("editando")
    expect((await enviar(fora, { link: "cobranca", telefone: "(41) 99877-0099" })).status).toBe(409)
  })

  it("na fila, a cobrança com arte sai como uma imagem só, com o texto de legenda", async () => {
    vi.useRealTimers()
    vi.stubEnv("WHATSAPP_ARTES", "ligado")
    await db.jobAutomacao.deleteMany({ where: { organizacaoId: org } })
    await db.saidaWhatsapp.updateMany({ where: { organizacaoId: org, estado: "aguardando" }, data: { estado: "cancelado" } })
    const id = await card("aprovado")
    como("admin")
    expect((await enviar(id, { link: "cobranca", telefone: "(41) 99877-0099" })).status).toBe(200)
    await processarSaidas(org)
    expect(http).toHaveBeenCalledTimes(1)
    expect(String(http.mock.calls[0][0])).toContain("/message/sendMedia/")
    const corpo = JSON.parse(String((http.mock.calls[0][1] as RequestInit).body))
    expect(corpo).toMatchObject({ number: telDigitado, mediatype: "image", mimetype: "image/png" })
    expect(corpo.caption).toContain("Já foi postado?")
    expect(desenhar).toHaveBeenCalledWith("videospc_postar", expect.any(String))
    vi.stubEnv("WHATSAPP_ARTES", "")
  })
})
