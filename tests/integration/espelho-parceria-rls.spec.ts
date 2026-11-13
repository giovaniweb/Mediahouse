import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import pg from "pg"

// Parceria × espelho automático com RLS LIGADO (13/11/2026, revisão do PR #153).
// A rota roda com o `prisma` da aplicação conectado como app_user (sem BYPASSRLS)
// e com a extensão de RLS, como fica em produção depois da janela de 17–18/11:
//   1. a GH aceita a parceria: a sessão é da GH, mas os vínculos e os cards são
//      da Contourline — antes do conserto a leitura voltava vazia e nada espelhava;
//   2. a Contourline encerra: os espelhos dos DOIS sentidos são revogados — antes,
//      só a origem consegue escrever na aresta, e o que ela recebeu ficava ativo.
const { estado, pendentes, acesso } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
  pendentes: [] as Promise<unknown>[],
  acesso: { role: `teste_parc_${Math.random().toString(36).slice(2, 10)}`, senha: `s${Math.random().toString(36).slice(2)}${Date.now()}` },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({
  emSegundoPlano: (tarefa: () => Promise<unknown>) => { pendentes.push(Promise.resolve().then(tarefa).catch(() => null)) },
}))
// O `prisma` da aplicação passa a ser o app_user com RLS; `prismaBase` segue o dono (semente).
vi.mock("@/lib/prisma", async () => {
  const real = await vi.importActual<typeof import("@/lib/prisma")>("@/lib/prisma")
  const { PrismaClient } = await import("@prisma/client")
  const { PrismaPg } = await import("@prisma/adapter-pg")
  const { comRls } = await import("@/lib/prisma-rls")
  const url = new URL(process.env.DATABASE_URL_TEST!)
  url.username = acesso.role
  url.password = acesso.senha
  const cru = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  return { ...real, RLS_ATIVO: true, prisma: comRls(cru), prismaAppUser: cru }
})

import { prisma, prismaBase as db } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { PATCH as responderParceria } from "@/app/api/parcerias/[id]/route"

const p = `prls-${randomUUID().slice(0, 8)}`
const org = { dona: `${p}-contourline`, gh: `${p}-gh` }
const gente = { debora: `${p}-debora`, gabriel: `${p}-gabriel` }
const vm = { gabriel: `${p}-vm-gabriel` }
const cards = { a: `${p}-a`, b: `${p}-b`, fim: `${p}-fim`, daGh: `${p}-da-gh` }
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST })
let parceriaId = ""

function como(id: string, organizacaoId: string) {
  estado.sessao = { user: { id, organizacaoId, tipo: "admin", papel: "admin", name: id } }
}
const patch = (acao: string) => responderParceria(
  new NextRequest(`http://localhost/api/parcerias/${parceriaId}`, { method: "PATCH", body: JSON.stringify({ acao }) }),
  { params: Promise.resolve({ id: parceriaId }) },
)
async function esperarAvisos() { while (pendentes.length) await pendentes.shift() }
const ativas = (origem: string, destino: string) =>
  db.demandaCompartilhamento.findMany({ where: { organizacaoOrigemId: origem, organizacaoDestinoId: destino, revogadoEm: null }, select: { demandaId: true } })

beforeAll(async () => {
  await admin.connect()
  await admin.query(`CREATE ROLE "${acesso.role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${acesso.senha}'`)
  await admin.query(`GRANT app_user TO "${acesso.role}"`)

  await db.organizacao.createMany({ data: [
    { id: org.dona, nome: `Contourline ${p}`, slug: org.dona },
    { id: org.gh, nome: `GH ${p}`, slug: org.gh },
  ] })
  for (const id of Object.values(gente)) {
    await db.usuario.create({ data: { id, nome: id, email: `${id}@exemplo.test`, tipo: "admin", senhaHash: "sem-login" } })
  }
  await db.usuarioOrganizacao.createMany({ data: [
    { usuarioId: gente.debora, organizacaoId: org.dona, papel: "admin", categoria: "interna", areas: ["audiovisual"] },
    { usuarioId: gente.gabriel, organizacaoId: org.gh, papel: "admin", categoria: "interna", areas: ["audiovisual"] },
  ] })
  await db.videomaker.create({ data: { id: vm.gabriel, nome: `Gabriel ${p}`, usuarioId: gente.gabriel } })
  // "Empresa dele: GH" gravada na Contourline, com a parceria ainda pendente.
  await db.videomakerOrganizacao.create({ data: { organizacaoId: org.dona, videomakerId: vm.gabriel, organizacaoExecutoraId: org.gh } })
  const base = {
    organizacaoId: org.dona, descricao: "Teste", cidade: "Curitiba", tipoVideo: "reels", departamento: "eventos",
    solicitanteId: gente.debora, videomakerId: vm.gabriel,
  }
  await db.demanda.createMany({ data: [
    { ...base, id: cards.a, codigo: cards.a, titulo: "Aberto A", statusInterno: "videomaker_aceitou", statusVisivel: "producao" },
    { ...base, id: cards.b, codigo: cards.b, titulo: "Aberto B", statusInterno: "videomaker_notificado", statusVisivel: "producao" },
    { ...base, id: cards.fim, codigo: cards.fim, titulo: "Concluído", statusInterno: "encerrado", statusVisivel: "finalizado", finalizadaEm: new Date() },
  ] })
  const parceria = await db.parceriaOrganizacao.create({ data: {
    organizacaoConvidanteId: org.dona, organizacaoConvidadaId: org.gh, nomeConvidante: "", nomeConvidada: "", criadoPorId: gente.debora,
  } })
  parceriaId = parceria.id
})

afterAll(async () => {
  await esperarAvisos()
  const orgs = { in: Object.values(org) }
  await db.alertaIA.deleteMany({ where: { organizacaoId: orgs } })
  await db.demanda.deleteMany({ where: { organizacaoId: orgs } })
  await db.parceriaOrganizacao.deleteMany({ where: { id: parceriaId } })
  await db.videomaker.deleteMany({ where: { id: { in: Object.values(vm) } } })
  await db.organizacao.deleteMany({ where: { id: orgs } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(gente) } } })
  const cru = (await import("@/lib/prisma") as unknown as { prismaAppUser: { $disconnect(): Promise<void> } }).prismaAppUser
  await cru.$disconnect()
  await db.$disconnect()
  await admin.query(`DROP ROLE IF EXISTS "${acesso.role}"`)
  await admin.end()
})

it("o teste roda mesmo sob RLS: na GH, o app_user não enxerga o vínculo nem os cards da Contourline", async () => {
  await comOrg(org.gh, async () => {
    expect(await prisma.videomakerOrganizacao.count({ where: { organizacaoId: org.dona } })).toBe(0)
    expect(await prisma.demanda.count({ where: { organizacaoId: org.dona } })).toBe(0)
  })
  await comOrg(org.dona, async () => {
    expect(await prisma.videomakerOrganizacao.count({ where: { organizacaoId: org.dona } })).toBe(1)
  })
})

it("1. a GH aceita a parceria (sessão da GH): os 2 cards abertos da Contourline são espelhados, o concluído não", async () => {
  como(gente.gabriel, org.gh)
  const res = await patch("aceitar")
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ status: "aceita", espelhados: 2 })
  await esperarAvisos()
  const arestas = await ativas(org.dona, org.gh)
  expect(new Set(arestas.map((a) => a.demandaId))).toEqual(new Set([cards.a, cards.b]))
  // E a GH, sob RLS, passa a ler os dois cards pelo espelho.
  await comOrg(org.gh, async () => {
    expect(await prisma.demanda.count({ where: { id: { in: [cards.a, cards.b, cards.fim] } } })).toBe(2)
  })
})

it("2. a Contourline encerra: revoga o que ela mandou E o que ela recebeu da GH", async () => {
  // Um card da GH terceirizado à mão para a Contourline (sentido contrário).
  await db.demanda.create({ data: {
    id: cards.daGh, codigo: cards.daGh, organizacaoId: org.gh, titulo: "Da GH", descricao: "Teste", cidade: "Curitiba",
    tipoVideo: "reels", departamento: "eventos", solicitanteId: gente.gabriel, statusInterno: "videomaker_notificado", statusVisivel: "producao",
  } })
  await db.demandaCompartilhamento.create({ data: {
    demandaId: cards.daGh, organizacaoOrigemId: org.gh, organizacaoDestinoId: org.dona, nomeOrigem: "", nomeDestino: "", escopo: "executar", criadoPorId: gente.gabriel,
  } })
  // Independente do teste 1: garante os 2 espelhos da Contourline para a GH.
  for (const demandaId of [cards.a, cards.b]) {
    if (!(await ativas(org.dona, org.gh)).some((a) => a.demandaId === demandaId)) {
      await db.demandaCompartilhamento.create({ data: {
        demandaId, organizacaoOrigemId: org.dona, organizacaoDestinoId: org.gh, nomeOrigem: "", nomeDestino: "", escopo: "executar", criadoPorId: gente.debora,
      } })
    }
  }
  expect(await ativas(org.gh, org.dona)).toHaveLength(1)
  expect(await ativas(org.dona, org.gh)).toHaveLength(2)

  como(gente.debora, org.dona)
  const res = await patch("encerrar")
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ status: "encerrada" })
  await esperarAvisos()

  expect(await ativas(org.dona, org.gh)).toHaveLength(0)
  expect(await ativas(org.gh, org.dona)).toHaveLength(0)
  // E, sob RLS, a GH já não lê os cards da Contourline nem a Contourline o da GH.
  await comOrg(org.gh, async () => {
    expect(await prisma.demanda.count({ where: { id: { in: [cards.a, cards.b] } } })).toBe(0)
  })
  await comOrg(org.dona, async () => {
    expect(await prisma.demanda.count({ where: { id: cards.daGh } })).toBe(0)
  })
})
