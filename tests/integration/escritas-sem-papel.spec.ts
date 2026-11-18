import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import type { TipoUsuario } from "@prisma/client"

// Auditoria de 18/11/2026, item 2: escritas que só conferiam sessão e empresa.
// Qualquer membro — solicitante, videomaker externo — criava e apagava
// cobertura, mexia no cadastro de produtos, nas linhas de produto do Growth e
// no banco de ideias. Agora cada área pede a capacidade dela. Rotas reais e
// banco real; só a sessão é simulada.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import * as coberturas from "@/app/api/coberturas/route"
import * as cobertura from "@/app/api/coberturas/[id]/route"
import * as produto from "@/app/api/produtos/[id]/route"
import { POST as criarProduto } from "@/app/api/produtos/route"
import * as linha from "@/app/api/growth/linhas-projetos/[id]/route"
import * as ideia from "@/app/api/ideias/[id]/route"
import { POST as converter } from "@/app/api/ideias/[id]/converter/route"
import { POST as emLote } from "@/app/api/ideias/bulk/route"
import { POST as cadastrarVideomaker } from "@/app/api/videomakers/route"
import { POST as cadastrarEditor } from "@/app/api/editores/route"

const p = `escritas-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = { admin: `${p}-admin`, solicitante: `${p}-solic`, videomaker: `${p}-vm` } as const
type Quem = keyof typeof pessoas
const ids = { cob: `${p}-cob`, prod: `${p}-prod`, linha: `${p}-linha`, ideia: `${p}-ideia`, rascunho: `${p}-rasc` }

function como(quem: Quem) {
  const papel = quem as TipoUsuario
  estado.sessao = { user: { id: pessoas[quem], organizacaoId: org, tipo: papel, papel, name: quem } }
}
const req = (url: string, method: string, corpo?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, ...(corpo ? { body: JSON.stringify(corpo), headers: { "content-type": "application/json" } } : {}) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const [quem, id] of Object.entries(pessoas)) {
    await db.usuario.create({ data: { id, nome: id, tipo: quem as TipoUsuario, senhaHash: "sintetico" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: id, organizacaoId: org, papel: quem as TipoUsuario, areas: [] } })
  }
  await db.eventoCobertura.create({ data: { id: ids.cob, organizacaoId: org, titulo: "Feira", slug: `${p}-feira`, dataInicio: new Date(), dataFim: new Date(), createdById: pessoas.admin } })
  await db.produto.create({ data: { id: ids.prod, organizacaoId: org, nome: "Equipamento" } })
  await db.linhaProjeto.create({ data: { id: ids.linha, organizacaoId: org, nome: "Linha" } })
  await db.ideiaVideo.create({ data: { id: ids.ideia, organizacaoId: org, titulo: "Ideia do banco", status: "nova" } })
  await db.ideiaVideo.create({ data: { id: ids.rascunho, organizacaoId: org, titulo: "Meu rascunho", status: "rascunho", usuarioId: pessoas.solicitante } })
})

afterAll(async () => {
  await db.eventoCoberturaChecklist.deleteMany({ where: { cobertura: { organizacaoId: org } } })
  await db.eventoCoberturaLog.deleteMany({ where: { cobertura: { organizacaoId: org } } })
  await db.eventoCobertura.deleteMany({ where: { organizacaoId: org } })
  await db.ideiaVideo.deleteMany({ where: { organizacaoId: org } })
  await db.historicoStatus.deleteMany({ where: { demanda: { organizacaoId: org } } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.produto.deleteMany({ where: { organizacaoId: org } })
  await db.linhaProjeto.deleteMany({ where: { organizacaoId: org } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: org } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

const escritas: [string, () => Promise<Response>][] = [
  ["criar cobertura", () => coberturas.POST(req("/api/coberturas", "POST", { titulo: "X", dataInicio: "2031-01-01", dataFim: "2031-01-02" }))],
  ["listar coberturas (com os endereços públicos)", () => coberturas.GET(req("/api/coberturas", "GET"))],
  ["editar cobertura", () => cobertura.PUT(req(`/api/coberturas/${ids.cob}`, "PUT", { titulo: "Invadida" }), params(ids.cob))],
  ["apagar cobertura", () => cobertura.DELETE(req(`/api/coberturas/${ids.cob}`, "DELETE"), params(ids.cob))],
  ["criar produto", () => criarProduto(req("/api/produtos", "POST", { nome: "Novo" }))],
  ["editar produto", () => produto.PUT(req(`/api/produtos/${ids.prod}`, "PUT", { nome: "Invadido" }), params(ids.prod))],
  ["apagar produto", () => produto.DELETE(req(`/api/produtos/${ids.prod}`, "DELETE"), params(ids.prod))],
  ["editar linha do Growth", () => linha.PATCH(req(`/api/growth/linhas-projetos/${ids.linha}`, "PATCH", { nome: "Invadida" }), params(ids.linha))],
  ["apagar linha do Growth", () => linha.DELETE(req(`/api/growth/linhas-projetos/${ids.linha}`, "DELETE"), params(ids.linha))],
  ["editar ideia do banco", () => ideia.PUT(req(`/api/ideias/${ids.ideia}`, "PUT", { titulo: "Invadida" }), params(ids.ideia))],
  ["descartar ideia do banco", () => ideia.DELETE(req(`/api/ideias/${ids.ideia}`, "DELETE"), params(ids.ideia))],
  ["converter ideia em pedido", () => converter(req(`/api/ideias/${ids.ideia}/converter`, "POST", {}), params(ids.ideia))],
  ["cadastrar videomaker (perfil e conta)", () => cadastrarVideomaker(req("/api/videomakers", "POST", { nome: "Falso", telefone: "11900000001", cidade: "X" }))],
  ["cadastrar editor (perfil e conta)", () => cadastrarEditor(req("/api/editores", "POST", { nome: "Falso", telefone: "11900000002" }))],
  ["mudar ideias em lote", () => emLote(req("/api/ideias/bulk", "POST", { ids: [ids.ideia], action: "aprovar" }))],
]

describe("escritas pedem a capacidade da área", () => {
  for (const quem of ["solicitante", "videomaker"] as const) {
    it.each(escritas)(`${quem}: %s → 403`, async (_nome, chamar) => {
      como(quem)
      expect((await chamar()).status).toBe(403)
    })
  }

  it("nada mudou depois das tentativas", async () => {
    expect(await db.eventoCobertura.findUniqueOrThrow({ where: { id: ids.cob } })).toMatchObject({ titulo: "Feira" })
    expect(await db.produto.findUniqueOrThrow({ where: { id: ids.prod } })).toMatchObject({ nome: "Equipamento" })
    expect(await db.linhaProjeto.findUniqueOrThrow({ where: { id: ids.linha } })).toMatchObject({ nome: "Linha" })
    expect(await db.ideiaVideo.findUniqueOrThrow({ where: { id: ids.ideia } })).toMatchObject({ titulo: "Ideia do banco", status: "nova", demandaId: null })
    expect(await db.eventoCobertura.count({ where: { organizacaoId: org } })).toBe(1)
  })

  it("o próprio rascunho continua de quem escreveu, sem capacidade", async () => {
    como("solicitante")
    expect((await ideia.PUT(req(`/api/ideias/${ids.rascunho}`, "PUT", { titulo: "Meu rascunho, editado" }), params(ids.rascunho))).status).toBe(200)
    expect((await ideia.DELETE(req(`/api/ideias/${ids.rascunho}`, "DELETE"), params(ids.rascunho))).status).toBe(200)
  })

  it("perfil só se liga a conta que é desta empresa", async () => {
    como("admin")
    const res = await cadastrarVideomaker(req("/api/videomakers", "POST", { nome: "Outro", telefone: "11900000003", cidade: "X", usuarioId: "conta-de-outra-empresa" }))
    expect(res.status).toBe(400)
    expect(await db.videomaker.count({ where: { nome: "Outro", telefone: "11900000003" } })).toBe(0)
  })

  it("a gestão segue podendo", async () => {
    como("admin")
    expect((await cobertura.PUT(req(`/api/coberturas/${ids.cob}`, "PUT", { titulo: "Feira 2" }), params(ids.cob))).status).toBe(200)
    expect((await produto.PUT(req(`/api/produtos/${ids.prod}`, "PUT", { nome: "Equipamento 2" }), params(ids.prod))).status).toBe(200)
    expect((await linha.PATCH(req(`/api/growth/linhas-projetos/${ids.linha}`, "PATCH", { nome: "Linha 2" }), params(ids.linha))).status).toBe(200)
    expect((await emLote(req("/api/ideias/bulk", "POST", { ids: [ids.ideia], action: "aprovar" }))).status).toBe(200)
  })
})
