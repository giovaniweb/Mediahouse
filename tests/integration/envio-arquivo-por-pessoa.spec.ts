import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import type { TipoUsuario } from "@prisma/client"

// As rotas de arquivo da demanda conferiam só a EMPRESA (04/11/2026). Qualquer
// pessoa logada nela chamava `upload-url`, `upload-video` ou o registro da
// versão para o cliente (`POST /api/aprovacao-video`) direto num card que não
// era dela, e trocava ou apagava o vídeo final, os brutos ou os anexos.
//
// A régua agora é a da ficha (lib/quem-envia-arquivo): fora do escopo da
// pessoa, 404, como card que não existe; no escopo, sobe a gestão, quem tem
// "Editar Demanda" ou quem faz a peça; o anexo, também o solicitante no
// próprio pedido. Rotas reais e banco real; só a sessão, o Storage, a
// conferência dos bytes e os avisos em segundo plano são simulados.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))
vi.mock("@/lib/midia-limite", () => ({ conferirUpload: async () => null, recusarUploads: async () => null }))
vi.mock("@/lib/transcode", () => ({ precisaTranscodeConferindo: async () => false, enqueueTranscode: async () => false }))
// Sem Storage no teste: a URL assinada é de mentira, o caminho é o de verdade.
vi.mock("@/lib/midia", async (original) => ({
  ...(await original<typeof import("@/lib/midia")>()),
  urlDeUpload: async (caminho: string) => ({ uploadUrl: `https://storage.test/${caminho}`, url: `/api/midia/${caminho}` }),
}))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { PRESETS } from "@/lib/permissoes"
import { GET as pedirUrl } from "@/app/api/demandas/[id]/upload-url/route"
import { PATCH as registrar, POST as subirPeloServidor } from "@/app/api/demandas/[id]/upload-video/route"
import { POST as gerarAprovacao } from "@/app/api/aprovacao-video/route"

const p = `envio-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = {
  admin: `${p}-admin`,
  solicitante: `${p}-solic`,
  videomaker: `${p}-vm-login`,
  editor: `${p}-editor`,
  designer: `${p}-designer`,
  eventos: `${p}-eventos`,
}
const papelDe: Record<keyof typeof pessoas, TipoUsuario> = {
  admin: "admin", solicitante: "solicitante", videomaker: "videomaker", editor: "editor", designer: "designer", eventos: "gestor_eventos",
}
const perfis = { vm: `${p}-vm`, ed: `${p}-ed`, des: `${p}-des` }
const cards = { alheio: `${p}-alheio`, doSolicitante: `${p}-do-solic`, arte: `${p}-arte` }

function como(quem: keyof typeof pessoas) {
  const papel = papelDe[quem]
  estado.sessao = { user: { id: pessoas[quem], organizacaoId: org, tipo: papel, papel, name: quem } }
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const video = (id: string, nome = `${randomUUID().slice(0, 8)}.mp4`) => `/api/midia/org/${org}/videos/${id}/${nome}`
const doc = (id: string) => `/api/midia/org/${org}/docs/${id}/${randomUUID().slice(0, 8)}.pdf`

const url = (id: string, tipo: string, contentType = "video/mp4") => pedirUrl(
  new NextRequest(`http://localhost/api/demandas/${id}/upload-url?tipo=${tipo}&contentType=${encodeURIComponent(contentType)}`), params(id))
const gravar = (id: string, corpo: object) => registrar(
  new NextRequest(`http://localhost/api/demandas/${id}/upload-video`, { method: "PATCH", body: JSON.stringify(corpo) }), params(id))
function subir(id: string, tipo: string) {
  const form = new FormData()
  form.set("tipo", tipo)
  form.set("file", new File([new Uint8Array([0, 0, 0, 24])], "final.mp4", { type: "video/mp4" }))
  return subirPeloServidor(new NextRequest(`http://localhost/api/demandas/${id}/upload-video`, { method: "POST", body: form }), params(id))
}
const aprovacao = (demandaId: string, urlVideo: string) => gerarAprovacao(
  new NextRequest("http://localhost/api/aprovacao-video", { method: "POST", body: JSON.stringify({ demandaId, urlVideo }) }))

/** O que o card tem de arquivo e de link: o que uma troca ou exclusão mudaria. */
async function retrato(id: string) {
  const d = await db.demanda.findUniqueOrThrow({ where: { id }, select: { linkFinal: true, linkBrutos: true, linkCliente: true } })
  const arquivos = await db.arquivo.findMany({ where: { demandaId: id }, select: { id: true, tipoArquivo: true, url: true }, orderBy: { id: "asc" } })
  const aprovacoes = await db.aprovacaoVideo.count({ where: { demandaId: id } })
  return { ...d, arquivos, aprovacoes }
}

let finalAlheio = "", docAlheio = ""

beforeAll(async () => {
  vi.stubEnv("NEXTAUTH_URL", "https://nuflow.test/")
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const [quem, id] of Object.entries(pessoas) as [keyof typeof pessoas, string][]) {
    const papel = papelDe[quem]
    await db.usuario.create({ data: { id, nome: quem, email: `${id}@exemplo.test`, tipo: papel, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: id, organizacaoId: org, papel, areas: papel === "designer" ? ["growth"] : ["audiovisual"] } })
    // Como nasce quem é criado pela tela: o registro explícito copia o preset.
    if (papel !== "admin") await db.permissaoUsuario.create({ data: { usuarioId: id, organizacaoId: org, ...PRESETS[papel] } })
  }
  // O videomaker externo com login (#118), o editor e o designer, cada um com o
  // próprio perfil profissional ligado ao usuário.
  await db.videomaker.create({ data: { id: perfis.vm, nome: "Alan", usuarioId: pessoas.videomaker } })
  await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: perfis.vm, tipoContrato: "externo" } })
  await db.editor.create({ data: { id: perfis.ed, nome: "Edu", usuarioId: pessoas.editor } })
  await db.editorOrganizacao.create({ data: { organizacaoId: org, editorId: perfis.ed } })
  await db.designer.create({ data: { id: perfis.des, nome: "Dani", usuarioId: pessoas.designer } })
  await db.designerOrganizacao.create({ data: { organizacaoId: org, designerId: perfis.des } })

  const card = { organizacaoId: org, descricao: "Briefing do vídeo.", cidade: "Curitiba", area: "audiovisual" as const,
    tipoVideo: "reels", departamento: "audiovisual", statusInterno: "editando" as const, statusVisivel: "edicao" as const }
  await db.demanda.createMany({ data: [
    // O card de outra pessoa: pedido da gestão, editado pelo Edu.
    { ...card, id: cards.alheio, codigo: cards.alheio, titulo: "Vídeo do treinamento", solicitanteId: pessoas.admin, editorId: perfis.ed },
    // O pedido do solicitante, gravado pelo videomaker externo.
    { ...card, id: cards.doSolicitante, codigo: cards.doSolicitante, titulo: "Vídeo da clínica", solicitanteId: pessoas.solicitante, videomakerId: perfis.vm },
    // A arte do designer, no Growth.
    { ...card, id: cards.arte, codigo: cards.arte, titulo: "Arte do convite", area: "design", tipoVideo: "post_estatico", departamento: "growth",
      solicitanteId: pessoas.admin, designerId: perfis.des },
  ] })

  // O card alheio já tem o vídeo final e um anexo: é o que não pode sumir.
  finalAlheio = video(cards.alheio, "final-v1.mp4")
  docAlheio = doc(cards.alheio)
  await db.demanda.update({ where: { id: cards.alheio }, data: { linkFinal: finalAlheio } })
  await db.arquivo.createMany({ data: [
    { demandaId: cards.alheio, tipoArquivo: "final", url: finalAlheio, nomeArquivo: "final-v1.mp4", sequencia: 1 },
    { demandaId: cards.alheio, tipoArquivo: "documento", url: docAlheio, nomeArquivo: "roteiro.pdf", sequencia: 1 },
  ] })
})

beforeEach(() => { estado.sessao = null })

afterAll(async () => {
  const ids = Object.values(cards)
  await db.aprovacaoVideo.deleteMany({ where: { demandaId: { in: ids } } })
  await db.arquivo.deleteMany({ where: { demandaId: { in: ids } } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
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
  vi.unstubAllEnvs()
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

const idDo = async (id: string, tipoArquivo: "final" | "documento") =>
  (await db.arquivo.findFirstOrThrow({ where: { demandaId: id, tipoArquivo }, orderBy: { sequencia: "asc" }, select: { id: true } })).id

describe("arquivo da demanda: quem sobe, troca e apaga", () => {
  it("o videomaker externo, num card que não é dele, não pede URL, não troca nem apaga nada", async () => {
    const antes = await retrato(cards.alheio)
    como("videomaker")
    expect((await url(cards.alheio, "final")).status).toBe(404)
    expect((await url(cards.alheio, "documento", "application/pdf")).status).toBe(404)
    expect((await gravar(cards.alheio, { url: video(cards.alheio), tipo: "final" })).status).toBe(404)
    expect((await gravar(cards.alheio, { url: null, tipo: "final", arquivoId: await idDo(cards.alheio, "final") })).status).toBe(404)
    expect((await gravar(cards.alheio, { url: null, tipo: "brutos" })).status).toBe(404)
    expect((await gravar(cards.alheio, { url: null, tipo: "documento", arquivoId: await idDo(cards.alheio, "documento") })).status).toBe(404)
    expect((await subir(cards.alheio, "final")).status).toBe(404)
    expect((await aprovacao(cards.alheio, video(cards.alheio))).status).toBe(404)
    expect(await retrato(cards.alheio)).toEqual(antes)
  })

  it("nem no card em que grava: o videomaker entrega pelo link do convite", async () => {
    const antes = await retrato(cards.doSolicitante)
    como("videomaker")
    expect((await url(cards.doSolicitante, "final")).status).toBe(403)
    const res = await gravar(cards.doSolicitante, { url: video(cards.doSolicitante), tipo: "final" })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/quem faz a peça/)
    expect((await gravar(cards.doSolicitante, { url: video(cards.doSolicitante), tipo: "brutos" })).status).toBe(403)
    expect(await retrato(cards.doSolicitante)).toEqual(antes)
  })

  it("o solicitante, num pedido que não é dele, não anexa, não troca nem apaga", async () => {
    const antes = await retrato(cards.alheio)
    como("solicitante")
    expect((await url(cards.alheio, "documento", "application/pdf")).status).toBe(404)
    expect((await gravar(cards.alheio, { url: doc(cards.alheio), tipo: "documento", nomeArquivo: "x.pdf" })).status).toBe(404)
    expect((await gravar(cards.alheio, { url: null, tipo: "documento", arquivoId: await idDo(cards.alheio, "documento") })).status).toBe(404)
    expect((await gravar(cards.alheio, { url: null, tipo: "final" })).status).toBe(404)
    expect((await aprovacao(cards.alheio, "https://golpe.example/video")).status).toBe(404)
    expect(await retrato(cards.alheio)).toEqual(antes)
  })

  it("no próprio pedido, o solicitante anexa documento (o formulário de criação faz isso), mas não sobe o vídeo final", async () => {
    como("solicitante")
    expect((await url(cards.doSolicitante, "documento", "application/pdf")).status).toBe(200)
    const anexo = doc(cards.doSolicitante)
    expect((await gravar(cards.doSolicitante, { url: anexo, tipo: "documento", nomeArquivo: "briefing.pdf" })).status).toBe(200)
    expect((await retrato(cards.doSolicitante)).arquivos).toEqual([expect.objectContaining({ tipoArquivo: "documento", url: anexo })])

    expect((await url(cards.doSolicitante, "final")).status).toBe(403)
    expect((await gravar(cards.doSolicitante, { url: video(cards.doSolicitante), tipo: "final" })).status).toBe(403)
    expect((await aprovacao(cards.doSolicitante, video(cards.doSolicitante))).status).toBe(403)
    expect((await retrato(cards.doSolicitante)).linkFinal).toBeNull()
  })

  it("quem vê todas as demandas mas não edita nem faz a peça recebe 403", async () => {
    const antes = await retrato(cards.alheio)
    como("eventos")
    expect((await url(cards.alheio, "final")).status).toBe(403)
    expect((await gravar(cards.alheio, { url: video(cards.alheio), tipo: "final" })).status).toBe(403)
    expect((await gravar(cards.alheio, { url: null, tipo: "documento", arquivoId: await idDo(cards.alheio, "documento") })).status).toBe(403)
    expect((await aprovacao(cards.alheio, video(cards.alheio))).status).toBe(403)
    // O designer também vê todas (preset), e este card não é dele.
    como("designer")
    expect((await gravar(cards.alheio, { url: video(cards.alheio), tipo: "final" })).status).toBe(403)
    expect(await retrato(cards.alheio)).toEqual(antes)
  })

  it("a gestão e o editor responsável continuam subindo, trocando e mandando para aprovação", async () => {
    como("admin")
    const res = await url(cards.alheio, "final")
    expect(res.status).toBe(200)
    expect((await res.json()).publicUrl).toMatch(new RegExp(`^/api/midia/org/${org}/videos/${cards.alheio}/`))
    const daGestao = video(cards.alheio, "final-v2.mp4")
    expect((await gravar(cards.alheio, { url: daGestao, tipo: "final" })).status).toBe(200)

    como("editor")
    expect((await url(cards.alheio, "final")).status).toBe(200)
    expect((await url(cards.alheio, "thumbnail", "image/jpeg")).status).toBe(200)
    const doEditor = video(cards.alheio, "final-v3.mp4")
    expect((await gravar(cards.alheio, { url: doEditor, tipo: "final", nomeArquivo: "final v3.mp4" })).status).toBe(200)
    expect((await retrato(cards.alheio)).linkFinal).toBe(doEditor)
    const gerado = await aprovacao(cards.alheio, doEditor)
    expect(gerado.status).toBe(200)
    expect((await retrato(cards.alheio)).linkCliente).toBe(`https://nuflow.test/aprovar/${(await gerado.json()).token}`)

    // Apagar a versão errada continua com quem edita.
    const v2 = (await db.arquivo.findFirstOrThrow({ where: { demandaId: cards.alheio, url: daGestao }, select: { id: true } })).id
    expect((await gravar(cards.alheio, { url: null, tipo: "final", arquivoId: v2 })).status).toBe(200)
    expect((await retrato(cards.alheio)).arquivos.map((a) => a.url)).not.toContain(daGestao)
  })

  it("o designer sobe a arte do card dele, mesmo sem \"Editar Demanda\" no preset", async () => {
    expect(PRESETS.designer.editarDemanda).toBe(false)
    como("designer")
    expect((await url(cards.arte, "final", "image/png")).status).toBe(200)
    const arte = video(cards.arte, "arte.png")
    expect((await gravar(cards.arte, { url: arte, tipo: "final", nomeArquivo: "arte.png" })).status).toBe(200)
    expect((await aprovacao(cards.arte, arte)).status).toBe(200)
    expect((await retrato(cards.arte)).linkFinal).toBe(arte)
  })
})
