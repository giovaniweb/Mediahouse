import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import type { TipoUsuario } from "@prisma/client"

// A varredura de 04/11/2026 achou rotas do card que conferiam só a EMPRESA:
// o checklist (ver, criar, marcar, apagar), os produtos, a conversão em evento,
// a lista de aprovações (`GET /api/aprovacao-video`) e os links do material no
// PUT da ficha. Qualquer pessoa logada, inclusive o videomaker externo e o
// solicitante, chamava a rota direto num card que não era dela.
//
// A régua é a do envio de arquivo (lib/quem-envia-arquivo, #132): fora do
// escopo, 404, como a ficha; no escopo, a gestão, quem tem "Editar Demanda" ou
// quem faz a peça. Exceções de quem trabalha: marcar o checklist, também o
// videomaker e o social do card; os links, o videomaker salva os brutos e, se a
// edição é dele, o vídeo final (#136). Rotas reais e banco real; só a sessão e
// os avisos em segundo plano são simulados.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { PRESETS } from "@/lib/permissoes"
import * as checklist from "@/app/api/demandas/[id]/checklist/route"
import { POST as vincularProdutos } from "@/app/api/demandas/[id]/produto/route"
import { POST as converterEvento } from "@/app/api/demandas/[id]/converter-evento/route"
import { GET as listarAprovacoes } from "@/app/api/aprovacao-video/route"
import { PUT as editarDemanda } from "@/app/api/demandas/[id]/route"

const p = `rotas-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = {
  admin: `${p}-admin`,
  solicitante: `${p}-solic`,
  videomaker: `${p}-vm-login`,
  editor: `${p}-editor`,
  designer: `${p}-designer`,
  eventos: `${p}-eventos`,
  auxiliar: `${p}-aux`,
}
const papelDe: Record<keyof typeof pessoas, TipoUsuario> = {
  admin: "admin", solicitante: "solicitante", videomaker: "videomaker", editor: "editor",
  designer: "designer", eventos: "gestor_eventos", auxiliar: "auxiliar_admin",
}
const perfis = { vm: `${p}-vm`, ed: `${p}-ed`, des: `${p}-des` }
const cards = {
  alheio: `${p}-alheio`, doSolicitante: `${p}-do-solic`, arte: `${p}-arte`,
  gravNossa: `${p}-grav-nossa`, gravDele: `${p}-grav-dele`, evento: `${p}-evento`,
}
const produtos = { a: `${p}-prod-a`, b: `${p}-prod-b` }

function como(quem: keyof typeof pessoas) {
  const papel = papelDe[quem]
  estado.sessao = { user: { id: pessoas[quem], organizacaoId: org, tipo: papel, papel, name: quem } }
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (url: string, method: string, corpo?: object) =>
  new NextRequest(`http://localhost${url}`, { method, ...(corpo ? { body: JSON.stringify(corpo) } : {}) })

const verChecklist = (id: string) => checklist.GET(req(`/api/demandas/${id}/checklist`, "GET"), params(id))
const criarItem = (id: string, texto = "Novo item") => checklist.POST(req(`/api/demandas/${id}/checklist`, "POST", { texto }), params(id))
const mexerItem = (id: string, corpo: object) => checklist.PATCH(req(`/api/demandas/${id}/checklist`, "PATCH", corpo), params(id))
const apagarItem = (id: string, itemId: string) => checklist.DELETE(req(`/api/demandas/${id}/checklist`, "DELETE", { itemId }), params(id))
const produto = (id: string, produtoIds: string[]) => vincularProdutos(req(`/api/demandas/${id}/produto`, "POST", { produtoIds }), params(id))
const converter = (id: string) => converterEvento(req(`/api/demandas/${id}/converter-evento`, "POST"), params(id))
const put = (id: string, corpo: object) => editarDemanda(req(`/api/demandas/${id}`, "PUT", corpo), params(id))
async function aprovacoes(area?: string) {
  const res = await listarAprovacoes(req(`/api/aprovacao-video?status=pendente${area ? `&area=${area}` : ""}`, "GET"))
  expect(res.status).toBe(200)
  return ((await res.json()).aprovacoes as { demandaId: string }[]).map((a) => a.demandaId).sort()
}

const itemDe = (id: string) => `${id}-item`
async function retratoDoChecklist(id: string) {
  return db.checklistItem.findMany({ where: { demandaId: id }, select: { id: true, texto: true, concluido: true }, orderBy: { id: "asc" } })
}
async function produtosDe(id: string) {
  return (await db.demandaProduto.findMany({ where: { demandaId: id }, select: { produtoId: true } })).map((x) => x.produtoId).sort()
}
async function links(id: string) {
  return db.demanda.findUniqueOrThrow({ where: { id }, select: { linkFinal: true, linkBrutos: true, coberturaId: true } })
}

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const [quem, id] of Object.entries(pessoas) as [keyof typeof pessoas, string][]) {
    const papel = papelDe[quem]
    await db.usuario.create({ data: { id, nome: quem, email: `${id}@exemplo.test`, tipo: papel, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: id, organizacaoId: org, papel, areas: papel === "designer" ? ["growth"] : papel === "auxiliar_admin" ? ["audiovisual", "growth"] : ["audiovisual"] } })
    if (papel !== "admin") await db.permissaoUsuario.create({ data: { usuarioId: id, organizacaoId: org, ...PRESETS[papel] } })
  }
  await db.videomaker.create({ data: { id: perfis.vm, nome: "Alan", usuarioId: pessoas.videomaker } })
  await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: perfis.vm, tipoContrato: "externo" } })
  await db.editor.create({ data: { id: perfis.ed, nome: "Edu", usuarioId: pessoas.editor } })
  await db.editorOrganizacao.create({ data: { organizacaoId: org, editorId: perfis.ed } })
  await db.designer.create({ data: { id: perfis.des, nome: "Dani", usuarioId: pessoas.designer } })
  await db.designerOrganizacao.create({ data: { organizacaoId: org, designerId: perfis.des } })
  await db.produto.createMany({ data: [{ id: produtos.a, organizacaoId: org, nome: "Laser A" }, { id: produtos.b, organizacaoId: org, nome: "Laser B" }] })

  const card = { organizacaoId: org, descricao: "Briefing do vídeo.", cidade: "Curitiba", area: "audiovisual" as const,
    tipoVideo: "reels", departamento: "audiovisual", statusInterno: "editando" as const, statusVisivel: "edicao" as const }
  const gravacao = { ...card, tipoVideo: "Gravação externa", tipoGravacao: "conteudo" as const, solicitanteId: pessoas.solicitante,
    videomakerId: perfis.vm, statusInterno: "videomaker_aceitou" as const, statusVisivel: "producao" as const }
  await db.demanda.createMany({ data: [
    // O card de outra pessoa: pedido da gestão, editado pelo Edu, com vídeo final.
    { ...card, id: cards.alheio, codigo: cards.alheio, titulo: "Vídeo do treinamento", solicitanteId: pessoas.admin, editorId: perfis.ed,
      linkFinal: "https://drive.test/final-v1", linkBrutos: "https://drive.test/brutos" },
    // O pedido do solicitante, gravado pelo videomaker externo e editado pelo Edu.
    { ...card, id: cards.doSolicitante, codigo: cards.doSolicitante, titulo: "Vídeo da clínica", solicitanteId: pessoas.solicitante,
      videomakerId: perfis.vm, editorId: perfis.ed },
    // A arte do designer, no Growth.
    { ...card, id: cards.arte, codigo: cards.arte, titulo: "Arte do convite", area: "design", tipoVideo: "post_estatico", departamento: "growth",
      solicitanteId: pessoas.admin, designerId: perfis.des },
    // Gravações externas do videomaker: uma editada pela equipe, outra por ele.
    { ...gravacao, id: cards.gravNossa, codigo: cards.gravNossa, titulo: "Gravação editada pela equipe", edicaoPor: "equipe" },
    { ...gravacao, id: cards.gravDele, codigo: cards.gravDele, titulo: "Gravação editada por ele", edicaoPor: "videomaker" },
    // Uma cobertura do solicitante, para converter em evento.
    { ...card, id: cards.evento, codigo: cards.evento, titulo: "Cobertura do congresso", tipoVideo: "Cobertura de evento",
      solicitanteId: pessoas.solicitante, editorId: perfis.ed },
  ] })
  for (const id of Object.values(cards)) {
    await db.checklistItem.create({ data: { id: itemDe(id), demandaId: id, texto: "Conferir o roteiro", grupo: "geral" } })
  }
  await db.demandaProduto.create({ data: { demandaId: cards.alheio, produtoId: produtos.a } })
  await db.aprovacaoVideo.createMany({ data: [
    { demandaId: cards.alheio, urlVideo: "https://drive.test/final-v1", nomeVideo: "alheio", status: "pendente", expiresAt: new Date(Date.now() + 86400000) },
    { demandaId: cards.doSolicitante, urlVideo: "https://drive.test/clinica", nomeVideo: "clínica", status: "pendente", expiresAt: new Date(Date.now() + 86400000) },
    { demandaId: cards.arte, urlVideo: "https://drive.test/arte.png", nomeVideo: "arte", status: "pendente", expiresAt: new Date(Date.now() + 86400000) },
  ] })
})

beforeEach(() => { estado.sessao = null })

afterAll(async () => {
  const ids = Object.values(cards)
  const coberturas = (await db.demanda.findMany({ where: { id: { in: ids } }, select: { coberturaId: true } }))
    .map((d) => d.coberturaId).filter((x): x is string => !!x)
  await db.demanda.updateMany({ where: { id: { in: ids } }, data: { coberturaId: null } })
  await db.eventoCoberturaLog.deleteMany({ where: { coberturaId: { in: coberturas } } })
  await db.eventoCoberturaChecklist.deleteMany({ where: { coberturaId: { in: coberturas } } })
  await db.eventoCoberturaEquipe.deleteMany({ where: { coberturaId: { in: coberturas } } })
  await db.eventoCobertura.deleteMany({ where: { id: { in: coberturas } } })
  await db.aprovacaoVideo.deleteMany({ where: { demandaId: { in: ids } } })
  await db.checklistItem.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demandaProduto.deleteMany({ where: { demandaId: { in: ids } } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.produto.deleteMany({ where: { organizacaoId: org } })
  await db.videomakerOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.editorOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.designerOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: perfis.vm } })
  await db.editor.deleteMany({ where: { id: perfis.ed } })
  await db.designer.deleteMany({ where: { id: perfis.des } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("checklist da demanda", () => {
  it("o videomaker externo e o solicitante, num card que não é deles, não veem nem mexem: 404", async () => {
    const antes = await retratoDoChecklist(cards.alheio)
    for (const quem of ["videomaker", "solicitante"] as const) {
      como(quem)
      expect((await verChecklist(cards.alheio)).status).toBe(404)
      expect((await criarItem(cards.alheio)).status).toBe(404)
      expect((await mexerItem(cards.alheio, { itemId: itemDe(cards.alheio), concluido: true })).status).toBe(404)
      expect((await mexerItem(cards.alheio, { itemId: itemDe(cards.alheio), texto: "trocado" })).status).toBe(404)
      expect((await apagarItem(cards.alheio, itemDe(cards.alheio))).status).toBe(404)
    }
    expect(await retratoDoChecklist(cards.alheio)).toEqual(antes)
  })

  it("no próprio pedido o solicitante vê o checklist, mas não cria, marca nem apaga", async () => {
    const antes = await retratoDoChecklist(cards.doSolicitante)
    como("solicitante")
    expect((await verChecklist(cards.doSolicitante)).status).toBe(200)
    expect((await criarItem(cards.doSolicitante)).status).toBe(403)
    expect((await mexerItem(cards.doSolicitante, { itemId: itemDe(cards.doSolicitante), concluido: true })).status).toBe(403)
    expect((await apagarItem(cards.doSolicitante, itemDe(cards.doSolicitante))).status).toBe(403)
    expect(await retratoDoChecklist(cards.doSolicitante)).toEqual(antes)
  })

  it("quem vê todas as demandas mas não edita nem faz a peça lê, e não mexe", async () => {
    const antes = await retratoDoChecklist(cards.alheio)
    como("eventos")
    expect((await verChecklist(cards.alheio)).status).toBe(200)
    expect((await criarItem(cards.alheio)).status).toBe(403)
    expect((await mexerItem(cards.alheio, { itemId: itemDe(cards.alheio), concluido: true })).status).toBe(403)
    expect((await apagarItem(cards.alheio, itemDe(cards.alheio))).status).toBe(403)
    expect(await retratoDoChecklist(cards.alheio)).toEqual(antes)
  })

  it("o videomaker marca o checklist do card dele, mas não cria, renomeia nem apaga", async () => {
    como("videomaker")
    const item = itemDe(cards.doSolicitante)
    expect((await mexerItem(cards.doSolicitante, { itemId: item, concluido: true })).status).toBe(200)
    expect((await mexerItem(cards.doSolicitante, { itemId: item, texto: "trocado" })).status).toBe(403)
    expect((await criarItem(cards.doSolicitante)).status).toBe(403)
    expect((await apagarItem(cards.doSolicitante, item)).status).toBe(403)
    expect(await retratoDoChecklist(cards.doSolicitante)).toEqual([{ id: item, texto: "Conferir o roteiro", concluido: true }])
  })

  it("a gestão, o editor e o designer do card criam, marcam e apagam", async () => {
    como("admin")
    expect((await criarItem(cards.alheio, "Da gestão")).status).toBe(201)
    como("editor")
    const criado = await criarItem(cards.alheio, "Do editor")
    expect(criado.status).toBe(201)
    const { id: novo } = await criado.json()
    expect((await mexerItem(cards.alheio, { itemId: novo, concluido: true })).status).toBe(200)
    expect((await mexerItem(cards.alheio, { itemId: novo, texto: "Do editor, revisto" })).status).toBe(200)
    expect((await apagarItem(cards.alheio, novo)).status).toBe(200)
    expect(PRESETS.designer.editarDemanda).toBe(false)
    como("designer")
    expect((await criarItem(cards.arte, "Da arte")).status).toBe(201)
    expect((await mexerItem(cards.arte, { itemId: itemDe(cards.arte), concluido: true })).status).toBe(200)
    expect((await retratoDoChecklist(cards.alheio)).map((i) => i.texto).sort()).toEqual(["Conferir o roteiro", "Da gestão"])
  })
})

describe("produtos da demanda", () => {
  it("o videomaker externo num card alheio recebe 404; o solicitante no próprio pedido e quem só vê, 403", async () => {
    como("videomaker")
    expect((await produto(cards.alheio, [])).status).toBe(404)
    como("solicitante")
    expect((await produto(cards.alheio, [])).status).toBe(404)
    expect((await produto(cards.doSolicitante, [produtos.b])).status).toBe(403)
    como("eventos")
    expect((await produto(cards.alheio, [])).status).toBe(403)
    expect(await produtosDe(cards.alheio)).toEqual([produtos.a])
    expect(await produtosDe(cards.doSolicitante)).toEqual([])
  })

  it("a gestão e o editor do card trocam os produtos", async () => {
    como("editor")
    expect((await produto(cards.alheio, [produtos.a, produtos.b])).status).toBe(200)
    expect(await produtosDe(cards.alheio)).toEqual([produtos.a, produtos.b].sort())
    como("admin")
    expect((await produto(cards.alheio, [produtos.a])).status).toBe(200)
    expect(await produtosDe(cards.alheio)).toEqual([produtos.a])
  })
})

describe("converter em evento", () => {
  it("o videomaker externo e o solicitante não convertem", async () => {
    como("videomaker")
    expect((await converter(cards.alheio)).status).toBe(404)
    expect((await converter(cards.doSolicitante)).status).toBe(403)
    como("solicitante")
    expect((await converter(cards.alheio)).status).toBe(404)
    expect((await converter(cards.evento)).status).toBe(403)
    como("eventos")
    expect((await converter(cards.evento)).status).toBe(403)
    expect((await links(cards.evento)).coberturaId).toBeNull()
    expect((await links(cards.doSolicitante)).coberturaId).toBeNull()
  })

  it("quem faz a peça converte; a gestão também", async () => {
    como("editor")
    const res = await converter(cards.evento)
    expect(res.status).toBe(200)
    expect((await links(cards.evento)).coberturaId).toBe((await res.json()).cobertura.id)
    como("admin")
    expect((await converter(cards.alheio)).status).toBe(200)
  })
})

describe("GET /api/aprovacao-video", () => {
  it("o videomaker externo, o solicitante e quem só vê não listam aprovação de card em que não fazem a peça", async () => {
    como("videomaker")
    expect(await aprovacoes("audiovisual")).toEqual([])
    como("solicitante")
    expect(await aprovacoes("audiovisual")).toEqual([])
    como("eventos")
    expect(await aprovacoes("audiovisual")).toEqual([])
  })

  it("o editor lista as dos cards dele; o designer, a da arte dele", async () => {
    como("editor")
    expect(await aprovacoes("audiovisual")).toEqual([cards.alheio, cards.doSolicitante].sort())
    como("designer")
    expect(await aprovacoes("design")).toEqual([cards.arte])
    expect(await aprovacoes("audiovisual")).toEqual([])
  })

  it("a gestão e quem tem a tela de Aprovações listam tudo o que enxergam", async () => {
    como("admin")
    expect(await aprovacoes("audiovisual")).toEqual([cards.alheio, cards.doSolicitante].sort())
    expect(await aprovacoes()).toEqual([cards.alheio, cards.doSolicitante, cards.arte].sort())
    expect(PRESETS.auxiliar_admin.editarDemanda).toBe(false)
    como("auxiliar")
    expect(await aprovacoes("audiovisual")).toEqual([cards.alheio, cards.doSolicitante].sort())
    expect(await aprovacoes("design")).toEqual([cards.arte])
  })
})

describe("PUT /api/demandas/[id]: links do material", () => {
  it("o videomaker externo num card alheio recebe 404; o solicitante no próprio pedido, 403", async () => {
    const antes = await links(cards.alheio)
    como("videomaker")
    expect((await put(cards.alheio, { linkFinal: "https://golpe.test/v" })).status).toBe(404)
    como("solicitante")
    expect((await put(cards.alheio, { linkBrutos: "https://golpe.test/b" })).status).toBe(404)
    expect((await put(cards.doSolicitante, { linkFinal: "https://golpe.test/v" })).status).toBe(403)
    expect((await put(cards.gravNossa, { linkBrutos: "https://golpe.test/b" })).status).toBe(403)
    como("eventos")
    expect((await put(cards.alheio, { linkFinal: "https://golpe.test/v" })).status).toBe(403)
    expect(await links(cards.alheio)).toEqual(antes)
    expect((await links(cards.doSolicitante)).linkFinal).toBeNull()
    expect((await links(cards.gravNossa)).linkBrutos).toBeNull()
  })

  it("o videomaker não troca o vídeo final de uma edição que é da equipe", async () => {
    como("videomaker")
    expect((await put(cards.gravNossa, { linkFinal: "https://drive.test/final-dele" })).status).toBe(403)
    expect((await put(cards.doSolicitante, { linkFinal: "https://drive.test/final-dele" })).status).toBe(403)
    expect((await links(cards.gravNossa)).linkFinal).toBeNull()
  })

  it("o videomaker segue salvando o material dele na ficha (#136): os brutos, e o vídeo quando a edição é dele", async () => {
    como("videomaker")
    expect((await put(cards.gravNossa, { linkBrutos: "https://drive.test/brutos-nossa" })).status).toBe(200)
    expect((await links(cards.gravNossa)).linkBrutos).toBe("https://drive.test/brutos-nossa")
    expect((await put(cards.gravDele, { linkBrutos: "https://drive.test/brutos-dele" })).status).toBe(200)
    expect((await put(cards.gravDele, { linkFinal: "https://drive.test/final-dele" })).status).toBe(200)
    expect(await links(cards.gravDele)).toMatchObject({ linkBrutos: "https://drive.test/brutos-dele", linkFinal: "https://drive.test/final-dele" })
  })

  it("a gestão e o editor do card trocam os links; o solicitante segue editando o resto do pedido", async () => {
    como("editor")
    expect((await put(cards.alheio, { linkFinal: "https://drive.test/final-v2" })).status).toBe(200)
    como("admin")
    expect((await put(cards.alheio, { linkBrutos: "https://drive.test/brutos-v2" })).status).toBe(200)
    expect(await links(cards.alheio)).toMatchObject({ linkFinal: "https://drive.test/final-v2", linkBrutos: "https://drive.test/brutos-v2" })
    como("solicitante")
    expect((await put(cards.doSolicitante, { cidade: "Maringá" })).status).toBe(200)
  })
})
