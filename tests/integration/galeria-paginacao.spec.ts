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
  it("filtros, prévia com falha, link aprovado e qualidade de Growth", async () => {
    await db.demanda.update({where:{id:`${p}-recente`},data:{linhaProjeto:"Projeto Teste",responsavelId:u}})
    await db.arquivo.update({where:{id:`${p}-f2`},data:{transcodeStatus:"failed"}})
    const filtro=await (await privada(req(`tipo=reels&projeto=Projeto%20Teste&pessoa=${encodeURIComponent(u)}`))).json()
    expect(filtro.total).toBe(2);expect(filtro.videos.some((v:{estadoPrevia:string})=>v.estadoPrevia==="falhou")).toBe(true)
    for(const [nome,tipo] of [["sem-peca","administrativo"],["falta-peca","post"],["link-aprovado","post"]]) await db.demanda.create({data:{id:`${p}-${nome}`,organizacaoId:a,solicitanteId:u,codigo:`${p}-${nome}`,titulo:nome,descricao:"sintético",cidade:"teste",departamento:"growth",area:"design",tipoVideo:tipo,statusVisivel:"finalizado"}})
    await db.aprovacaoVideo.create({data:{demandaId:`${p}-link-aprovado`,status:"aprovado",urlVideo:"https://example.invalid/aprovado"}})
    const aprovadas=await (await privada(req("area=design&search=link-aprovado"))).json();expect(aprovadas.videos[0].linkFinal).toBe("https://example.invalid/aprovado")
    const qualidade=await (await privada(req("area=design&qualidade=sem_final"))).json();expect(qualidade.pendencias.map((d:{titulo:string})=>d.titulo)).toEqual(["falta-peca"])
    await db.arquivo.update({where:{id:`${p}-f2`},data:{originalUrl:"https://example.invalid/original-f2"}})
    await db.aprovacaoVideo.createMany({data:[{demandaId:`${p}-recente`,status:"aprovado",urlVideo:"https://example.invalid/original-f2"},{demandaId:`${p}-recente`,status:"aprovado",urlVideo:"https://example.invalid/entrega-adicional"}]})
    const combinado=await (await privada(req("search=recente"))).json();expect(combinado.total).toBe(3)
    await db.permissaoUsuario.create({data:{organizacaoId:a,usuarioId:u,verDemandas:false}})
    try { expect((await privada(req())).status).toBe(403) } finally { await db.permissaoUsuario.deleteMany({where:{organizacaoId:a,usuarioId:u}}) }
    estado.sessao=null;expect((await privada(req("qualidade=sem_final"))).status).toBe(401)
  })

})
