import { randomUUID } from "node:crypto"
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
const { sessao, chamada, opcoesSDK } = vi.hoisted(() => ({ sessao: { user: null as null | { id: string; organizacaoId: string; tipo: string } }, chamada: vi.fn(), opcoesSDK: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.user ? { user: sessao.user } : null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor(opcoes: unknown) { opcoesSDK(opcoes) } messages = { create: chamada } } }))
import { POST as gerar } from "@/app/api/relatorios/gerar/route"
import { GET as resumoHTTP } from "@/app/api/ia/consumo/route"
import { prismaAuth } from "@/lib/prisma-auth"
import { prismaBase as db } from "@/lib/prisma"
import { criarOrcamentoIA } from "@/lib/ia-orcamento"
import { criarAnaliseIA, FalhaAnaliseIA } from "@/lib/ia-analise"

const p = `orc-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`
const orcamento = criarOrcamentoIA(db)
const contexto = { organizacaoId: a, usuarioId: u, finalidade: "relatorio.semanal" }
const modelo = "claude-haiku-4-5"
const reservar = (org = a) => orcamento.reservar({ ...contexto, organizacaoId: org }, modelo, 1000, 1000)
const uso = { entrada: 100, saida: 50, cacheLeitura: 20, cacheEscrita: 30, provedorId: "msg-sintetica" }
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a, b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "sintetico" } })
  await db.usuarioOrganizacao.createMany({ data: [a, b].map(organizacaoId => ({ organizacaoId, usuarioId: u, papel: "admin", areas: [] })) })
})
beforeEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.stubEnv("ANTHROPIC_API_KEY", "sintetico-nao-usar")
  sessao.user = { id: u, organizacaoId: a, tipo: "admin" }
  chamada.mockResolvedValue({ id: "msg-rota", content: [{ type: "text", text: "Análise sintética" }], usage: { input_tokens: 200, output_tokens: 100 } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: a } })
  await db.consumoIA.deleteMany({ where: { organizacaoId: { in: [a, b] } } })
  await db.politicaIA.deleteMany({ where: { organizacaoId: { in: [a, b] } } })
  await db.organizacao.updateMany({ where: { id: { in: [a, b] } }, data: { ativo: true, ambienteTeste: false } })
})
afterAll(async () => {
  vi.restoreAllMocks()
  await db.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await db.usuario.delete({ where: { id: u } })
  vi.unstubAllEnvs()
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
describe("reservas de IA no PostgreSQL", () => {
  it("duas chamadas próximas ao teto não gastam o mesmo saldo", async () => {
    await db.politicaIA.create({ data: { organizacaoId: a, tokensDia: 4000 } })
    const resultados = await Promise.allSettled([reservar(), reservar()])
    expect(resultados.filter(r => r.status === "fulfilled")).toHaveLength(1)
    expect(resultados.find(r => r.status === "rejected")).toMatchObject({ reason: { codigo: "orcamento" } })
    expect((await orcamento.resumo(a)).tokensComprometidos).toBe(3024)
  })
  it("limita simultaneidade entre requisições e isola saldo por empresa", async () => {
    const resultados = await Promise.allSettled([reservar(), reservar(), reservar()])
    expect(resultados.filter(r => r.status === "fulfilled")).toHaveLength(2)
    expect(resultados.find(r => r.status === "rejected")).toMatchObject({ reason: { codigo: "simultaneas" } })
    await reservar(b)
    expect((await orcamento.resumo(b)).tokensComprometidos).toBe(3024)
  })
  it("libera reserva vencida antes da rede e impede início tardio", async () => {
    const r = await reservar()
    await db.consumoIA.update({ where: { id: r.id }, data: { expiraEm: new Date(0) } })
    expect((await orcamento.resumo(a)).tokensComprometidos).toBe(0)
    await expect(orcamento.iniciar(r)).rejects.toMatchObject({ codigo: "reserva" })
  })
  it("checkpoint só pode iniciar uma vez, inclusive sob concorrência", async () => {
    const r = await reservar()
    const resultados = await Promise.allSettled([orcamento.iniciar(r), orcamento.iniciar(r)])
    expect(resultados.filter(r => r.status === "fulfilled")).toHaveLength(1)
    await expect(orcamento.liberar(r)).rejects.toMatchObject({ codigo: "reserva" })
  })
  it("timeout após envio mantém débito inclusive de dia anterior; resposta tardia reconcilia uma vez", async () => {
    const r = await reservar()
    await orcamento.iniciar(r)
    await db.consumoIA.update({ where: { id: r.id }, data: { expiraEm: new Date(0), periodo: new Date("2020-01-01") } })
    expect((await orcamento.resumo(a)).tokensComprometidos).toBe(3024)
    expect((await db.consumoIA.findUniqueOrThrow({ where: { id: r.id } })).estado).toBe("desconhecido")
    await expect(orcamento.liberar(r)).rejects.toThrow()
    await orcamento.reconciliar(r, uso)
    await orcamento.reconciliar(r, uso)
    await expect(orcamento.reconciliar(r, { ...uso, entrada: 99 })).rejects.toThrow("divergente")
    expect((await db.consumoIA.findUniqueOrThrow({ where: { id: r.id } })).debitoTokens).toBe(200)
  })
  it("mede categorias separadas, custo ausente continua desconhecido e excesso não é truncado", async () => {
    const r = await reservar(); await orcamento.iniciar(r)
    await orcamento.reconciliar(r, { ...uso, entrada: 5000 })
    expect(await orcamento.resumo(a)).toMatchObject({ tokensMedidos: 5100, tokensComprometidos: 5100, custoMonetario: null, precificacao: "desconhecida" })
    expect(await db.consumoIA.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ entradaTokens: 5000, saidaTokens: 50, cacheLeituraTokens: 20, cacheEscritaTokens: 30 })
  })
  it("empresa inativa, de teste, opt-out e ator sem vínculo são recusados", async () => {
    await db.organizacao.update({ where: { id: a }, data: { ativo: false } })
    await expect(reservar()).rejects.toMatchObject({ codigo: "indisponivel" })
    await db.organizacao.update({ where: { id: a }, data: { ativo: true, ambienteTeste: true } })
    await expect(reservar()).rejects.toMatchObject({ codigo: "indisponivel" })
    await db.organizacao.update({ where: { id: a }, data: { ambienteTeste: false } })
    await db.politicaIA.create({ data: { organizacaoId: a, habilitada: false } })
    await expect(reservar()).rejects.toMatchObject({ codigo: "indisponivel" })
    await expect(orcamento.reservar({ ...contexto, usuarioId: "outro" }, modelo, 1, 1)).rejects.toThrow()
    expect(await db.consumoIA.count({ where: { organizacaoId: a } })).toBe(0)
  })
  it("revalida política antes da rede e recusa troca de organização/token", async () => {
    const r = await reservar()
    await expect(orcamento.iniciar({ ...r, organizacaoId: b })).rejects.toThrow()
    await expect(orcamento.iniciar({ ...r, token: "adulterado" })).rejects.toThrow()
    await db.politicaIA.create({ data: { organizacaoId: a, habilitada: false } })
    await expect(orcamento.iniciar(r)).rejects.toMatchObject({ codigo: "indisponivel" })
    await orcamento.liberar(r)
    expect((await orcamento.resumo(a)).tokensComprometidos).toBe(0)
  })
  it("tamanho e saída são verificados antes de reservar", async () => {
    await expect(orcamento.reservar(contexto, modelo, 40_000, 100)).rejects.toMatchObject({ codigo: "entrada" })
    await expect(orcamento.reservar(contexto, modelo, 100, 8193)).rejects.toMatchObject({ codigo: "entrada" })
    await db.politicaIA.create({ data: { organizacaoId: a, tokensDia: 0 } })
    await expect(reservar()).rejects.toMatchObject({ codigo: "orcamento" })
  })
})
describe("adaptador de análise com provedor sintético", () => {
  const resposta = { id: "msg-sintetica", content: [{ type: "text", text: "Resposta sintética" }], usage: { input_tokens: 20, output_tokens: 10 } }
  it("reserva antes da rede e persiste uso sem armazenar prompt", async () => {
    const enviar = vi.fn(async () => {
      expect(await db.consumoIA.count({ where: { organizacaoId: a, estado: "enviando" } })).toBe(1)
      return resposta
    })
    expect(await criarAnaliseIA(db, enviar)("PROMPT-PRIVADO", "", modelo, contexto)).toEqual({ texto: "Resposta sintética", tokens: 30 })
    const salvo = await db.consumoIA.findFirstOrThrow({ where: { organizacaoId: a } })
    expect(salvo).toMatchObject({ estado: "concluido", debitoTokens: 30, cacheLeituraTokens: null, cacheEscritaTokens: null })
    expect(JSON.stringify(salvo)).not.toContain("PROMPT-PRIVADO")
    expect(enviar).toHaveBeenCalledTimes(1)
  })
  it("não repete timeout nem libera débito; outra chamada não ultrapassa simultaneidade", async () => {
    await db.politicaIA.create({ data: { organizacaoId: a, simultaneas: 1 } })
    const enviar = vi.fn(async () => { throw new Error("timeout com segredo") })
    await expect(criarAnaliseIA(db, enviar)("teste", "", modelo, contexto)).rejects.toBeInstanceOf(FalhaAnaliseIA)
    await expect(reservar()).rejects.toMatchObject({ codigo: "simultaneas" })
    expect(enviar).toHaveBeenCalledTimes(1)
    expect((await db.consumoIA.findFirstOrThrow({ where: { organizacaoId: a } })).estado).toBe("desconhecido")
  })
  it("falha na persistência pós-provedor não repete a chamada nem libera a reserva", async () => {
    const enviar = vi.fn(async () => {
      vi.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("falha sintética na conciliação"))
      return resposta
    })
    await expect(criarAnaliseIA(db, enviar)("teste", "", modelo, contexto)).rejects.toBeInstanceOf(FalhaAnaliseIA)
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(await db.consumoIA.findFirstOrThrow({ where: { organizacaoId: a } })).toMatchObject({ estado: "desconhecido", entradaTokens: null })
    expect((await orcamento.resumo(a)).tokensPendentes).toBeGreaterThan(0)
  })
  it("modelo não permitido e entrada excessiva não invocam provedor", async () => {
    const enviar = vi.fn(async () => resposta), analisar = criarAnaliseIA(db, enviar)
    await expect(analisar("teste", "", "modelo-arbitrario", contexto)).rejects.toThrow()
    await expect(analisar("á".repeat(33000), "", modelo, contexto)).rejects.toMatchObject({ codigo: "entrada" })
    expect(enviar).not.toHaveBeenCalled()
  })
})


describe("relatórios e painel com controle real e provedor falso", () => {
  const relatorio = () => gerar(new NextRequest("http://localhost/api/relatorios/gerar", { method: "POST", body: JSON.stringify({ tipo: "semanal" }) }))
  it("rota autorizada registra finalidade, ator e tokens; painel não expõe prompts ou tokens de reserva", async () => {
    const resposta = await relatorio()
    expect(resposta.status).toBe(200)
    expect((await resposta.json()).tokens).toBe(300)
    expect(chamada).toHaveBeenCalledTimes(1)
    expect(await db.consumoIA.findFirstOrThrow({ where: { organizacaoId: a } })).toMatchObject({ usuarioId: u, finalidade: "relatorio.semanal", estado: "concluido", debitoTokens: 300 })
    expect(opcoesSDK).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0, timeout: 90_000 }))
    const painel = await resumoHTTP()
    expect(painel.status).toBe(200)
    expect(painel.headers.get("cache-control")).toContain("no-store")
    const resumo = await painel.json()
    expect(resumo).toMatchObject({ cobertura: "relatorios.gerar", tokensMedidos: 300, custoMonetario: null })
    expect(resumo).not.toHaveProperty("token")
    expect(resumo).not.toHaveProperty("usuarioId")
  })
  it("limite mantém relatório determinístico e não chama provedor", async () => {
    await db.politicaIA.create({ data: { organizacaoId: a, tokensDia: 0 } })
    const r = await relatorio(), body = await r.json()
    expect(r.status).toBe(200)
    expect(body.relatorio.modelo).toBe("regras-v1")
    expect(body.relatorio.apresentacao.texto).toContain("limite diário")
    expect(body.relatorio.apresentacao.snapshot).toBeTruthy()
    expect(chamada).not.toHaveBeenCalled()
  })
  it("timeout conserva reserva desconhecida e devolve snapshot sem repetir chamada", async () => {
    chamada.mockRejectedValueOnce(new Error("segredo-provedor"))
    const r = await relatorio(), body = await r.json()
    expect(r.status).toBe(200)
    expect(body.relatorio.apresentacao.texto).toContain("confirmação pode estar pendente")
    expect(JSON.stringify(body)).not.toContain("segredo-provedor")
    expect((await db.consumoIA.findFirstOrThrow({ where: { organizacaoId: a } })).estado).toBe("desconhecido")
    expect(chamada).toHaveBeenCalledTimes(1)
  })
  it("painel requer capacidade, sessão e isola a empresa escolhida", async () => {
    await reservar()
    sessao.user!.organizacaoId = b
    expect((await (await resumoHTTP()).json()).tokensComprometidos).toBe(0)
    sessao.user!.organizacaoId = a
    await db.permissaoUsuario.create({ data: { organizacaoId: a, usuarioId: u, gerenciarConfig: false } })
    expect((await resumoHTTP()).status).toBe(403)
    sessao.user = null
    expect((await resumoHTTP()).status).toBe(401)
  })
})
