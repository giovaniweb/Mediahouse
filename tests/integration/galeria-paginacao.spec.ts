import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as privada } from "@/app/api/biblioteca/route"
import { GET as publica } from "@/app/api/publico/galeria/route"
import { GET as growth } from "@/app/api/growth/galeria/route"
const p = `gal-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`
const req = (qs = "") => new NextRequest(`http://localhost/api/test?${qs}`)
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "sem-login" } })
  await db.usuarioOrganizacao.create({ data: { usuarioId: u, organizacaoId: a, papel: "admin", areas: [] } })
  for (const [nome,org,area,final] of [["recente",a,"audiovisual","2026-09-20"],["anexo",a,"audiovisual",null],["junho",a,"audiovisual","2026-06-01"],["legado",a,"audiovisual",null],["growth",a,"design",null],["outra",b,"audiovisual","2026-09-29"]] as const) {
    const id = `${p}-${nome}`
    await db.demanda.create({ data: { id, organizacaoId: org, area, codigo: id, titulo: nome, descricao: "Fixture", departamento: "teste", tipoVideo: "reels", cidade: "Teste", solicitanteId: u, statusVisivel: "finalizado", finalizadaEm: final ? new Date(final) : null, updatedAt: new Date("2026-05-01"), linkFinal: nome === "legado" ? "https://example.invalid/legado.mp4" : null } })
  }
  for (const [id,d,created,pub] of [["f1","recente","2026-09-01",true],["f2","recente","2026-09-02",true],["fa","anexo","2026-09-18",true],["fj","junho","2026-05-01",true],["fg","growth","2026-09-25",false],["fo","outra","2026-09-29",true]] as const) {
    const url = `https://example.invalid/${id}.mp4`
    await db.arquivo.create({ data: { id: `${p}-${id}`, demandaId: `${p}-${d}`, tipoArquivo: "final", nomeArquivo: `${id}.mp4`, url, createdAt: new Date(created), publicadoEm: pub ? new Date("2026-05-01") : null, publicacaoUrl: pub ? url : null } })
  }
  await db.arquivo.create({ data: { id: `${p}-duplicado`, demandaId: `${p}-recente`, tipoArquivo: "final", nomeArquivo: "duplicado", url: "https://example.invalid/f1.mp4", createdAt: new Date("2026-09-01"), publicadoEm: new Date(), publicacaoUrl: "javascript:invalido" } })
})
beforeEach(() => { estado.sessao = { user: { id: u, organizacaoId: a, tipo: "admin" } } })
afterAll(async () => { await db.organizacao.deleteMany({ where: { id: { in: [a,b] } } }); await db.usuario.delete({ where: { id: u } }); await Promise.all([db.$disconnect(),prismaAuth.$disconnect()]) })
describe("paginação das galerias", () => {
  it("conta entregáveis, limita cada página e não perde/repete itens", async () => {
    const paginas = []
    for (let page=1;page<=3;page++) paginas.push(await (await privada(req(`page=${page}&limit=2`))).json())
    expect(paginas.map(r => r.videos.length)).toEqual([2,2,1]); expect(paginas.every(r => r.total === 5 && r.totalPages === 3 && r.unidadePaginacao === "entregaveis")).toBe(true)
    const itens = paginas.flatMap(r => r.videos); expect(new Set(itens.map(v => v.id)).size).toBe(5)
    expect(itens.map(v => v.titulo)).toEqual(["recente","recente","anexo","junho","legado"])
    expect(itens[4].dataEstimada).toBe(true); expect(itens[2].origemData).toBe("anexacao")
  })
  it("busca tem o mesmo total/unidade e Growth aceita arquivo sem linkFinal", async () => {
    const busca = await (await privada(req("search=recente&limit=1"))).json(); expect(busca.total).toBe(2); expect(busca.videos).toHaveLength(1)
    const g = await (await growth(req())).json(); expect(g.total).toBe(1); expect(g.videos[0].id).toBe(`${p}-fg`)
    expect((await (await privada(req("search=inexistente"))).json()).total).toBe(0)
  })
  it("público mantém consentimento/empresa e exclui snapshot inválido antes da contagem", async () => {
    estado.sessao = null
    const ids = []
    for (let page=1;page<=4;page++) {
      const r = await (await publica(req(`org=${a}&page=${page}&limit=1`))).json()
      expect(r.total).toBe(4); expect(r.videos).toHaveLength(1); ids.push(r.videos[0].id)
    }
    expect(ids).toEqual([`${p}-f1`,`${p}-f2`,`${p}-fa`,`${p}-fj`])
    const fora = await (await publica(req(`org=${a}&page=9&limit=1`))).json(); expect(fora.total).toBe(4); expect(fora.videos).toEqual([])
    expect((await (await publica(req(`org=${a}&area=design`))).json()).total).toBe(0)
    await db.arquivo.update({ where: { id: `${p}-f1` }, data: { revogadoEm: new Date() } })
    expect((await (await publica(req(`org=${a}`))).json()).total).toBe(3)
  })
})
