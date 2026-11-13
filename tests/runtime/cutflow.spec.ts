// O plugin Cutflow pelo login real da aplicação (app_user/app_auth, RLS ligada).
// O plugin não tem sessão do navegador: a empresa sai do Bearer, por
// org_por_credencial. Até 13/11/2026 `autenticarCutflow` declarava a empresa
// dentro dela mesma, e a declaração sumia ao voltar para a rota: com RLS, o
// /api/cutflow/eu respondia "usuario: null, empresa: null", a fila vinha vazia
// e o "Sair" não revogava nada. Achado no ensaio de novembro.
import { beforeAll, afterAll, describe, it, expect } from "vitest"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { NextRequest } from "next/server"
import { prismaBase } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { hashCutflow } from "@/lib/cutflow"
import { comOrg } from "@/lib/org-contexto"
import { GET as eu } from "@/app/api/cutflow/eu/route"
import { GET as fila } from "@/app/api/cutflow/fila/route"
import { DELETE as sair } from "@/app/api/cutflow/sessao/route"

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST }) })
const p = `cfrls-${randomUUID()}`
const a = `${p}-a`, b = `${p}-b`, u = `${p}-u`, ed = `${p}-ed`, edB = `${p}-edb`, sessao = `${p}-s`
const token = `${p}-token-do-plugin-com-folga`

const chamar = <T>(rota: (r: NextRequest) => Promise<T>, metodo = "GET") =>
  rota(new NextRequest(`http://ensaio.invalid/api/cutflow`, { method: metodo, headers: { authorization: `Bearer ${token}` } }))

beforeAll(async () => {
  // Como no servidor: o rastreio de contexto do Node já está ligado (outra
  // requisição já usou comOrg). Sem isso, o enterWith de um processo "virgem"
  // escapa para quem chamou e o teste passaria até com o código quebrado.
  await comOrg(null, async () => {})
  await admin.organizacao.createMany({ data: [{ id: a, nome: "Empresa do plugin", slug: a }, { id: b, nome: "Outra", slug: b }] })
  await admin.usuario.create({ data: { id: u, nome: "Editora do Premiere", email: `${u}@example.invalid`, tipo: "editor", senhaHash: "sem-login-real" } })
  await admin.usuarioOrganizacao.create({ data: { usuarioId: u, organizacaoId: a, papel: "editor", areas: [] } })
  await admin.permissaoUsuario.create({ data: { usuarioId: u, organizacaoId: a, usarCutflow: true } })
  await admin.moduloOrganizacao.create({ data: { organizacaoId: a, modulo: "cutflow", ativo: true } })
  for (const [id, org] of [[ed, a], [edB, b]] as const) {
    await admin.editor.create({ data: { id, nome: "Cutflow", especialidade: [], habilidades: [], redesSociais: [], areasAtuacao: [], equipamentos: [] } })
    await admin.editorOrganizacao.create({ data: { editorId: id, organizacaoId: org } })
  }
  for (const [s, org, editorId] of [["da", a, ed], ["db", b, edB]] as const) {
    await admin.demanda.create({ data: { id: `${p}-${s}`, codigo: `${p}-${s}`, titulo: `card ${s}`, descricao: `Briefing ${s}`, departamento: "teste",
      tipoVideo: "reels", cidade: "Teste", organizacaoId: org, solicitanteId: u, editorId, statusVisivel: "edicao", statusInterno: "editando" } })
  }
  await admin.cutflowSessao.create({ data: {
    id: sessao, organizacaoId: a, usuarioId: u, dispositivoHash: hashCutflow(`${p}-dispositivo`), tokenHash: hashCutflow(token),
    nomeComputador: "Mac do ensaio", entregueEm: new Date(), ultimoUsoEm: new Date(), expiraEm: new Date(Date.now() + 86_400_000),
  } })
})

afterAll(async () => {
  await admin.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await admin.editor.deleteMany({ where: { id: { in: [ed, edB] } } })
  await admin.usuario.deleteMany({ where: { id: u } })
  await Promise.all([admin.$disconnect(), prismaAuth.$disconnect(), prismaBase.$disconnect()])
})

describe("Cutflow sob RLS", () => {
  it("/eu mostra quem está logado e em que empresa", async () => {
    const r = await chamar(eu)
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({
      usuario: { nome: "Editora do Premiere" }, empresa: { nome: "Empresa do plugin" }, organizacaoId: a,
    })
  })

  it("a fila traz o card da empresa da sessão, e só ele", async () => {
    const r = await chamar(fila)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.aviso).toBeUndefined()
    expect(j.fila.map((d: { id: string }) => d.id)).toEqual([`${p}-da`])
  })

  it("Sair revoga a sessão deste computador", async () => {
    const r = await chamar(sair, "DELETE")
    expect(r.status).toBeLessThan(300)
    const s = await admin.cutflowSessao.findUnique({ where: { id: sessao }, select: { revogadaEm: true } })
    expect(s?.revogadaEm).not.toBeNull()
    expect((await chamar(eu)).status).toBe(401)
  })
})
