import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado, analisar } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } } }, analisar: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/claude", () => ({ analisarComClaude: analisar, MODELO_POTENTE: "simulado", MODELO_RAPIDO: "simulado", extrairJSON: (s: string) => { try { return JSON.parse(s) } catch { return null } } }))
vi.mock("@/lib/ia-analise", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/ia-analise")>(), analisarComOrcamento: analisar }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET } from "@/app/api/relatorios/route"
import { POST } from "@/app/api/relatorios/gerar/route"
const p = `rel-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`
const gerar = (body: unknown) => POST(new NextRequest("http://localhost/api/relatorios/gerar", { method: "POST", body: JSON.stringify(body) }))
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "sem-login" } })
  await db.usuarioOrganizacao.create({ data: { organizacaoId: a, usuarioId: u, papel: "admin", areas: [] } })
  await db.relatorioIA.createMany({ data: [a,b].map(organizacaoId => ({ organizacaoId, tipo: "semanal", periodo: "21/09/2026", conteudo: { analise: `Texto-${organizacaoId}`, auto: true }, tokens: 0, modelo: "fixture" })) })
})
beforeEach(() => { estado.sessao = { user: { id: u, organizacaoId: a, tipo: "admin" } }; analisar.mockReset(); analisar.mockResolvedValue({ texto: '{"resumo_executivo":"Análise sintética"}', tokens: 2 }) })
afterAll(async () => { await db.organizacao.deleteMany({ where: { id: { in: [a,b] } } }); await db.usuario.delete({ where: { id: u } }); await Promise.all([db.$disconnect(),prismaAuth.$disconnect()]) })
describe("relatórios persistidos", () => {
  it("lê legado só da empresa A sem chamar IA nem devolver JSON bruto", async () => {
    const response = await GET(new NextRequest("http://localhost/api/relatorios")); const data = await response.json()
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store")
    expect(JSON.stringify(data)).toContain(`Texto-${a}`); expect(JSON.stringify(data)).not.toContain(`Texto-${b}`)
    expect(data.relatorios[0].conteudo).toBeUndefined(); expect(analisar).not.toHaveBeenCalled()
  })
  it("nega seleção de empresa sem vínculo e requisição sem sessão", async () => {
    estado.sessao!.user.organizacaoId = b
    expect((await GET(new NextRequest("http://localhost/api/relatorios"))).status).toBe(403)
    estado.sessao = null; expect((await gerar({ tipo: "semanal" })).status).toBe(401); expect(analisar).not.toHaveBeenCalled()
  })
  it("rejeita tipo e limites inválidos antes de consumir IA", async () => {
    expect((await gerar({ tipo: "inventado" })).status).toBe(400)
    expect((await GET(new NextRequest("http://localhost/api/relatorios?limite=-1"))).status).toBe(400)
    expect(analisar).not.toHaveBeenCalled()
  })
  it("grava formato validado e preserva snapshot quando IA responde JSON inesperado sem repetir chamada", async () => {
    analisar.mockResolvedValueOnce({ texto: '{"kpis":"inválido"}', tokens: 5 })
    const response = await gerar({ tipo: "semanal" }); const data = await response.json()
    expect(response.status).toBe(200); expect(analisar).toHaveBeenCalledTimes(1)
    expect(data.relatorio.apresentacao.estado).toBe("invalido")
    const salvo = await db.relatorioIA.findUniqueOrThrow({ where: { id: data.relatorio.id } })
    expect(salvo.conteudo).toMatchObject({ versao: 1, snapshot: { demandasCriadas: 0 }, conteudo: { formato: "invalido" } })
    expect(await db.relatorioIA.count({ where: { organizacaoId: a, modelo: "fixture" } })).toBe(1)
  })
  it("ideias da empresa B não entram no prompt da empresa A", async () => {
    await db.ideiaVideo.createMany({ data: [{ organizacaoId: a, titulo: "IDEIA_PUBLICO_A" }, { organizacaoId: b, titulo: "IDEIA_PRIVADA_B" }] })
    await gerar({ tipo: "banco_ideias" })
    const prompt = analisar.mock.calls[0][0]
    expect(prompt).toContain("SNAPSHOT:"); expect(prompt).not.toContain("IDEIA_PUBLICO_A"); expect(prompt).not.toContain("IDEIA_PRIVADA_B")
  })
  it("novo relatório retorna apresentação compartilhada pelo histórico", async () => {
    const data = await (await gerar({ tipo: "mensal" })).json()
    const lista = await (await GET(new NextRequest("http://localhost/api/relatorios"))).json()
    expect(lista.relatorios.find((r: {id: string}) => r.id === data.relatorio.id).apresentacao).toEqual(data.relatorio.apresentacao)
  })
})
