import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Aprovar a entrega por dentro do NuFlow: a mesma resposta do link do cliente,
// pela sessão. Quem pediu aprova; quem fez a peça não; o pedido de ajuste vira
// trabalho — status, histórico, Conversa, alerta e aviso ao editor. O link do
// cliente continua respondendo como antes. Banco real, dados sintéticos.
const { estado, agendados } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
  agendados: [] as string[],
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
// Nenhum WhatsApp sai do teste; o rótulo diz o que teria sido avisado.
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: (_t: unknown, rotulo: string) => { agendados.push(rotulo) } }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { POST as responderPorDentro } from "@/app/api/demandas/[id]/responder-entrega/route"
import { GET as lerDemanda } from "@/app/api/demandas/[id]/route"
import { POST as responderPeloLink } from "@/app/api/aprovacao-video/[token]/route"

const p = `aprovar-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = { solicitante: `${p}-sol`, editor: `${p}-ed`, gestor: `${p}-gestor`, outro: `${p}-outro` }
const editorId = `${p}-editor`

function sessao(id: string, papel = "solicitante") {
  estado.sessao = { user: { id, organizacaoId: org, tipo: papel, papel, name: id } }
}

let seq = 0
async function novaEntrega() {
  const d = await db.demanda.create({ data: {
    organizacaoId: org, codigo: `${p}-${++seq}`, titulo: "Visita - Dr. Teste", descricao: "Teste", cidade: "Teste", departamento: "audiovisual", tipoVideo: "reels",
    area: "audiovisual", solicitanteId: pessoas.solicitante, editorId,
    statusInterno: "revisao_pendente", statusVisivel: "aprovacao",
  } })
  const a = await db.aprovacaoVideo.create({ data: { demandaId: d.id, urlVideo: "https://exemplo.test/v.mp4", status: "pendente" } })
  return { demandaId: d.id, token: a.token }
}

function porDentro(demandaId: string, body: Record<string, unknown>) {
  return responderPorDentro(
    new NextRequest(`http://localhost/api/demandas/${demandaId}/responder-entrega`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: demandaId }) },
  )
}

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const [papel, id] of Object.entries(pessoas)) {
    await db.usuario.create({ data: { id, nome: `Nome ${papel}`, tipo: papel === "gestor" ? "gestor" : "solicitante", senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: {
      usuarioId: id, organizacaoId: org, areas: ["audiovisual"], papel: papel === "gestor" ? "gestor" : "solicitante",
    } })
  }
  await db.editor.create({ data: {
    id: editorId, nome: "Editor", usuarioId: pessoas.editor, telefone: "5511999990000",
    especialidade: [], habilidades: [], redesSociais: [], areasAtuacao: [], equipamentos: [],
  } })
})

beforeEach(() => { agendados.length = 0 })

afterAll(async () => {
  const ids = (await db.demanda.findMany({ where: { organizacaoId: org }, select: { id: true } })).map((d) => d.id)
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.comentario.deleteMany({ where: { demandaId: { in: ids } } })
  await db.aprovacaoVideo.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.editor.deleteMany({ where: { id: editorId } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("aprovar a entrega por dentro", () => {
  it("quem pediu aprova: card vai para Para postar, com o nome no histórico", async () => {
    const { demandaId, token } = await novaEntrega()
    sessao(pessoas.solicitante)
    const res = await porDentro(demandaId, { acao: "aprovar", token })
    expect(res.status).toBe(200)
    const d = await db.demanda.findUniqueOrThrow({ where: { id: demandaId } })
    expect(d).toMatchObject({ statusInterno: "aprovado", statusVisivel: "para_postar" })
    const a = await db.aprovacaoVideo.findUniqueOrThrow({ where: { token } })
    expect(a).toMatchObject({ status: "aprovado", aprovadoPor: "Nome solicitante" })
    const h = await db.historicoStatus.findFirstOrThrow({ where: { demandaId, statusNovo: "aprovado" } })
    expect(h).toMatchObject({ usuarioId: pessoas.solicitante, statusAnterior: "revisao_pendente" })
  })

  it("quem fez a peça não aprova a própria entrega, e o detalhe já diz isso", async () => {
    const { demandaId, token } = await novaEntrega()
    sessao(pessoas.editor)
    expect((await porDentro(demandaId, { acao: "aprovar", token })).status).toBe(403)
    const det = await (await lerDemanda(new NextRequest(`http://localhost/api/demandas/${demandaId}`), { params: Promise.resolve({ id: demandaId }) })).json()
    expect(det.podeAprovarEntrega).toBe(false)
    expect(det.ultimaEntrega).toMatchObject({ token, status: "pendente" })
    // Um membro sem relação com o card também não.
    sessao(pessoas.outro)
    expect((await porDentro(demandaId, { acao: "aprovar", token })).status).toBe(403)
    // Gestor sim.
    sessao(pessoas.gestor, "gestor")
    const detGestor = await (await lerDemanda(new NextRequest(`http://localhost/api/demandas/${demandaId}`), { params: Promise.resolve({ id: demandaId }) })).json()
    expect(detGestor.podeAprovarEntrega).toBe(true)
  })

  it("pedir ajuste exige o texto e vira trabalho: status, histórico, Conversa, alerta e aviso ao editor", async () => {
    const { demandaId, token } = await novaEntrega()
    sessao(pessoas.solicitante)
    expect((await porDentro(demandaId, { acao: "feedback", token, comentario: "  " })).status).toBe(400)

    const res = await porDentro(demandaId, { acao: "feedback", token, comentario: "[0:12] tirar a logo antiga" })
    expect(res.status).toBe(200)
    const d = await db.demanda.findUniqueOrThrow({ where: { id: demandaId } })
    expect(d).toMatchObject({ statusInterno: "ajuste_solicitado", statusVisivel: "aprovacao" })
    const h = await db.historicoStatus.findFirstOrThrow({ where: { demandaId, statusNovo: "ajuste_solicitado" } })
    expect(h.observacao).toBe("Ajuste pedido por Nome solicitante: [0:12] tirar a logo antiga")
    const c = await db.comentario.findFirstOrThrow({ where: { demandaId } })
    expect(c).toMatchObject({ usuarioId: pessoas.solicitante, comentario: "Pediu ajuste: [0:12] tirar a logo antiga" })
    expect(await db.alertaIA.count({ where: { demandaId, tipoAlerta: "ajuste_solicitado" } })).toBe(1)
    expect(agendados).toContain("wa-editor-aprovacao")
    expect(agendados).toContain("gestores-aprovacao")

    // O detalhe devolve o ajuste para o aviso do topo.
    sessao(pessoas.editor)
    const det = await (await lerDemanda(new NextRequest(`http://localhost/api/demandas/${demandaId}`), { params: Promise.resolve({ id: demandaId }) })).json()
    expect(det.ultimaEntrega).toMatchObject({ status: "feedback_solicitado", aprovadoPor: "Nome solicitante", comentario: "[0:12] tirar a logo antiga" })

    // Respondida, não se responde de novo — nem por dentro, nem pelo link.
    sessao(pessoas.gestor, "gestor")
    expect((await porDentro(demandaId, { acao: "aprovar", token })).status).toBe(400)
    estado.sessao = null
    const link = await responderPeloLink(
      new NextRequest(`http://localhost/api/aprovacao-video/${token}`, { method: "POST", body: JSON.stringify({ acao: "aprovar" }) }),
      { params: Promise.resolve({ token }) },
    )
    expect(link.status).toBe(400)
  })

  it("o link do cliente responde como antes", async () => {
    const { demandaId, token } = await novaEntrega()
    estado.sessao = null
    const res = await responderPeloLink(
      new NextRequest(`http://localhost/api/aprovacao-video/${token}`, { method: "POST", body: JSON.stringify({ acao: "feedback", aprovadoPor: "Carol", comentario: "Trocar a música" }) }),
      { params: Promise.resolve({ token }) },
    )
    expect(res.status).toBe(200)
    const d = await db.demanda.findUniqueOrThrow({ where: { id: demandaId } })
    expect(d.statusInterno).toBe("ajuste_solicitado")
    const h = await db.historicoStatus.findFirstOrThrow({ where: { demandaId, statusNovo: "ajuste_solicitado" } })
    expect(h).toMatchObject({ usuarioId: null, observacao: "Feedback do cliente: Trocar a música" })
    expect(await db.alertaIA.findFirstOrThrow({ where: { demandaId } })).toMatchObject({ mensagem: '🔄 Cliente solicitou ajustes: "Trocar a música"' })
    // Cliente não é usuário: o ajuste dele fica no histórico, não vira fala na Conversa.
    expect(await db.comentario.count({ where: { demandaId } })).toBe(0)
  })
})
