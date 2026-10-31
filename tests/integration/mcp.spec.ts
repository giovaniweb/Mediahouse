// O MCP lido como um cliente externo lê: POST JSON-RPC com a chave no Bearer.
// A chave da EMPRESA (a do link público do relatório) só abre os números. A
// chave da PESSOA age como ela: lê o que ela vê, cria pelas regras dela, e o
// que criou pode ser desfeito em Configurações enquanto ninguém mexer.
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
import { createHash, randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

const estado = vi.hoisted(() => ({ sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { entradaDoPedidoInterno } from "@/lib/quem-aprova"
import { POST } from "@/app/api/mcp/route"
import * as chaves from "@/app/api/configuracoes/mcp/route"
import * as daChave from "@/app/api/configuracoes/mcp/[id]/route"

const p = `mcp-${randomUUID()}`
const a = `${p}-a`, b = `${p}-b`, gi = `${p}-gi`, cris = `${p}-cris`, vm = `${p}-vm`, prod = `${p}-prod`
const ec = `${p}-ec`, em = `${p}-em`, eb = `${p}-eb`
const tokenEmpresa = `${p}-token-empresa`
const id = (s: string) => `${p}-${s}`
const briefingLongo = `Roteiro: abrir com a doutora, mostrar o aparelho. ${"x".repeat(800)}`
const chaveDe: Record<string, { id: string; chave: string }> = {}

const comoAdmin = () => { estado.sessao = { user: { id: gi, organizacaoId: a, tipo: "admin" } } }
const json = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/configuracoes/mcp", { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) })
const params = (v: string) => ({ params: Promise.resolve({ id: v }) })

async function chamar(body: unknown, token: string | null) {
  return POST(new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }))
}
async function ferramenta(token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await (await chamar({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, token)).json()
  const texto: string = r.result.content[0].text
  return { erro: r.result.isError === true, texto, dados: r.result.isError ? null : JSON.parse(texto) }
}
const ids = (dados: { demandas: { id: string }[] }) => dados.demandas.map((d) => d.id)

beforeAll(async () => {
  await db.organizacao.createMany({ data: [
    { id: a, nome: a, slug: a, relatorioToken: tokenEmpresa },
    { id: b, nome: b, slug: b },
  ] })
  await db.usuario.createMany({ data: [
    { id: gi, nome: "Giovani Fixture", tipo: "admin", senhaHash: "teste" },
    { id: cris, nome: "Cristiano Drummond", tipo: "videomaker", senhaHash: "teste" },
  ] })
  // O Cris é videomaker da casa: o preset não vê o quadro inteiro, só o que é dele.
  await db.usuarioOrganizacao.createMany({ data: [
    { organizacaoId: a, usuarioId: gi, papel: "admin", areas: [] },
    { organizacaoId: a, usuarioId: cris, papel: "videomaker", categoria: "interna", areas: [] },
  ] })
  const listas = { especialidade: [], habilidades: [], redesSociais: [], areasAtuacao: [], equipamentos: [] }
  await db.editor.createMany({ data: [
    { id: ec, nome: "Cristiano Drummond", usuarioId: cris, ...listas },
    { id: em, nome: "Mariana Souza", ...listas },
    { id: eb, nome: "Editor Só da B", ...listas },
  ] })
  await db.editorOrganizacao.create({ data: { organizacaoId: a, editorId: ec } })
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
      cidade: "Teste", organizacaoId: org, solicitanteId: gi, editorId, statusVisivel, statusInterno,
      dataLimite: prazo ? new Date(prazo) : null, ...extra,
    } })
  }
  await db.demandaProduto.create({ data: { demandaId: id("a1"), produtoId: prod } })
  await db.videomaker.create({ data: { id: vm, nome: "Fixture", redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
  await db.custoVideomaker.create({ data: { organizacaoId: a, videomakerId: vm, demandaId: id("a1"), valor: 9876.54, dataReferencia: new Date("2026-10-15T12:00:00Z") } })

  // As chaves nascem pela tela de Configurações, como o admin faria.
  comoAdmin()
  for (const [quem, rotulo] of [[cris, "Alfred do Cris"], [gi, "Claude do Giovani"]] as const) {
    const r = await chaves.POST(json("POST", { usuarioId: quem, rotulo }))
    expect(r.status).toBe(201)
    chaveDe[quem] = await r.json()
  }
})
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await db.editor.deleteMany({ where: { id: { in: [ec, em, eb] } } })
  await db.videomaker.delete({ where: { id: vm } })
  await db.usuario.deleteMany({ where: { id: { in: [gi, cris] } } })
  await db.$executeRaw`DELETE FROM limites_publicos WHERE chave LIKE 'mcp:%'`
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("chaves", () => {
  it("sem chave, ou com chave que não existe, não responde", async () => {
    expect((await chamar({ jsonrpc: "2.0", id: 1, method: "tools/list" }, null)).status).toBe(401)
    expect((await chamar({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "nfmcp_inventada")).status).toBe(401)
  })

  it("a do link público só abre o relatório; demanda nenhuma", async () => {
    const r = await (await chamar({ jsonrpc: "2.0", id: 1, method: "tools/list" }, tokenEmpresa)).json()
    expect(r.result.tools.map((t: { name: string }) => t.name)).toEqual(["relatorio_executivo", "listar_meses"])
    const tentativa = await ferramenta(tokenEmpresa, "listar_demandas")
    expect(tentativa.erro).toBe(true)
    expect(tentativa.texto).toMatch(/chave pessoal/)
  })

  it("a da pessoa abre as demandas; só criar_demanda escreve", async () => {
    const r = await (await chamar({ jsonrpc: "2.0", id: 1, method: "tools/list" }, chaveDe[cris].chave)).json()
    const tools = r.result.tools as { name: string; annotations: { readOnlyHint: boolean } }[]
    expect(tools.map((t) => t.name)).toEqual(["listar_demandas", "ler_demanda", "opcoes_para_criar", "criar_demanda"])
    expect(tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name)).toEqual(["criar_demanda"])
  })

  it("o banco guarda o hash, nunca a chave; a lista não mostra nenhum dos dois", async () => {
    const t = await db.tokenMcp.findUniqueOrThrow({ where: { id: chaveDe[cris].id } })
    expect(t.hash).toBe(createHash("sha256").update(chaveDe[cris].chave).digest("hex"))
    comoAdmin()
    const lista = await (await chaves.GET()).text()
    expect(lista).toContain("Alfred do Cris")
    expect(lista).not.toContain(t.hash)
    expect(lista).not.toContain(chaveDe[cris].chave)
  })

  it("quem não gerencia configuração não gera chave", async () => {
    estado.sessao = { user: { id: cris, organizacaoId: a, tipo: "videomaker" } }
    expect((await chaves.POST(json("POST", { usuarioId: cris, rotulo: "Outra" }))).status).toBe(403)
  })
})

describe("leitura como a pessoa", () => {
  it("o admin vê as abertas da empresa, da que vence primeiro", async () => {
    const r = await ferramenta(chaveDe[gi].chave, "listar_demandas")
    expect(ids(r.dados)).toEqual([id("a3"), id("a1"), id("a4")])
    expect(r.dados.demandas[1]).toMatchObject({
      codigo: id("a1"), equipamentos: ["Ultraformer MPT"], status: "Edição", statusInterno: "editando",
      prazo: "2026-11-05", abertoPor: "Giovani Fixture", solicitante: "Dra. Paula", editor: "Cristiano Drummond", briefingCortado: true,
    })
    expect(r.dados.demandas[1].briefing).toHaveLength(601)
  })

  it("o Cris vê só as dele, como na tela", async () => {
    expect(ids((await ferramenta(chaveDe[cris].chave, "listar_demandas")).dados)).toEqual([id("a1")])
    expect(ids((await ferramenta(chaveDe[cris].chave, "listar_demandas", { status: "todas" })).dados).sort()).toEqual([id("a1"), id("a2")])
    const alheia = await ferramenta(chaveDe[cris].chave, "ler_demanda", { id: id("a3") })
    expect(alheia.erro).toBe(true)
    expect(alheia.texto).toContain("não encontrada")
  })

  it("nada de dinheiro nem da outra empresa", async () => {
    const r = await ferramenta(chaveDe[gi].chave, "listar_demandas", { status: "todas" })
    expect(r.texto).not.toMatch(/9876|5\.000|valor|custo/i)
    expect(r.texto).not.toContain(b)
    expect((await ferramenta(chaveDe[gi].chave, "ler_demanda", { id: id("b1") })).texto).toContain("não encontrada")
  })

  it("filtra pelo editor com complemento no nome e pelo status", async () => {
    const r = await ferramenta(chaveDe[gi].chave, "listar_demandas", { editor: "Cristiano Drummond - reels" })
    expect(r.dados.editores).toEqual(["Cristiano Drummond"])
    expect(ids(r.dados)).toEqual([id("a1")])
    expect(ids((await ferramenta(chaveDe[gi].chave, "listar_demandas", { status: "Finalizado" })).dados)).toEqual([id("a2")])
    expect(ids((await ferramenta(chaveDe[gi].chave, "listar_demandas", { status: "editando" })).dados)).toEqual([id("a1")])
    expect((await ferramenta(chaveDe[gi].chave, "listar_demandas", { limite: 1 })).dados).toMatchObject({ total: 3, mostrando: 1 })
  })

  it("editor que não existe: erro com os editores que a pessoa vê", async () => {
    const r = await ferramenta(chaveDe[gi].chave, "listar_demandas", { editor: "Fulano" })
    expect(r.erro).toBe(true)
    expect(r.texto).toContain("Cristiano Drummond, Mariana Souza")
    expect(r.texto).not.toContain("Só da B")
  })

  it("ler_demanda: briefing inteiro, detalhes sem os de dinheiro", async () => {
    const r = await ferramenta(chaveDe[cris].chave, "ler_demanda", { id: id("a1") })
    expect(r.dados.briefing).toBe(briefingLongo)
    expect(r.dados.detalhes).toEqual({ "Copy / legenda": "Legenda do reels" })
    expect(r.texto).not.toMatch(/9876|5\.000|Orçamento/)
  })

  it("cada leitura fica na Auditoria com o nome da pessoa", async () => {
    const e = await db.eventoAuditoria.findFirst({ where: { organizacaoId: a, acao: "mcp.leitura", recurso: "ler_demanda", resultado: "sucesso", atorId: cris } })
    expect(e).toMatchObject({ atorTipo: "humano", recursoId: id("a1") })
  })
})

describe("criar_demanda", () => {
  const pedido = { titulo: "Reels do Ultraformer", briefing: "Gravar a doutora explicando o aparelho em 30 segundos.", departamento: "growth", tipo: "reels", equipamentos: ["ultraformer mpt"], prazo: "2027-01-10" }

  it("opcoes_para_criar diz o que a empresa aceita", async () => {
    const r = await ferramenta(chaveDe[cris].chave, "opcoes_para_criar")
    expect(r.dados.equipamentos).toEqual(["Ultraformer MPT"])
    expect(r.dados.departamentos.map((d: { valor: string }) => d.valor)).toContain("growth")
  })

  it("cria em nome do Cris, pelas regras dele, marcada com a chave", async () => {
    const r = await ferramenta(chaveDe[cris].chave, "criar_demanda", pedido)
    expect(r.erro).toBe(false)
    const d = await db.demanda.findUniqueOrThrow({
      where: { id: r.dados.id },
      include: { produtos: true, historicos: true },
    })
    const regra = await entradaDoPedidoInterno({ usuarioId: cris, gestor: false }, a, false)
    expect(d).toMatchObject({ organizacaoId: a, solicitanteId: cris, mcpTokenId: chaveDe[cris].id, statusInterno: regra.statusInterno, dataLimite: new Date("2027-01-10") })
    expect(d.produtos.map((x) => x.produtoId)).toEqual([prod])
    expect(d.historicos).toHaveLength(1)
    expect(d.historicos[0]).toMatchObject({ usuarioId: cris, origem: "ia" })
    expect(d.historicos[0].observacao).toContain("pelo assistente (MCP)")
    const e = await db.eventoAuditoria.findFirst({ where: { organizacaoId: a, acao: "mcp.criar", recursoId: d.id } })
    expect(e).toMatchObject({ atorTipo: "humano", atorId: cris, resultado: "sucesso" })
  })

  it("o mesmo título de novo em 10 minutos é recusado", async () => {
    const r = await ferramenta(chaveDe[cris].chave, "criar_demanda", pedido)
    expect(r.erro).toBe(true)
    expect(r.texto).toMatch(/já criou "Reels do Ultraformer"/)
  })

  it("equipamento e departamento errados voltam como erro para corrigir", async () => {
    const semEquip = await ferramenta(chaveDe[cris].chave, "criar_demanda", { ...pedido, titulo: "Outro", equipamentos: ["Aparelho X"] })
    expect(semEquip.texto).toMatch(/Equipamento não encontrado: Aparelho X/)
    const semDepto = await ferramenta(chaveDe[cris].chave, "criar_demanda", { ...pedido, titulo: "Outro", departamento: "inventado" })
    expect(semDepto.texto).toMatch(/Departamento inválido/)
  })
})

describe("desfazer pela tela", () => {
  it("apaga só o que ninguém mexeu, e registra quem desfez", async () => {
    const intocada = (await ferramenta(chaveDe[cris].chave, "criar_demanda", { titulo: "Pedido que deu errado", briefing: "Criado por engano pelo assistente.", departamento: "growth", tipo: "reels" })).dados
    const mexida = (await ferramenta(chaveDe[cris].chave, "criar_demanda", { titulo: "Pedido que a equipe comentou", briefing: "Alguém comentou neste pedido.", departamento: "growth", tipo: "reels" })).dados
    await db.comentario.create({ data: { demandaId: mexida.id, usuarioId: gi, comentario: "Já estou vendo isto." } })

    comoAdmin()
    const lista = await (await daChave.GET(json("GET"), params(chaveDe[cris].id))).json()
    const motivo = (codigo: string) => lista.demandas.find((d: { codigo: string }) => d.codigo === codigo)?.motivoParaManter
    expect(motivo(intocada.codigo)).toBeNull()
    expect(motivo(mexida.codigo)).toBe("tem comentário")

    const r = await (await daChave.POST(json("POST"), params(chaveDe[cris].id))).json()
    expect(r.apagadas).toContain(intocada.codigo)
    expect(r.mantidas).toContainEqual({ codigo: mexida.codigo, motivo: "tem comentário" })
    expect(await db.demanda.count({ where: { id: intocada.id } })).toBe(0)
    expect(await db.demanda.count({ where: { id: mexida.id } })).toBe(1)
    // Demandas que não vieram do assistente nunca entram na conta.
    expect(await db.demanda.count({ where: { id: { in: [id("a1"), id("a3"), id("a4")] } } })).toBe(3)
    const e = await db.eventoAuditoria.findFirst({ where: { organizacaoId: a, acao: "mcp.desfazer", recursoId: intocada.id } })
    expect(e).toMatchObject({ atorTipo: "humano", atorId: gi })
  })

  it("a chave de outra empresa não acha nada para desfazer", async () => {
    estado.sessao = { user: { id: gi, organizacaoId: a, tipo: "admin" } }
    const r = await (await daChave.GET(json("GET"), params("chave-de-outra-empresa"))).json()
    expect(r.demandas).toEqual([])
  })

  it("quem não pode excluir demanda não desfaz", async () => {
    estado.sessao = { user: { id: cris, organizacaoId: a, tipo: "videomaker" } }
    expect((await daChave.POST(json("POST"), params(chaveDe[cris].id))).status).toBe(403)
  })
})

describe("revogar e freios", () => {
  it("revogada, a chave para na hora; o que ela criou continua listado", async () => {
    comoAdmin()
    expect((await chaves.PATCH(json("PATCH", { id: chaveDe[cris].id }))).status).toBe(200)
    expect((await chamar({ jsonrpc: "2.0", id: 1, method: "tools/list" }, chaveDe[cris].chave)).status).toBe(401)
    const lista = await (await daChave.GET(json("GET"), params(chaveDe[cris].id))).json()
    expect(lista.demandas.length).toBeGreaterThan(0)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: a, acao: "mcp.chave", recursoId: chaveDe[cris].id } })).toBe(2)
  })

  it("pessoa inativa: a chave dela para junto com o login", async () => {
    await db.usuario.update({ where: { id: gi }, data: { status: "inativo" } })
    try {
      expect((await chamar({ jsonrpc: "2.0", id: 1, method: "tools/list" }, chaveDe[gi].chave)).status).toBe(401)
    } finally {
      await db.usuario.update({ where: { id: gi }, data: { status: "ativo" } })
    }
  })

  it("mês inválido no relatório continua com a mensagem clara", async () => {
    const r = await ferramenta(tokenEmpresa, "relatorio_executivo", { mes: "2026-13" })
    expect(r.erro).toBe(true)
    expect(r.texto).toBe("Mês inválido")
  })

  it("passou de 60 por minuto, recusa até a janela virar", async () => {
    const impressao = createHash("sha256").update(tokenEmpresa).digest("hex").slice(0, 12)
    await db.$executeRaw`INSERT INTO limites_publicos (chave, "janelaInicio", contagem) VALUES (${`mcp:${impressao}`}, now(), 60)
      ON CONFLICT (chave) DO UPDATE SET contagem = 60, "janelaInicio" = now()`
    const r = await ferramenta(tokenEmpresa, "listar_meses")
    expect(r.erro).toBe(true)
    expect(r.texto).toMatch(/Limite de 60 consultas por minuto/)
  })
})
