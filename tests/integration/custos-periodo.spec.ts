import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET, POST } from "@/app/api/custos-videomaker/route"
const p = `custo-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`, vm = `${p}-vm`
const req = (query: string) => new NextRequest(`http://localhost/api/custos-videomaker?${query}`)
const post = (dataReferencia: string) => POST(new NextRequest("http://localhost/api/custos-videomaker", { method: "POST", body: JSON.stringify({ videomakerId: vm, valor: 25, dataReferencia }) }))
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "sem-login" } })
  await db.usuarioOrganizacao.create({ data: { usuarioId: u, organizacaoId: a, papel: "admin", areas: [] } })
  await db.videomaker.create({ data: { id: vm, nome: vm, redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
  await db.videomakerOrganizacao.create({ data: { organizacaoId: a, videomakerId: vm } })
  for (const [s,iso,valor,pago] of [
    ["antes","2026-09-01T02:59:59.999Z",1,false],
    ["inicio","2026-09-01T03:00:00.000Z",10,true],
    ["dentro","2026-09-15T15:00:00.000Z",20,false],
    ["fim","2026-10-01T02:59:59.999Z",30,false],
    ["depois","2026-10-01T03:00:00.000Z",100,false],
  ] as const) await db.custoVideomaker.create({ data: { id: `${p}-${s}`, organizacaoId: a, videomakerId: vm, dataReferencia: new Date(iso), valor, pago } })
  await db.custoVideomaker.create({ data: { id: `${p}-b-custo`, organizacaoId: b, videomakerId: vm, dataReferencia: new Date("2026-09-15T12:00:00Z"), valor: 999 } })
})
beforeEach(() => { estado.sessao = { user: { id: u, organizacaoId: a, tipo: "admin" } } })
afterAll(async () => { await db.organizacao.deleteMany({ where: { id: { in: [a,b] } } }); await db.videomaker.delete({ where: { id: vm } }); await db.usuario.delete({ where: { id: u } }); await Promise.all([db.$disconnect(),prismaAuth.$disconnect()]) })
describe("filtro real de custos", () => {
  it("ambos os limites preservam início e fim de dia e reconciliam lista/totais", async () => {
    const response = await GET(req("de=2026-09-01&ate=2026-09-30")); const r = await response.json()
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store")
    expect(r.custos.map((c: {id: string}) => c.id)).toEqual([`${p}-fim`,`${p}-dentro`,`${p}-inicio`])
    expect(r.resumo).toEqual({ totalGasto: 60, totalPago: 10, totalPendente: 50 }); expect(r.porVideomaker[0].total).toBe(60)
  })
  it.each([["de=2026-09-01",160],["ate=2026-09-30",61],["",161],["de=2026-09-30&ate=2026-09-30",30]])("limite opcional %s", async (q,total) => expect((await (await GET(req(q))).json()).resumo.totalGasto).toBe(total))
  it("combina período com pago/videomaker sem abrir outra empresa", async () => {
    const r = await (await GET(req(`de=2026-09-01&ate=2026-09-30&pago=true&videomakerId=${vm}`))).json()
    expect(r.custos).toHaveLength(1); expect(r.resumo.totalGasto).toBe(10)
    estado.sessao!.user.organizacaoId = b
    expect((await GET(req("de=2026-09-01"))).status).toBe(403)
  })
  it.each([["de=2026-02-30","de"],["ate=texto","ate"],["de=2026-09-30&ate=2026-09-01","ate"]])("rejeita %s com campo", async (q,campo) => {
    const response = await GET(req(q)); expect(response.status).toBe(400); expect((await response.json()).campos[campo]).toBeTruthy()
  })
  it("novo lançamento de data simples cai no mesmo dia brasileiro, sem regravar o passado", async () => {
    const r = await post("2026-10-03"); expect(r.status).toBe(201)
    const { custo } = await r.json(); expect(custo.dataReferencia).toBe("2026-10-03T03:00:00.000Z")
    const l = await (await GET(req("de=2026-10-03&ate=2026-10-03"))).json(); expect(l.custos[0].id).toBe(custo.id)
    expect((await db.custoVideomaker.findUniqueOrThrow({ where: { id: `${p}-antes` } })).dataReferencia.toISOString()).toBe("2026-09-01T02:59:59.999Z")
    expect((await post("2026-02-30")).status).toBe(400)
  })
})
