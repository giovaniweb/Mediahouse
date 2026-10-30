// O MCP pelo login real da aplicação (app_user/app_auth, RLS ligada). O token
// resolve a empresa antes de haver sessão; daí em diante o banco só devolve o
// que é dela — as demandas, os nomes de quem abriu e editou, a auditoria.
import { beforeAll, afterAll, describe, it, expect } from "vitest"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { NextRequest } from "next/server"
import { prismaBase } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { POST } from "@/app/api/mcp/route"

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST }) })
const p = `mcprls-${randomUUID()}`
const a = `${p}-a`, b = `${p}-b`, u = `${p}-u`, ed = `${p}-ed`, prod = `${p}-prod`, token = `${p}-token`

async function ferramenta(name: string, args: Record<string, unknown> = {}) {
  const r = await POST(new NextRequest("http://ensaio.invalid/api/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  }))
  const j = await r.json()
  return { erro: j.result.isError === true, texto: j.result.content[0].text as string }
}

beforeAll(async () => {
  await admin.organizacao.createMany({ data: [{ id: a, nome: a, slug: a, relatorioToken: token }, { id: b, nome: b, slug: b }] })
  await admin.usuario.create({ data: { id: u, nome: "Quem abriu", email: `${u}@example.invalid`, tipo: "solicitante", senhaHash: "sem-login-real" } })
  await admin.usuarioOrganizacao.create({ data: { usuarioId: u, organizacaoId: a, papel: "solicitante", areas: [] } })
  await admin.editor.create({ data: { id: ed, nome: "Editor Ensaio", especialidade: [], habilidades: [], redesSociais: [], areasAtuacao: [], equipamentos: [] } })
  await admin.produto.create({ data: { id: prod, organizacaoId: a, nome: "Aparelho Ensaio" } })
  for (const [s, org] of [["da", a], ["db", b]] as const) {
    await admin.demanda.create({ data: { id: `${p}-${s}`, codigo: `${p}-${s}`, titulo: s, descricao: `Briefing ${s}`, departamento: "teste",
      tipoVideo: "reels", cidade: "Teste", organizacaoId: org, solicitanteId: u, editorId: ed, statusVisivel: "edicao", statusInterno: "editando" } })
  }
  await admin.demandaProduto.create({ data: { demandaId: `${p}-da`, produtoId: prod } })
})

afterAll(async () => {
  await admin.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await admin.editor.deleteMany({ where: { id: ed } })
  await admin.usuario.deleteMany({ where: { id: u } })
  await admin.$executeRaw`DELETE FROM limites_publicos WHERE chave LIKE 'mcp:%'`
  await Promise.all([admin.$disconnect(), prismaAuth.$disconnect(), prismaBase.$disconnect()])
})

describe("MCP sob RLS", () => {
  it("lista e lê só a empresa do token, com os nomes ligados", async () => {
    const lista = await ferramenta("listar_demandas", { editor: "Editor Ensaio" })
    expect(lista.erro).toBe(false)
    const dados = JSON.parse(lista.texto)
    expect(dados.demandas).toHaveLength(1)
    expect(dados.demandas[0]).toMatchObject({ id: `${p}-da`, abertoPor: "Quem abriu", editor: "Editor Ensaio", equipamentos: ["Aparelho Ensaio"] })

    expect((await ferramenta("ler_demanda", { id: `${p}-da` })).erro).toBe(false)
    expect((await ferramenta("ler_demanda", { id: `${p}-db` })).texto).toContain("não encontrada")
  })

  it("a auditoria grava na empresa do token", async () => {
    const eventos = await admin.eventoAuditoria.findMany({ where: { organizacaoId: a, acao: "mcp.leitura" } })
    expect(eventos.map((e) => `${e.recurso}:${e.resultado}`).sort()).toEqual(["ler_demanda:falha", "ler_demanda:sucesso", "listar_demandas:sucesso"])
  })
})
