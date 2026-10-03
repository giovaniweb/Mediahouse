import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado, assinar } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } } }, assinar: vi.fn(async (p: string) => `https://storage.invalid/${p}`) }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/midia", async () => {
  const real = await vi.importActual<typeof import("@/lib/midia")>("@/lib/midia")
  return { ...real, urlAssinadaDeLeitura: assinar, resolverParaAssinada: async (u: string | null) => u && real.caminhoDaUrl(u) ? assinar(real.caminhoDaUrl(u)!) : u }
})
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as galeria } from "@/app/api/publico/galeria/route"
import { GET as midia } from "@/app/api/midia/[...caminho]/route"
import { POST as publicar } from "@/app/api/biblioteca/[id]/publicacao/route"
import { GET as biblioteca } from "@/app/api/biblioteca/route"
const p = `media-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, admin = `${p}-admin`, leitor = `${p}-leitor`, vm = `${p}-vm`
const d1 = `${p}-d1`, d2 = `${p}-d2`, d3 = `${p}-d3`, arq = `${p}-arq`, arq2 = `${p}-arq2`, arq3 = `${p}-arq3`
const path = (org: string, d: string, tipo = "videos", nome = "1.mp4") => `org/${org}/${tipo}/${d}/${nome}`
const url = (org: string, d: string, tipo = "videos", nome = "1.mp4") => `/api/midia/${path(org,d,tipo,nome)}`
const sessao = (id = admin, org = a) => { estado.sessao = { user: { id, organizacaoId: org, tipo: "admin" } } }
const ler = (c: string, token?: string) => midia(new NextRequest(`http://localhost/api/midia/${c}${token ? `?token=${token}` : ""}`), { params: Promise.resolve({ caminho: c.split("/") }) })
const publicarArq = (id = arq, publicarFlag = true) => publicar(new NextRequest("http://localhost/api/biblioteca/x/publicacao", { method: "POST", body: JSON.stringify({ publicar: publicarFlag }) }), { params: Promise.resolve({ id }) })
const listar = () => galeria(new NextRequest(`http://localhost/api/publico/galeria?org=${a}&limit=1`))
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.createMany({ data: [admin,leitor].map(id => ({ id, nome: id, tipo: "admin", senhaHash: "sem-login" })) })
  await db.usuarioOrganizacao.createMany({ data: [{ usuarioId: admin, organizacaoId: a, papel: "admin", areas: [] }, { usuarioId: admin, organizacaoId: b, papel: "solicitante", areas: [] }, { usuarioId: leitor, organizacaoId: a, papel: "solicitante", areas: [] }] })
  await db.demanda.createMany({ data: [{ id: d1, organizacaoId: a, solicitanteId: leitor }, { id: d2, organizacaoId: a, solicitanteId: admin }, { id: d3, organizacaoId: b, solicitanteId: admin }].map(d => ({ ...d, codigo: d.id, titulo: d.id, descricao: "teste", cidade: "Teste", departamento: "growth", tipoVideo: "reels", statusVisivel: "finalizado", publicToken: `${d.id}-token`, publicTokenAtivo: true })) })
  await db.arquivo.createMany({ data: [{ id: arq, demandaId: d1, url: url(a,d1) }, { id: arq2, demandaId: d2, url: url(a,d2) }, { id: arq3, demandaId: d3, url: url(b,d3) }].map(v => ({ ...v, tipoArquivo: "final", nomeArquivo: "final.mp4" })) })
  await db.arquivo.create({ data: { demandaId: d1, nomeArquivo: "briefing.pdf", tipoArquivo: "documento", url: url(a,d1,"docs","briefing.pdf") } })
  await db.aprovacaoVideo.create({ data: { demandaId: d1, token: `${p}-aprovacao`, urlVideo: url(a,d1) } })
  await db.videomaker.create({ data: { id: vm, nome: "Teste", redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
  await db.notaFiscalUpload.create({ data: { demandaId: d1, videomakerId: vm, token: `${p}-nf`, url: url(a,`${d1}-${vm}`,"nf","nf.pdf") } })
  await db.parceriaOrganizacao.create({ data: { id: `${p}-parceria`, organizacaoConvidanteId: a, organizacaoConvidadaId: b, nomeConvidante: "A", nomeConvidada: "B", status: "aceita", criadoPorId: admin } })
  await db.demandaCompartilhamento.create({ data: { id: `${p}-espelho`, demandaId: d1, organizacaoOrigemId: a, organizacaoDestinoId: b, nomeOrigem: "A", nomeDestino: "B", criadoPorId: admin } })
})
beforeEach(async () => {
  estado.sessao = null; assinar.mockClear()
  await db.arquivo.update({ where: { id: arq }, data: { publicadoEm: null, publicadoPor: null, revogadoEm: null, revogadoPor: null, publicacaoUrl: null, publicacaoThumbnailUrl: null, url: url(a,d1) } })
})
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [a,b] } } })
  await db.videomaker.deleteMany({ where: { id: vm } })
  await db.usuario.deleteMany({ where: { id: { in: [admin,leitor] } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
describe("publicação explícita e autorização por objeto", () => {
  it("finalizado é privado por padrão, inclusive pelo link direto", async () => {
    const r = await listar(); expect((await r.json()).videos).toEqual([]); expect(r.headers.get("cache-control")).toContain("no-store")
    expect((await ler(path(a,d1))).status).toBe(404); expect(assinar).not.toHaveBeenCalled()
  })
  it("publicar expõe só o snapshot escolhido; revogar impede nova assinatura", async () => {
    sessao(); expect((await publicarArq()).status).toBe(200)
    const registro = await db.arquivo.findUniqueOrThrow({ where: { id: arq } }); expect(registro.publicadoPor).toBe(admin)
    estado.sessao = null
    const body = await (await listar()).json(); expect(body.total).toBe(1); expect(body.totalPages).toBe(1); expect(body.videos[0].id).toBe(arq)
    expect((await ler(path(a,d1))).status).toBe(302); expect((await ler(path(a,d2))).status).toBe(404)
    await db.arquivo.update({ where: { id: arq }, data: { url: url(a,d1,"videos","nova.mp4") } })
    expect((await ler(path(a,d1,"videos","nova.mp4"))).status).toBe(404)
    sessao(); expect((await publicarArq(arq,false)).status).toBe(200); estado.sessao = null; assinar.mockClear()
    expect((await ler(path(a,d1))).status).toBe(404); expect((await (await listar()).json()).total).toBe(0); expect(assinar).not.toHaveBeenCalled()
  })
  it("não permite publicar com papel global, outra empresa ou objeto fiscal disfarçado", async () => {
    sessao(leitor); expect((await publicarArq()).status).toBe(403)
    sessao(); expect((await publicarArq(arq3)).status).toBe(404)
    await db.arquivo.update({ where: { id: arq }, data: { url: url(a,d1,"nf","nf.pdf") } })
    expect((await publicarArq()).status).toBe(422)
  })
  it("sessão limitada lê só a própria demanda e a biblioteca usa o mesmo escopo", async () => {
    sessao(leitor); expect((await ler(path(a,d1))).status).toBe(302)
    expect((await ler(path(a,d2))).status).toBe(404); expect((await ler(path(b,d3))).status).toBe(404)
    const body = await (await biblioteca(new NextRequest("http://localhost/api/biblioteca"))).json()
    expect(body.videos.map((v: { id: string }) => v.id)).toEqual([arq]); expect(body.podePublicar).toBe(false)
  })
  it("nem admin assina objeto sem registro ou caminho de outra entrega", async () => {
    sessao(); expect((await ler(path(a,d1,"videos","desconhecido.mp4"))).status).toBe(404)
    await db.arquivo.update({ where: { id: arq }, data: { url: url(a,`${p}-inexistente`) } })
    expect((await ler(path(a,`${p}-inexistente`))).status).toBe(404)
  })
  it("token de acompanhamento permite só os finais da sua demanda", async () => {
    expect((await ler(path(a,d1),`${d1}-token`)).status).toBe(302)
    expect((await ler(path(a,d2),`${d1}-token`)).status).toBe(404)
    expect((await ler(path(a,d1,"docs","briefing.pdf"),`${d1}-token`)).status).toBe(404)
    expect((await ler(path(a,`${d1}-${vm}`,"nf","nf.pdf"),`${d1}-token`)).status).toBe(404)
  })
  it("aprovação e NF possuem autorizações separadas", async () => {
    expect((await ler(path(a,d1),`${p}-aprovacao`)).status).toBe(302)
    expect((await ler(path(a,d2),`${p}-aprovacao`)).status).toBe(404)
    expect((await ler(path(a,`${d1}-${vm}`,"nf","nf.pdf"),`${p}-nf`)).status).toBe(302)
    expect((await ler(path(a,d1),`${p}-nf`)).status).toBe(404)
    sessao(leitor); expect((await ler(path(a,`${d1}-${vm}`,"nf","nf.pdf"))).status).toBe(404)
  })
  it("tokens expirados ou revogados não abrem mídia", async () => {
    await db.demanda.update({ where: { id: d1 }, data: { publicTokenAtivo: false } })
    try { expect((await ler(path(a,d1),`${d1}-token`)).status).toBe(404) } finally { await db.demanda.update({ where: { id: d1 }, data: { publicTokenAtivo: true } }) }
    await db.aprovacaoVideo.update({ where: { token: `${p}-aprovacao` }, data: { expiresAt: new Date(0) } })
    try { expect((await ler(path(a,d1),`${p}-aprovacao`)).status).toBe(404) } finally { await db.aprovacaoVideo.update({ where: { token: `${p}-aprovacao` }, data: { expiresAt: null } }) }
  })
  it("parceiro lê só mídia permitida da aresta ativa; revogação corta acesso", async () => {
    sessao(admin,b)
    expect((await ler(path(a,d1))).status).toBe(302)
    expect((await ler(path(a,d2))).status).toBe(404)
    expect((await ler(path(a,d1,"docs","briefing.pdf"))).status).toBe(404)
    expect((await ler(path(a,`${d1}-${vm}`,"nf","nf.pdf"))).status).toBe(404)
    await db.demandaCompartilhamento.update({ where: { id: `${p}-espelho` }, data: { revogadoEm: new Date() } })
    try { expect((await ler(path(a,d1))).status).toBe(404) }
    finally { await db.demandaCompartilhamento.update({ where: { id: `${p}-espelho` }, data: { revogadoEm: null } }) }
  })
  it("empresa dona inativa interrompe inclusive o acesso do parceiro", async () => {
    sessao(admin,b)
    await db.organizacao.update({ where: { id: a }, data: { ativo: false } })
    try { expect((await ler(path(a,d1))).status).toBe(404) }
    finally { await db.organizacao.update({ where: { id: a }, data: { ativo: true } }) }
  })
  it("assinatura indisponível não retorna URL privada como fallback", async () => {
    sessao(); await publicarArq(); estado.sessao = null
    assinar.mockResolvedValueOnce(null as unknown as string)
    expect((await ler(path(a,d1))).status).toBe(502)
    assinar.mockResolvedValueOnce(null as unknown as string)
    const resposta = await listar()
    expect(resposta.status).toBe(503)
    expect((await resposta.json()).videos).toEqual([])
  })
  it("paginação pública conta arquivos, incluindo dois finais da mesma demanda", async () => {
    sessao(); await publicarArq()
    const extra = await db.arquivo.create({ data: { demandaId: d1, tipoArquivo: "final", nomeArquivo: "segundo.mp4", url: url(a,d1,"videos","segundo.mp4") } })
    try {
      expect((await publicarArq(extra.id)).status).toBe(200)
      const r = await (await listar()).json(); expect(r.total).toBe(2); expect(r.totalPages).toBe(2); expect(r.videos).toHaveLength(1)
    } finally { await db.arquivo.delete({ where: { id: extra.id } }) }
  })
  it("Growth inclui arquivo final mesmo sem linkFinal e respeita capacidade da área", async () => {
    await db.demanda.update({ where: { id: d1 }, data: { area: "design" } })
    try {
      sessao()
      const r = await biblioteca(new NextRequest("http://localhost/api/biblioteca?area=design"))
      expect((await r.json()).videos.map((v: { id: string }) => v.id)).toEqual([arq])
      sessao(leitor)
      expect((await biblioteca(new NextRequest("http://localhost/api/biblioteca?area=design"))).status).toBe(403)
      expect((await ler(path(a,d1))).status).toBe(404)
    } finally { await db.demanda.update({ where: { id: d1 }, data: { area: "audiovisual" } }) }
  })
})
