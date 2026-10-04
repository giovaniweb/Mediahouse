import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado, analisar, agente } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } } }, analisar: vi.fn(), agente: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/claude", () => ({ analisarComClaude: analisar, executarAgenteComTools: agente, MODELO_POTENTE: "simulado", MODELO_RAPIDO: "simulado" }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: vi.fn() }))
vi.mock("@/lib/ia-analise", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/ia-analise")>(), analisarComOrcamento: analisar }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as metricas } from "@/app/api/relatorios/metricas/route"
import { GET as producao } from "@/app/api/producao/route"
import { GET as dashboard } from "@/app/api/dashboard/metrics/route"
import { POST as gerar } from "@/app/api/relatorios/gerar/route"
import { GET as cron } from "@/app/api/cron/agentes/route"
import { GET as historico } from "@/app/api/relatorios/route"
import { PATCH as mover } from "@/app/api/demandas/[id]/status/route"
import { computeRelatorioExecutivo } from "@/lib/relatorio-executivo"
import { PRESETS } from "@/lib/permissoes"
const p = `met-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`
const request = (url: string) => new NextRequest(`http://localhost${url}`)
const setembro = "periodo=custom&de=2026-09-01&ate=2026-09-30"
const post = (body: unknown) => new NextRequest("http://localhost/api/test",{ method: "POST", body: JSON.stringify(body) })
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-30T15:00:00Z"))
  await db.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "teste" } })
  await db.usuarioOrganizacao.create({ data: { organizacaoId: a, usuarioId: u, papel: "admin", areas: [] } })
  for (const [s,org,area,criada,final,status] of [
    ["fora",a,"audiovisual","2026-08-01T12:00Z","2026-09-01T03:00Z","finalizado"],
    ["fim",a,"audiovisual","2026-09-01T03:00Z","2026-10-01T02:59:59.999Z","finalizado"],
    ["excluida",a,"audiovisual","2026-09-01T02:59:59.999Z","2026-10-01T03:00Z","finalizado"],
    ["reaberta",a,"audiovisual","2026-09-03T12:00Z","2026-09-03T13:00Z","edicao"],
    ["legado",a,"audiovisual","2026-09-03T12:00Z",null,"finalizado"],
    ["growth",a,"design","2026-09-01T12:00Z","2026-09-15T12:00Z","finalizado"],
    ["outra",b,"audiovisual","2026-09-01T12:00Z","2026-09-15T12:00Z","finalizado"],
  ] as const) {
    const id = `${p}-${s}`
    await db.demanda.create({ data: { id, organizacaoId: org, area, codigo: id, titulo: id, descricao: "Fixture", departamento: "teste", tipoVideo: "reels", cidade: "Teste", solicitanteId: u, createdAt: new Date(criada), finalizadaEm: final ? new Date(final) : null, statusVisivel: status, statusInterno: status === "finalizado" ? "entregue_cliente" : "editando", linkFinal: `https://example.invalid/${id}.mp4` } })
  }
  await db.arquivo.createMany({ data: [
    { demandaId: `${p}-fora`, tipoArquivo: "final", nomeArquivo: "a", url: `https://example.invalid/${p}-fora.mp4` },
    { demandaId: `${p}-fora`, tipoArquivo: "final", nomeArquivo: "b", url: "https://example.invalid/segundo.mp4" },
    { demandaId: `${p}-fora`, tipoArquivo: "bruto", nomeArquivo: "bruto", url: "https://example.invalid/bruto.mp4" },
  ] })
  await db.videomaker.create({ data: { id: p, nome: "Fixture", redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
  await db.custoVideomaker.create({ data: { organizacaoId: a, videomakerId: p, demandaId: `${p}-fora`, valor: 9876.54, dataReferencia: new Date("2026-09-15T12:00:00Z") } })
  await db.producaoManual.create({ data: { organizacaoId: a, competencia: 202609, area: "audiovisual", grupo: "producao", categoria: p, quantidade: 12 } })
})
beforeEach(async () => { estado.sessao = { user: { id: u, organizacaoId: a, tipo: "admin" } }; analisar.mockReset(); analisar.mockResolvedValue({ texto: "Análise sintética", tokens: 1 }); await db.permissaoUsuario.deleteMany({ where: { usuarioId: u, organizacaoId: a } }) })
afterAll(async () => { await db.organizacao.deleteMany({ where: { id: { in: [a,b] } } }); await db.videomaker.delete({ where: { id: p } }); await db.usuario.delete({ where: { id: u } }); await Promise.all([db.$disconnect(),prismaAuth.$disconnect()]); vi.useRealTimers() })
describe("mesmos indicadores em todos os consumidores", () => {
  it("conclusão atual, limites locais, tipo final e fontes separadas", async () => {
    const r = await (await metricas(request(`/api/relatorios/metricas?${setembro}`))).json()
    expect(r.operacional).toMatchObject({ criadas: 3, concluidas: 2, entregaveis: 3, finalizadasSemData: 1, publicacoes: null, manual: { total: 12, totalCombinado: null } })
    expect(r.tendencia.reduce((n: number,v: {concluidas: number}) => n+v.concluidas,0)).toBe(2)
    const prod = await (await producao(request("/api/producao?mes=2026-09"))).json()
    expect(prod).not.toHaveProperty("valorPorDemanda"); expect(prod).not.toHaveProperty("porEditor"); expect(r.producao).not.toHaveProperty("producaoMes")
    const dash = await (await dashboard()).json()
    const exp = await computeRelatorioExecutivo(a,"2026-09","audiovisual")
    expect(prod.totalVideos).toBe(3); expect(dash.metricas.concluidasMes).toBe(3); expect(exp.nuflowVideos).toBe(3)
    expect(exp.totalGeral).toBeNull()
  })
  it("Growth é design e não mistura empresa nem audiovisual", async () => {
    const r = await (await metricas(request(`/api/relatorios/metricas?${setembro}&area=growth`))).json()
    expect(r.operacional).toMatchObject({ criadas: 1, concluidas: 1, entregaveis: 1, recorte: { area: "design" } })
  })
  it("sem acesso financeiro, omite custos e salva histórico operacional legível", async () => {
    await db.permissaoUsuario.create({ data: { usuarioId: u, organizacaoId: a, ...PRESETS.admin, verCustos: false } })
    const r = await (await metricas(request(`/api/relatorios/metricas?${setembro}`))).json()
    expect(r.custos).toBeUndefined(); expect(JSON.stringify(r)).not.toContain("9876.54")
    const resp = await gerar(post({ tipo: "mensal", mes: "2026-09", analiseIA: true })); expect(resp.status).toBe(200)
    const g = await resp.json(); expect(g.relatorio.apresentacao.snapshot.custoTotal).toBeNull(); expect(analisar.mock.calls[0][0]).not.toContain("9876.54")
    const l = await (await historico(request("/api/relatorios"))).json(); expect(l.relatorios.some((v: {id: string}) => v.id === g.relatorio.id)).toBe(true)
    expect((await gerar(post({ tipo: "analise_custos" }))).status).toBe(403)
  })
  it("snapshot emitido permanece congelado após reabrir e concluir novamente", async () => {
    const g = await (await gerar(post({ tipo: "mensal", mes: "2026-09", analiseIA: true }))).json()
    const id = `${p}-fora`, params = { params: Promise.resolve({ id }) }
    expect((await mover(post({ statusInterno: "editando" }),params)).status).toBe(200)
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).finalizadaEm).toBeNull()
    const r = await (await metricas(request(`/api/relatorios/metricas?${setembro}`))).json(); expect(r.operacional.concluidas).toBe(1)
    const salvo = await db.relatorioIA.findUniqueOrThrow({ where: { id: g.relatorio.id } }); expect(salvo.conteudo).toMatchObject({ snapshot: { metricas: { concluidas: 2, entregaveis: 3 } } })
    expect((await mover(post({ statusInterno: "entregue_cliente" }),params)).status).toBe(200)
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).finalizadaEm?.toISOString()).toBe("2026-09-30T15:00:00.000Z")
    expect(await db.historicoStatus.count({ where: { demandaId: id } })).toBe(2)
  })
  it("publicação exige data explícita, não deduz status postado", async () => {
    await db.demanda.update({ where: { id: `${p}-growth` }, data: { statusInterno: "postado" } })
    const ler = async () => (await (await metricas(request(`/api/relatorios/metricas?${setembro}&area=design`))).json()).operacional
    expect((await ler()).publicacoes).toBeNull()
    await db.demanda.update({ where: { id: `${p}-growth` }, data: { dataPostagem: new Date("2026-09-20T12:00:00Z") } })
    expect((await ler()).publicacoes).toBe(1)
  })
  it("cron semanal persiste o mesmo contrato sem consultar métricas por ferramentas ou expor custos", async () => {
    vi.stubEnv("CRON_SECRET", "cron-local-sintetico")
    agente.mockImplementation(() => { throw new Error("LLM não permitido em rotina") })
    try {
      const response = await cron(new NextRequest("http://localhost/api/cron/agentes?agente=vistoria", { headers: { authorization: "Bearer cron-local-sintetico" } }))
      expect(response.status).toBe(200)
      const saved = await db.relatorioIA.findFirstOrThrow({ where: { organizacaoId: a, tipo: "semanal", chaveRegra: { startsWith: "semanal:v1:audiovisual:" } }, orderBy: { createdAt: "desc" } })
      expect(saved.conteudo).toMatchObject({ metadados: { area: "audiovisual", origem: "agente" }, snapshot: { custoTotal: null, metricas: { versao: 1, recorte: { tipo: "custom" } } } })
      expect(agente).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs() }
  })
  it("datas inválidas não consomem IA", async () => {
    expect((await gerar(post({ tipo: "mensal", periodo: "custom", de: "2026-02-30", ate: "2026-03-01" }))).status).toBe(400)
    expect((await metricas(request("/api/relatorios/metricas?area=invalida"))).status).toBe(400); expect(analisar).not.toHaveBeenCalled()
  })
})
