import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import type { TipoUsuario } from "@prisma/client"

// Achado do Vercel Agent no PR #161: depois da auditoria de 18/11/2026 as rotas
// do app de campo pediam só "Ver Coberturas", e o videomaker externo escalado
// no evento recebia 403 ao subir material. Agora vale a gestão das coberturas
// OU estar escalado nela (lib/acesso-cobertura). Rotas reais e banco real; só a
// sessão e o Storage são simulados.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))
vi.mock("@/lib/midia-limite", () => ({ recusarUploads: async () => null }))
vi.mock("@/lib/midia", async (original) => ({
  ...await original<typeof import("@/lib/midia")>(),
  urlDeUpload: async (caminho: string) => ({ uploadUrl: `https://storage.invalid/${caminho}?assinado`, url: `/api/midia/${caminho}` }),
}))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as urlDeEnvio } from "@/app/api/coberturas/[id]/uploads/upload-url/route"
import * as uploads from "@/app/api/coberturas/[id]/uploads/route"
import * as checklist from "@/app/api/coberturas/[id]/checklist/route"
import { PUT as editarCobertura } from "@/app/api/coberturas/[id]/route"
import { POST as descritor } from "@/app/api/campo/face-descriptors/route"

const p = `campo-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = { admin: `${p}-admin`, escalado: `${p}-vm-escalado`, fora: `${p}-vm-fora` }
const vms = { escalado: `${p}-perfil-escalado`, fora: `${p}-perfil-fora` }
const cob = `${p}-cob`
let membroEscalado = "", membroOutro = "", itemChecklist = ""

function como(quem: keyof typeof pessoas, papel: TipoUsuario) {
  estado.sessao = { user: { id: pessoas[quem], organizacaoId: org, tipo: papel, papel, name: quem } }
}
const req = (url: string, method = "GET", corpo?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, ...(corpo ? { body: JSON.stringify(corpo), headers: { "content-type": "application/json" } } : {}) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const pedirUrl = () => urlDeEnvio(req(`/api/coberturas/${cob}/uploads/upload-url?tipo=foto&contentType=image/jpeg&dia=1`), params(cob))
const registrar = (membroId?: string) => uploads.POST(req(`/api/coberturas/${cob}/uploads`, "POST", {
  url: `/api/midia/org/${org}/coberturas/${cob}/dia-1/foto/${randomUUID()}.jpg`, tipo: "foto", dia: 1, titulo: "Stand", ...(membroId ? { membroId } : {}),
}), params(cob))

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  const papeis: [keyof typeof pessoas, TipoUsuario][] = [["admin", "admin"], ["escalado", "videomaker"], ["fora", "videomaker"]]
  for (const [quem, papel] of papeis) {
    await db.usuario.create({ data: { id: pessoas[quem], nome: quem, tipo: papel, senhaHash: "sintetico" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: pessoas[quem], organizacaoId: org, papel, categoria: papel === "videomaker" ? "externo" : "interna", areas: [] } })
  }
  for (const [quem, id] of Object.entries(vms)) {
    await db.videomaker.create({ data: { id, nome: quem, usuarioId: pessoas[quem as keyof typeof pessoas], redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
    await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: id, tipoContrato: "externo" } })
  }
  await db.eventoCobertura.create({ data: { id: cob, organizacaoId: org, titulo: "Feira", slug: `${p}-feira`, dataInicio: new Date(), dataFim: new Date(), createdById: pessoas.admin } })
  membroEscalado = (await db.eventoCoberturaEquipe.create({ data: { coberturaId: cob, videomakerId: vms.escalado, nome: "Escalado" } })).id
  membroOutro = (await db.eventoCoberturaEquipe.create({ data: { coberturaId: cob, nome: "Outro da equipe" } })).id
  itemChecklist = (await db.eventoCoberturaChecklist.create({ data: { coberturaId: cob, dia: 1, texto: "Bateria", categoria: "equipamento" } })).id
})

afterAll(async () => {
  await db.eventoFaceDescriptor.deleteMany({ where: { upload: { coberturaId: cob } } })
  await db.eventoCoberturaUpload.deleteMany({ where: { coberturaId: cob } })
  await db.eventoCoberturaLog.deleteMany({ where: { coberturaId: cob } })
  await db.eventoCoberturaChecklist.deleteMany({ where: { coberturaId: cob } })
  await db.eventoCoberturaEquipe.deleteMany({ where: { coberturaId: cob } })
  await db.eventoCobertura.deleteMany({ where: { organizacaoId: org } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: org } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.videomakerOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: { in: Object.values(vms) } } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("app de campo: quem está escalado na cobertura", () => {
  it("videomaker externo escalado pede o endereço de envio e registra a foto, em nome da própria linha", async () => {
    como("escalado", "videomaker")
    expect((await pedirUrl()).status).toBe(200)
    // Mesmo mandando a linha de outro membro, o envio fica com a dele.
    const r = await registrar(membroOutro)
    expect(r.status).toBe(201)
    const { upload } = await r.json() as { upload: { id: string; membroId: string } }
    expect(upload.membroId).toBe(membroEscalado)
    expect((await uploads.GET(req(`/api/coberturas/${cob}/uploads`), params(cob))).status).toBe(200)
    // Marca o checklist e grava o rosto da própria foto.
    expect((await checklist.PATCH(req(`/api/coberturas/${cob}/checklist`, "PATCH", { itemId: itemChecklist, concluido: true }), params(cob))).status).toBe(200)
    expect((await descritor(req("/api/campo/face-descriptors", "POST", { uploadId: upload.id, descriptor: Array(128).fill(0.1) }))).status).toBe(200)
    // Inicia o evento, mas não edita o resto dele.
    expect((await editarCobertura(req(`/api/coberturas/${cob}`, "PUT", { status: "em_andamento" }), params(cob))).status).toBe(200)
    expect((await editarCobertura(req(`/api/coberturas/${cob}`, "PUT", { titulo: "Outro" }), params(cob))).status).toBe(403)
    expect((await editarCobertura(req(`/api/coberturas/${cob}`, "PUT", { status: "cancelado" }), params(cob))).status).toBe(403)
  })

  it("videomaker que não está na equipe recebe 403 em tudo", async () => {
    como("escalado", "videomaker")
    const { upload } = await (await registrar()).json() as { upload: { id: string } }
    como("fora", "videomaker")
    expect((await pedirUrl()).status).toBe(403)
    expect((await registrar()).status).toBe(403)
    expect((await uploads.GET(req(`/api/coberturas/${cob}/uploads`), params(cob))).status).toBe(403)
    expect((await uploads.DELETE(req(`/api/coberturas/${cob}/uploads?uploadId=${upload.id}`, "DELETE"), params(cob))).status).toBe(403)
    expect((await checklist.PATCH(req(`/api/coberturas/${cob}/checklist`, "PATCH", { itemId: itemChecklist, concluido: false }), params(cob))).status).toBe(403)
    expect((await descritor(req("/api/campo/face-descriptors", "POST", { uploadId: upload.id, descriptor: Array(128).fill(0.2) }))).status).toBe(403)
    expect((await editarCobertura(req(`/api/coberturas/${cob}`, "PUT", { status: "concluido" }), params(cob))).status).toBe(403)
    expect(await db.eventoCoberturaUpload.count({ where: { id: upload.id } })).toBe(1)
  })

  it("escalado só apaga o que ele mesmo subiu; a gestão apaga qualquer um", async () => {
    como("admin", "admin")
    const { upload: daGestao } = await (await registrar(membroOutro)).json() as { upload: { id: string } }
    como("escalado", "videomaker")
    expect((await uploads.DELETE(req(`/api/coberturas/${cob}/uploads?uploadId=${daGestao.id}`, "DELETE"), params(cob))).status).toBe(403)
    const { upload: dele } = await (await registrar()).json() as { upload: { id: string } }
    expect((await uploads.DELETE(req(`/api/coberturas/${cob}/uploads?uploadId=${dele.id}`, "DELETE"), params(cob))).status).toBe(200)
    como("admin", "admin")
    expect((await uploads.DELETE(req(`/api/coberturas/${cob}/uploads?uploadId=${daGestao.id}`, "DELETE"), params(cob))).status).toBe(200)
  })
})
