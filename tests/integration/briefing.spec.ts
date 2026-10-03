import { randomUUID } from "node:crypto"
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
const { sessao, gerar, contar, opcoes } = vi.hoisted(() => ({ sessao: { user: null as null | { id: string; organizacaoId: string; tipo: string } }, gerar: vi.fn(), contar: vi.fn(), opcoes: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.user ? { user: sessao.user } : null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor(o: unknown) { opcoes(o) } messages = { create: gerar, countTokens: contar } } }))
import { POST } from "@/app/api/coberturas/briefing/route"
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { PDF_MAX_BYTES } from "@/lib/briefing"
const p = `brief-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`
const dados = { titulo: "Evento", tipo: "feira", cliente: null, local: null, cidade: null, dataInicio: "2026-09-01", dataFim: "2026-09-02", descricao: null, programacaoPorDia: [], checklistEspecifico: [], logistica: null }
const resposta = (value: unknown = dados, stop = "end_turn") => ({ id: "msg-briefing", content: [{ type: "text", text: JSON.stringify(value) }], stop_reason: stop, usage: { input_tokens: 1200, output_tokens: 300 } })
function req(destino = "coberturas", arquivo: string | Blob = new Blob(["%PDF-1.7\nfixture"], { type: "application/pdf" })) {
  const form = new FormData(); form.append("file", arquivo)
  return new NextRequest(`http://localhost/api/coberturas/briefing?destino=${destino}`, { method: "POST", body: form })
}
const consumos = () => db.consumoIA.findMany({ where: { organizacaoId: a } })
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a, b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "sintetico" } })
  await db.usuarioOrganizacao.create({ data: { organizacaoId: a, usuarioId: u, papel: "admin", areas: [] } })
})
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "sintetico")
  sessao.user = { id: u, organizacaoId: a, tipo: "admin" }
  contar.mockResolvedValue({ input_tokens: 1500 }); gerar.mockResolvedValue(resposta())
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: a } })
  await db.consumoIA.deleteMany({ where: { organizacaoId: a } })
  await db.politicaIA.deleteMany({ where: { organizacaoId: a } })
  await db.organizacao.update({ where: { id: a }, data: { ativo: true, ambienteTeste: false } })
})
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await db.usuario.delete({ where: { id: u } })
  vi.unstubAllEnvs(); await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
describe("briefing PDF sob orçamento", () => {
  it("conta e gera o mesmo conteúdo, registra uso e devolve apenas dados revisáveis", async () => {
    const r = await POST(req()), body = await r.json()
    expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("private, no-store")
    expect(body.dados).toEqual(dados)
    expect(contar.mock.calls[0][0].messages).toEqual(gerar.mock.calls[0][0].messages)
    expect(opcoes).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0, timeout: 35000 }))
    expect((await consumos())[0]).toMatchObject({ usuarioId: u, finalidade: "briefing.coberturas", estado: "concluido", debitoTokens: 1500, reservaTokens: 29120 })
    expect(await db.eventoCobertura.count({ where: { organizacaoId: a } })).toBe(0)
  })
  it("nega sessão, capacidade e empresa sem vínculo antes da rede", async () => {
    sessao.user = null; expect((await POST(req())).status).toBe(401)
    sessao.user = { id: u, organizacaoId: b, tipo: "admin" }; expect((await POST(req())).status).toBe(403)
    sessao.user.organizacaoId = a
    await db.permissaoUsuario.create({ data: { organizacaoId: a, usuarioId: u, verEventos: false, verCoberturas: false } })
    expect((await POST(req())).status).toBe(403); expect((await POST(req("eventos"))).status).toBe(403)
    expect(contar).not.toHaveBeenCalled(); expect(gerar).not.toHaveBeenCalled()
  })
  it("escolhe capacidade do destino, sem permitir escolher empresa no documento", async () => {
    await db.permissaoUsuario.create({ data: { organizacaoId: a, usuarioId: u, verEventos: true, verCoberturas: false } })
    expect((await POST(req())).status).toBe(403)
    gerar.mockResolvedValue(resposta({ ...dados, organizacaoId: b, usuarioId: "outro" }))
    const r = await POST(req("eventos")); expect(r.status).toBe(200)
    expect((await r.json()).dados).not.toHaveProperty("organizacaoId")
    expect((await consumos())[0]).toMatchObject({ organizacaoId: a, usuarioId: u, finalidade: "briefing.eventos" })
  })
  it("recusa multipart inválido, arquivo falso, vazio e corpo acima do limite sem rede", async () => {
    for (const file of ["texto", new Blob(["fake"], { type: "application/pdf" }), new Blob([], { type: "application/pdf" }), new Blob([new Uint8Array(PDF_MAX_BYTES + 65537)], { type: "application/pdf" })]) {
      expect((await POST(req("coberturas", file))).status).toBeGreaterThanOrEqual(400)
    }
    expect((await POST(new NextRequest("http://localhost/api/coberturas/briefing", { method: "POST", body: "multipart inválido" }))).status).toBe(400)
    expect(contar).not.toHaveBeenCalled(); expect(await consumos()).toHaveLength(0)
  })
  it.each([{ habilitada: false }, { tokensDia: 29119 }, { entradaBytes: 10 }, { saidaTokens: 100 }])("aplica política antes de enviar documento: %j", async policy => {
    await db.politicaIA.create({ data: { organizacaoId: a, ...policy } })
    expect((await POST(req())).status).toBe(429); expect(contar).not.toHaveBeenCalled(); expect(gerar).not.toHaveBeenCalled()
  })
  it("empresa teste não envia PDF para contagem", async () => {
    await db.organizacao.update({ where: { id: a }, data: { ambienteTeste: true } })
    expect((await POST(req())).status).toBe(429); expect(contar).not.toHaveBeenCalled()
  })
  it("estimativa excessiva e falha de contagem liberam reserva sem gerar", async () => {
    contar.mockResolvedValueOnce({ input_tokens: 20001 })
    expect((await POST(req())).status).toBe(429)
    contar.mockRejectedValueOnce(new Error("segredo-do-provedor"))
    const r = await POST(req()); expect(r.status).toBe(422)
    expect(JSON.stringify(await r.json())).not.toContain("segredo")
    expect((await consumos()).every(c => c.estado === "liberado" && c.debitoTokens === 0)).toBe(true)
    expect(gerar).not.toHaveBeenCalled()
  })
  it("revogação durante contagem impede geração", async () => {
    contar.mockImplementationOnce(async () => {
      await db.politicaIA.create({ data: { organizacaoId: a, habilitada: false } })
      return { input_tokens: 1000 }
    })
    expect((await POST(req())).status).toBe(429); expect(gerar).not.toHaveBeenCalled()
    expect((await consumos())[0].estado).toBe("liberado")
  })
  it("reserva também limita contagens concorrentes", async () => {
    await db.politicaIA.create({ data: { organizacaoId: a, simultaneas: 1 } })
    let liberar!: () => void
    const bloqueio = new Promise<void>(r => { liberar = r })
    let entrou!: () => void
    const iniciou = new Promise<void>(r => { entrou = r })
    contar.mockImplementationOnce(async () => { entrou(); await bloqueio; return { input_tokens: 1000 } })
    const primeira = POST(req())
    await iniciou
    try { expect((await POST(req())).status).toBe(429); expect(contar).toHaveBeenCalledTimes(1) }
    finally { liberar() }
    expect((await primeira).status).toBe(200)
  })
  it("timeout de geração conserva débito desconhecido e não repete", async () => {
    gerar.mockRejectedValueOnce(new Error("segredo"))
    const r = await POST(req()); expect(r.status).toBe(503)
    expect(JSON.stringify(await r.json())).not.toContain("segredo")
    expect(gerar).toHaveBeenCalledTimes(1)
    expect((await consumos())[0]).toMatchObject({ estado: "desconhecido", debitoTokens: 29120 })
  })
  it.each([
    { ...dados, dataInicio: "2026-02-30" }, { ...dados, dataFim: "2026-08-01" },
    { ...dados, checklistEspecifico: [{ texto: "Item", categoria: "inventada" }] },
    { ...dados, programacaoPorDia: [{ dia: 1, data: "2027-01-01", titulo: "Outro", momentos: [] }] },
    { ...dados, portfolio: Array(101).fill("produto") },
  ])("recusa conteúdo inválido sem apagar cobrança nem reenviar: %j", async value => {
    gerar.mockResolvedValueOnce(resposta(value))
    expect((await POST(req())).status).toBe(422)
    expect((await consumos())[0]).toMatchObject({ estado: "concluido", debitoTokens: 1500 })
    expect(gerar).toHaveBeenCalledTimes(1)
  })
  it("sem chave ou destino inválido não conta nem gera", async () => {
    expect((await POST(req("inexistente"))).status).toBe(400)
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    expect((await POST(req())).status).toBe(429)
    expect(contar).not.toHaveBeenCalled(); expect(gerar).not.toHaveBeenCalled()
    expect(await consumos()).toHaveLength(0)
  })
  it("contabiliza uso acima da estimativa sem truncar ao valor reservado", async () => {
    gerar.mockResolvedValueOnce({ ...resposta(), usage: { input_tokens: 30000, output_tokens: 300, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 } })
    expect((await POST(req())).status).toBe(200)
    expect((await consumos())[0]).toMatchObject({ estado: "concluido", debitoTokens: 30450, reservaTokens: 29120 })
  })
  it("saída truncada não preenche formulário mesmo contendo JSON válido", async () => {
    gerar.mockResolvedValueOnce(resposta(dados, "max_tokens"))
    expect((await POST(req())).status).toBe(422)
    expect((await consumos())[0].estado).toBe("concluido")
  })
})
