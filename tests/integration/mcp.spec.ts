// O MCP lido como um cliente externo lê: POST JSON-RPC com o token da empresa.
// O que importa aqui é o recorte — só a empresa do token, nada de dinheiro —,
// o registro de cada chamada na auditoria e o freio por minuto.
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
import { createHash, randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { POST } from "@/app/api/mcp/route"

const p = `mcp-${randomUUID()}`
const a = `${p}-a`, b = `${p}-b`, u = `${p}-u`, vm = `${p}-vm`, prod = `${p}-prod`
const ec = `${p}-ec`, em = `${p}-em`, eb = `${p}-eb`
const tokenA = `${p}-token-a`, tokenLimite = `${p}-token-limite`
const id = (s: string) => `${p}-${s}`
const briefingLongo = `Roteiro: abrir com a doutora, mostrar o aparelho. ${"x".repeat(800)}`

async function chamar(body: unknown, token: string | null = tokenA) {
  return POST(new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }))
}
async function ferramenta(name: string, args: Record<string, unknown> = {}, token = tokenA) {
  const r = await (await chamar({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, token)).json()
  const texto: string = r.result.content[0].text
  return { erro: r.result.isError === true, texto, dados: r.result.isError ? null : JSON.parse(texto) }
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-30T15:00:00Z"))
  await db.organizacao.createMany({ data: [
    { id: a, nome: a, slug: a, relatorioToken: tokenA },
    { id: b, nome: b, slug: b, relatorioToken: tokenLimite },
  ] })
  await db.usuario.create({ data: { id: u, nome: "Giovani Fixture", tipo: "admin", senhaHash: "teste" } })
  const listas = { especialidade: [], habilidades: [], redesSociais: [], areasAtuacao: [], equipamentos: [] }
  await db.editor.createMany({ data: [
    { id: ec, nome: "Cristiano Drummond", ...listas },
    { id: em, nome: "Mariana Souza", ...listas },
    { id: eb, nome: "Editor Só da B", ...listas },
  ] })
  await db.produto.create({ data: { id: prod, organizacaoId: a, nome: "Ultraformer MPT" } })
  for (const [s, org, editorId, statusVisivel, statusInterno, prazo, extra] of [
    ["a1", a, ec, "edicao", "editando", "2026-11-05", {
      descricao: briefingLongo, nomeSolicitante: "Dra. Paula", objetivo: "Vender o aparelho",
      detalhesEntrega: { "Copy / legenda": "Legenda do reels", "Orçamento": "R$ 5.000" },
    }],
    ["a2", a, ec, "finalizado", "entregue_cliente", "2026-09-01", {}],
    ["a3", a, em, "entrada", "pedido_criado", "2026-10-20", {}],
    ["a4", a, null, "producao", "planejamento", null, {}],
    ["b1", b, ec, "edicao", "editando", "2026-11-01", {}],
    ["b2", b, eb, "entrada", "pedido_criado", null, {}],
  ] as const) {
    await db.demanda.create({ data: {
      id: id(s), codigo: id(s), titulo: `Pedido ${s}`, descricao: `Briefing ${s}`, departamento: "teste", tipoVideo: "reels",
      cidade: "Teste", organizacaoId: org, solicitanteId: u, editorId, statusVisivel, statusInterno,
      dataLimite: prazo ? new Date(prazo) : null, ...extra,
    } })
  }
  await db.demandaProduto.create({ data: { demandaId: id("a1"), produtoId: prod } })
  await db.videomaker.create({ data: { id: vm, nome: "Fixture", redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
  await db.custoVideomaker.create({ data: { organizacaoId: a, videomakerId: vm, demandaId: id("a1"), valor: 9876.54, dataReferencia: new Date("2026-10-15T12:00:00Z") } })
})
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await db.editor.deleteMany({ where: { id: { in: [ec, em, eb] } } })
  await db.videomaker.delete({ where: { id: vm } })
  await db.usuario.delete({ where: { id: u } })
  await db.$executeRaw`DELETE FROM limites_publicos WHERE chave LIKE 'mcp:%'`
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
  vi.useRealTimers()
})

describe("acesso", () => {
  it("sem token, ou com token que não existe, não responde", async () => {
    expect((await chamar({ jsonrpc: "2.0", id: 1, method: "tools/list" }, null)).status).toBe(401)
    expect((await chamar({ jsonrpc: "2.0", id: 1, method: "tools/list" }, `${p}-inventado`)).status).toBe(401)
  })

  it("lista as quatro ferramentas, todas marcadas como só leitura", async () => {
    const r = await (await chamar({ jsonrpc: "2.0", id: 1, method: "tools/list" })).json()
    const tools = r.result.tools as { name: string; annotations: { readOnlyHint: boolean } }[]
    expect(tools.map((t) => t.name)).toEqual(["relatorio_executivo", "listar_meses", "listar_demandas", "ler_demanda"])
    expect(tools.every((t) => t.annotations.readOnlyHint)).toBe(true)
  })
})

describe("listar_demandas", () => {
  it("sem filtro: as abertas da empresa do token, da que vence primeiro", async () => {
    const r = await ferramenta("listar_demandas")
    expect(r.dados.total).toBe(3)
    expect(r.dados.demandas.map((d: { id: string }) => d.id)).toEqual([id("a3"), id("a1"), id("a4")])
    const a1 = r.dados.demandas[1]
    expect(a1).toMatchObject({
      codigo: id("a1"), titulo: "Pedido a1", equipamentos: ["Ultraformer MPT"], status: "Edição", statusInterno: "editando",
      prazo: "2026-11-05", atrasada: false, abertoPor: "Giovani Fixture", solicitante: "Dra. Paula", editor: "Cristiano Drummond",
      briefingCortado: true,
    })
    expect(a1.briefing).toHaveLength(601)
    expect(r.dados.demandas[0].atrasada).toBe(true)
  })

  it("nada de dinheiro nem da outra empresa", async () => {
    const r = await ferramenta("listar_demandas", { status: "todas" })
    expect(r.texto).not.toMatch(/9876|5\.000|valor|custo/i)
    expect(r.texto).not.toContain(b)
  })

  it("filtra pelo editor com complemento no nome", async () => {
    const r = await ferramenta("listar_demandas", { editor: "Cristiano Drummond - reels" })
    expect(r.dados.editores).toEqual(["Cristiano Drummond"])
    expect(r.dados.demandas.map((d: { id: string }) => d.id)).toEqual([id("a1")])
  })

  it("filtra pelo status: coluna, rótulo, interno ou todas", async () => {
    const ids = async (args: Record<string, unknown>) =>
      ((await ferramenta("listar_demandas", args)).dados.demandas as { id: string }[]).map((d) => d.id).sort()
    expect(await ids({ editor: "Cristiano", status: "todas" })).toEqual([id("a1"), id("a2")])
    expect(await ids({ status: "Finalizado" })).toEqual([id("a2")])
    expect(await ids({ status: "editando" })).toEqual([id("a1")])
  })

  it("editor que não existe na empresa: erro com os editores dela, sem os da outra", async () => {
    const r = await ferramenta("listar_demandas", { editor: "Fulano" })
    expect(r.erro).toBe(true)
    expect(r.texto).toContain("Cristiano Drummond, Mariana Souza")
    expect(r.texto).not.toContain("Só da B")
  })

  it("respeita o limite e diz o total", async () => {
    const r = await ferramenta("listar_demandas", { limite: 1 })
    expect(r.dados).toMatchObject({ total: 3, mostrando: 1 })
  })

  it("status inválido volta como erro para o cliente corrigir", async () => {
    const r = await ferramenta("listar_demandas", { status: "pronto" })
    expect(r.erro).toBe(true)
    expect(r.texto).toMatch(/Status desconhecido/)
  })
})

describe("ler_demanda", () => {
  it("pelo código: briefing inteiro e detalhes, sem os de dinheiro", async () => {
    const r = await ferramenta("ler_demanda", { id: id("a1") })
    expect(r.dados.briefing).toBe(briefingLongo)
    expect(r.dados.detalhes).toEqual({ "Copy / legenda": "Legenda do reels" })
    expect(r.dados.objetivo).toBe("Vender o aparelho")
    expect(r.texto).not.toMatch(/9876|5\.000|Orçamento/)
  })

  it("demanda de outra empresa não existe para este token", async () => {
    const r = await ferramenta("ler_demanda", { id: id("b1") })
    expect(r.erro).toBe(true)
    expect(r.texto).toContain("não encontrada")
  })
})

describe("rastreabilidade e freio", () => {
  it("cada chamada fica na auditoria da empresa, com a impressão do token", async () => {
    const impressao = createHash("sha256").update(tokenA).digest("hex").slice(0, 12)
    const eventos = await db.eventoAuditoria.findMany({ where: { organizacaoId: a, acao: "mcp.leitura" } })
    expect(eventos.length).toBeGreaterThan(0)
    expect(eventos.every((e) => e.atorTipo === "tecnico" && e.atorId === `mcp:${impressao}`)).toBe(true)
    expect(eventos.find((e) => e.recurso === "ler_demanda" && e.resultado === "sucesso")?.recursoId).toBe(id("a1"))
    expect(eventos.some((e) => e.recurso === "ler_demanda" && e.resultado === "falha")).toBe(true)
    expect(eventos.find((e) => e.recurso === "listar_demandas" && e.resultado === "sucesso")?.depois).toMatchObject({ processados: expect.any(Number) })
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: b, acao: "mcp.leitura" } })).toBe(0)
  })

  it("passou de 60 por minuto, recusa até a janela virar", async () => {
    const impressao = createHash("sha256").update(tokenLimite).digest("hex").slice(0, 12)
    await db.$executeRaw`INSERT INTO limites_publicos (chave, "janelaInicio", contagem) VALUES (${`mcp:${impressao}`}, now(), 60)`
    const r = await ferramenta("listar_meses", {}, tokenLimite)
    expect(r.erro).toBe(true)
    expect(r.texto).toMatch(/Limite de 60 consultas por minuto/)
  })

  it("mês inválido no relatório continua com a mensagem clara", async () => {
    const r = await ferramenta("relatorio_executivo", { mes: "2026-13" })
    expect(r.erro).toBe(true)
    expect(r.texto).toBe("Mês inválido")
  })
})
