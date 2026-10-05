import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as dashboard } from "@/app/api/dashboard/metrics/route"
import { GET as listar } from "@/app/api/demandas/route"

// Dashboard e histórico por departamento: Growth pelas colunas próprias, Social
// Media pelos pedidos com socialId, sempre só da empresa da sessão.
const p = `dep-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`
const req = (url: string) => new NextRequest(`http://localhost${url}`)
const json = async (r: Response) => r.json()

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-05T15:00:00Z"))
  await db.organizacao.createMany({ data: [a, b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: "Ana Social", tipo: "admin", senhaHash: "teste" } })
  await db.usuarioOrganizacao.create({ data: { organizacaoId: a, usuarioId: u, papel: "admin", areas: [] } })
  const base = { descricao: "Fixture", departamento: "teste", tipoVideo: "reels", cidade: "Teste", solicitanteId: u }
  for (const [s, org, area, visivel, interno, extra] of [
    ["g-fazendo", a, "design", "edicao", "editando", { responsavelId: u, dataLimite: new Date("2026-10-01T00:00:00Z") }],
    ["g-backlog", a, "design", "entrada", "pedido_criado", {}],
    ["g-fim", a, "design", "finalizado", "entregue_cliente", { finalizadaEm: new Date("2026-10-02T12:00:00Z") }],
    ["s-produz", a, "audiovisual", "producao", "planejamento", { socialId: u, dataLimite: new Date("2026-10-03T00:00:00Z") }],
    ["s-revisar", a, "design", "aprovacao", "revisao_pendente", { socialId: u }],
    ["s-recusado", a, "audiovisual", "entrada", "encerrado", { socialId: u }],
    ["s-fim", a, "audiovisual", "finalizado", "entregue_cliente", { socialId: u, finalizadaEm: new Date("2026-10-04T12:00:00Z") }],
    ["av-fim", a, "audiovisual", "finalizado", "entregue_cliente", { finalizadaEm: new Date("2026-10-04T12:00:00Z") }],
    ["outra", b, "audiovisual", "producao", "planejamento", { socialId: u }],
  ] as const) {
    const id = `${p}-${s}`
    await db.demanda.create({ data: { ...base, ...extra, id, organizacaoId: org, area, codigo: id, titulo: id, statusVisivel: visivel, statusInterno: interno } })
  }
  // A última mudança do pedido em produção foi há 4 dias: parado.
  await db.historicoStatus.create({ data: { demandaId: `${p}-s-produz`, statusAnterior: "aguardando_triagem", statusNovo: "planejamento", createdAt: new Date("2026-10-01T12:00:00Z") } })
  estado.sessao = { user: { id: u, organizacaoId: a, tipo: "admin" } }
})
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await db.usuario.delete({ where: { id: u } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
  vi.useRealTimers()
})

describe("dashboard por departamento", () => {
  it("departamento desconhecido é recusado", async () => {
    expect((await dashboard(req("/api/dashboard/metrics?departamento=design"))).status).toBe(400)
  })

  it("Growth: colunas do quadro, atraso e quem está com o quê", async () => {
    const r = await json(await dashboard(req("/api/dashboard/metrics?departamento=growth")))
    expect(r.departamento).toBe("growth")
    const col = Object.fromEntries(r.growth.colunas.map((c: { id: string; demandas: number }) => [c.id, c.demandas]))
    expect(col).toMatchObject({ backlog: 1, fazendo: 1, para_aprovacao: 1 })
    expect(r.growth.ativas).toBe(3) // g-fazendo, g-backlog e o pedido de arte da social
    expect(r.growth.atrasadas).toBe(1)
    expect(r.growth.pessoas).toEqual([{ id: u, nome: "Ana Social", abertas: 1 }])
    expect(r.gargalos.map((g: { etapa: string }) => g.etapa)).toContain("fazendo")
  })

  it("Social Media: só pedidos com socialId desta empresa, recusado fora", async () => {
    const r = await json(await dashboard(req("/api/dashboard/metrics?departamento=social")))
    const etapas = Object.fromEntries(r.social.etapas.map((e: { id: string; demandas: number }) => [e.id, e.demandas]))
    expect(etapas).toEqual({ recebido: 0, produzindo: 1, revisar: 1, pronto: 0 })
    expect(r.social.atrasados.map((x: { id: string; dias: number }) => [x.id, x.dias])).toEqual([[`${p}-s-produz`, 2]])
    expect(r.social.parados.map((x: { id: string; dias: number }) => [x.id, x.dias])).toEqual([[`${p}-s-produz`, 4]])
  })
})

describe("histórico por departamento", () => {
  it("?social=1 traz só os pedidos da social; a área recorta Audiovisual e Growth", async () => {
    const ids = async (q: string) => (await json(await listar(req(`/api/demandas?statusVisivel=finalizado&${q}`)))).demandas.map((d: { id: string }) => d.id).sort()
    expect(await ids("social=1")).toEqual([`${p}-s-fim`])
    expect(await ids("area=design")).toEqual([`${p}-g-fim`])
    expect(await ids("area=audiovisual")).toEqual([`${p}-av-fim`, `${p}-s-fim`].sort())
  })

  it("prazo do quadro filtra por dia de vencimento", async () => {
    const r = await json(await listar(req("/api/demandas?filaTrabalho=1&prazoDe=2026-10-01&prazoAte=2026-10-01")))
    expect(r.demandas.map((d: { id: string }) => d.id)).toEqual([`${p}-g-fazendo`])
    expect((await listar(req("/api/demandas?prazoDe=2026-10-05&prazoAte=2026-10-01"))).status).toBe(400)
  })
})
