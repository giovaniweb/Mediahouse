import { randomUUID } from "node:crypto"
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
const { sessao, ia } = vi.hoisted(() => ({ sessao: { user: null as null | { id: string; organizacaoId: string; tipo: string } }, ia: vi.fn(() => { throw new Error("IA proibida neste resumo") }) }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.user ? { user: sessao.user } : null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/claude", () => ({ analisarComClaude: ia }))
vi.mock("@/lib/ia-analise", () => ({ analisarComOrcamento: ia }))
vi.mock("@anthropic-ai/sdk", () => ({ default: ia }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { apresentarRelatorio } from "@/lib/relatorio-contrato"
import { POST as evento } from "@/app/api/eventos/[id]/relatorio/route"
import { POST as cobertura } from "@/app/api/coberturas/[id]/relatorio/route"
const p = `evt-rel-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`, ea = `${p}-ea`, eb = `${p}-eb`, ca = `${p}-ca`, cb = `${p}-cb`
const req = () => new NextRequest("http://localhost/api/teste/relatorio", { method: "POST" })
type Handler = (req: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>
const chamar = (tipo: Handler, id: string) => tipo(req(), { params: Promise.resolve({ id }) })
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a, b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "sintetico" } })
  await db.usuarioOrganizacao.create({ data: { organizacaoId: a, usuarioId: u, papel: "admin", areas: [] } })
  const datas = { dataInicio: new Date("2026-09-01T00:00:00Z"), dataFim: new Date("2026-09-02T00:00:00Z") }
  await db.eventoGestao.createMany({ data: [[a, ea], [b, eb]].map(([organizacaoId, id]) => ({ id, organizacaoId, codigo: id, nome: id, createdById: u, ...datas })) })
  await db.eventoCobertura.createMany({ data: [[a, ca], [b, cb]].map(([organizacaoId, id]) => ({ id, organizacaoId, slug: id, titulo: id, createdById: u, ...datas })) })
  await db.eventoGestaoChecklist.createMany({ data: [{ eventoId: ea, titulo: "Concluído", concluido: true }, { eventoId: ea, titulo: "Pendente" }] })
  await db.custoEvento.createMany({ data: [{ eventoId: ea, descricao: "Estimado", valorPrevisto: 100 }, { eventoId: ea, descricao: "Zero real", valorPrevisto: 50, valorReal: 0 }, { eventoId: ea, descricao: "Real", valorPrevisto: 25, valorReal: 20 }, { eventoId: eb, descricao: "Privado", valorPrevisto: 99999 }] })
  await db.demanda.createMany({ data: [[a, "própria"], [b, "cruzada"]].map(([organizacaoId, sufixo]) => ({ id: `${p}-${sufixo}`, organizacaoId, codigo: `${p}-${sufixo}`, titulo: sufixo, descricao: "Teste", departamento: "growth", tipoVideo: "reels", cidade: "Teste", solicitanteId: u, eventoGestaoId: ea, statusVisivel: "finalizado" })) })
  await db.eventoCoberturaChecklist.createMany({ data: [{ coberturaId: ca, dia: 1, texto: "Pronto", concluido: true }, { coberturaId: ca, dia: 1, texto: "Pendente" }] })
  const membro = await db.eventoCoberturaEquipe.create({ data: { coberturaId: ca, nome: "Integrante A" } })
  const outro = await db.eventoCoberturaEquipe.create({ data: { coberturaId: cb, nome: "PRIVADO-B" } })
  await db.eventoCoberturaUpload.createMany({ data: [{ coberturaId: ca, membroId: membro.id, dia: 1, tipo: "video", url: "https://example.invalid/1" }, { coberturaId: ca, membroId: membro.id, dia: 2, tipo: "foto", url: "https://example.invalid/2" }, { coberturaId: ca, membroId: outro.id, dia: 2, tipo: "foto", url: "https://example.invalid/3" }, { coberturaId: cb, dia: 1, url: "https://example.invalid/b" }] })
})
beforeEach(async () => {
  vi.clearAllMocks()
  sessao.user = { id: u, organizacaoId: a, tipo: "admin" }
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: a } })
})
afterAll(async () => {
  vi.restoreAllMocks()
  await db.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await db.usuario.delete({ where: { id: u } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
describe("resumos factuais de eventos", () => {
  it("evento separa previsão e realizado, mantém data civil e não inclui demandas de outra empresa", async () => {
    const r = await chamar(evento, ea), body = await r.json()
    expect(r.status).toBe(200)
    expect(r.headers.get("cache-control")).toContain("no-store")
    expect(body).toMatchObject({ origem: "regras-v1", tokens: 0 })
    expect(body.relatorio).toContain("01/09/2026 a 02/09/2026")
    expect(body.relatorio).toContain("1 de 2 itens")
    expect(body.relatorio).toContain("Demandas vinculadas: 1; com status finalizado: 1")
    expect(body.relatorio).toContain("Orçamento previsto do evento: Não informado")
    expect(body.relatorio).toContain("175,00")
    expect(body.relatorio).toContain("20,00")
    expect(body.relatorio).toContain("Itens sem valor realizado informado: 1")
    expect(body.relatorio).not.toContain("99999")
    expect(ia).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it("sem verCustos a resposta não inclui valores, previsão ou documentos privados", async () => {
    await db.permissaoUsuario.create({ data: { organizacaoId: a, usuarioId: u, verEventos: true, verCustos: false } })
    const body = await (await chamar(evento, ea)).json()
    expect(body.relatorio).not.toContain("Financeiro")
    expect(body.relatorio).not.toContain("175,00")
    expect(body.relatorio).not.toContain("20,00")
    expect(body.relatorio).toContain("Checklist")
  })
  it("cobertura conta arquivos por dia/integrante sem nota ou avaliação inventada e salva histórico", async () => {
    const r = await chamar(cobertura, ca), body = await r.json()
    expect(r.status).toBe(200)
    expect(body.conteudo.resumo_executivo).toContain("3 arquivos enviados")
    expect(body.conteudo.equipe).toEqual([{ nome: "Integrante A", funcao: "captacao", arquivos: 2 }])
    expect(body.conteudo.arquivos_por_dia).toEqual([{ dia: 1, arquivos: 1 }, { dia: 2, arquivos: 2 }])
    expect(body.conteudo.pontos_atencao.join(" ")).toContain("Arquivos sem integrante correspondente nesta cobertura: 1")
    expect(body.conteudo).not.toHaveProperty("score_producao")
    expect(body.conteudo).not.toHaveProperty("performance_equipe")
    expect(JSON.stringify(body)).not.toContain("PRIVADO-B")
    const salvo = await db.relatorioIA.findUniqueOrThrow({ where: { id: body.relatorio.id } })
    expect(salvo).toMatchObject({ modelo: "regras-v1", tokens: 0, periodo: `cobertura-${ca}` })
    expect(apresentarRelatorio(salvo.conteudo).estado).toBe("estruturado")
    expect(await db.eventoCoberturaLog.count({ where: { coberturaId: ca, acao: "relatorio" } })).toBe(1)
    expect(ia).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it("empresa errada ou objeto inexistente retorna 404 sem criar relatório", async () => {
    const antes = await db.relatorioIA.count({ where: { organizacaoId: a } })
    for (const [handler, id] of [[evento, eb], [cobertura, cb], [evento, "ausente"], [cobertura, "ausente"]] as const) expect((await chamar(handler, id)).status).toBe(404)
    expect(await db.relatorioIA.count({ where: { organizacaoId: a } })).toBe(antes)
  })
  it("nega capacidade revogada, sessão ausente e organização sem vínculo", async () => {
    await db.permissaoUsuario.create({ data: { organizacaoId: a, usuarioId: u, verEventos: false, verCoberturas: false } })
    expect((await chamar(evento, ea)).status).toBe(403)
    expect((await chamar(cobertura, ca)).status).toBe(403)
    sessao.user!.organizacaoId = b
    expect((await chamar(evento, eb)).status).toBe(403)
    sessao.user = null
    expect((await chamar(evento, ea)).status).toBe(401)
    expect((await chamar(cobertura, ca)).status).toBe(401)
  })
  it("falha no banco retorna 503 sem expor erro interno ou apresentar contagens vazias", async () => {
    const falha = vi.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("segredo-do-banco"))
    try {
      const r = await chamar(cobertura, ca), body = await r.json()
      expect(r.status).toBe(503)
      expect(JSON.stringify(body)).not.toContain("segredo-do-banco")
      expect(body).not.toHaveProperty("conteudo")
    } finally { falha.mockRestore() }
  })
  it("sem checklist/arquivos relata ausência, sem criar percentual ou score", async () => {
    const c = await db.eventoCobertura.create({ data: { organizacaoId: a, titulo: "Vazia", slug: `${p}-vazia`, createdById: u, dataInicio: new Date(), dataFim: new Date() } })
    const body = await (await chamar(cobertura, c.id)).json()
    expect(body.conteudo.pontos_atencao).toContain("Checklist não cadastrado; conclusão não pode ser medida.")
    expect(body.conteudo.equipe).toEqual([])
    expect(body.conteudo.arquivos_por_dia).toEqual([])
    expect(body.conteudo).not.toHaveProperty("score_producao")
  })
})
