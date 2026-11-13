import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Videomaker que trabalha por uma empresa — Fases C e D (12/11/2026), o roteiro
// do plano de ponta a ponta com rotas reais e banco real:
//   a Contourline grava "Empresa dele: GH"; a GH aceita a parceria; aparecem os
//   2 cards abertos e o concluído não; o Gabriel escolhe o X; o X capta e
//   entrega; a Contourline vê só o Gabriel; trocar o videomaker tira o card da GH.
// E as rotas que continuam só da dona respondem 404 para a GH.
const { estado, pendentes } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
  pendentes: [] as Promise<unknown>[],
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
// Os avisos em segundo plano rodam de verdade e são esperados (`esperarAvisos`).
vi.mock("@/lib/notificar", () => ({
  emSegundoPlano: (tarefa: () => Promise<unknown>) => { pendentes.push(Promise.resolve().then(tarefa).catch(() => null)) },
}))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as listar } from "@/app/api/demandas/route"
import * as card from "@/app/api/demandas/[id]/route"
import * as espelhar from "@/app/api/demandas/[id]/espelhar/route"
import * as executor from "@/app/api/demandas/[id]/executor/route"
import * as compartilhar from "@/app/api/demandas/[id]/compartilhar/route"
import * as aprovar from "@/app/api/demandas/[id]/aprovar/route"
import * as pagamento from "@/app/api/demandas/[id]/pagamento/route"
import * as produto from "@/app/api/demandas/[id]/produto/route"
import * as checklist from "@/app/api/demandas/[id]/checklist/route"
import * as uploadUrl from "@/app/api/demandas/[id]/upload-url/route"
import * as uploadVideo from "@/app/api/demandas/[id]/upload-video/route"
import * as convite from "@/app/api/demandas/[id]/convite/route"
import * as responderEntrega from "@/app/api/demandas/[id]/responder-entrega/route"
import * as enviarWhatsapp from "@/app/api/demandas/[id]/enviar-whatsapp/route"
import * as nota from "@/app/api/jobs/[id]/nota/route"
import * as cancelar from "@/app/api/jobs/[id]/cancelar/route"
import * as transferir from "@/app/api/jobs/[id]/transferir/route"
import * as custos from "@/app/api/custos-videomaker/route"
import * as aprovacaoVideo from "@/app/api/aprovacao-video/route"
import * as videomaker from "@/app/api/videomakers/[id]/route"
import { POST as duplicar } from "@/app/api/demandas/[id]/duplicate/route"
import * as empresa from "@/app/api/videomakers/[id]/empresa/route"
import { PATCH as mover } from "@/app/api/demandas/[id]/status/route"
import { POST as captar } from "@/app/api/jobs/[id]/captacao/route"
import { POST as entregar } from "@/app/api/jobs/[id]/entrega/route"
import { GET as parcerias } from "@/app/api/parcerias/route"
import { PATCH as responderParceria } from "@/app/api/parcerias/[id]/route"

const p = `gh-${randomUUID().slice(0, 8)}`
const org = { dona: `${p}-contourline`, gh: `${p}-gh` }
const nomes = { dona: `Contourline-teste ${p}`, gh: `GH-teste ${p}` }
const gente = { debora: `${p}-debora`, gabriel: `${p}-gabriel`, x: `${p}-x`, y: `${p}-y` }
const vm = { gabriel: `${p}-vm-gabriel`, x: `${p}-vm-x`, y: `${p}-vm-y`, outro: `${p}-vm-outro` }
const cards = { a: `${p}-a`, b: `${p}-b`, concluido: `${p}-fim` }

function como(id: string, organizacaoId: string, papel: string) {
  estado.sessao = { user: { id, organizacaoId, tipo: papel, papel, name: id } }
}
const comoDebora = () => como(gente.debora, org.dona, "admin")
const comoGabriel = () => como(gente.gabriel, org.gh, "admin")
const comoX = () => como(gente.x, org.gh, "videomaker")
const comoY = () => como(gente.y, org.gh, "videomaker")
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://localhost${url}`, { method: init?.method ?? "GET", ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}) })
async function esperarAvisos() { while (pendentes.length) await pendentes.shift() }

async function idsNaLista(consulta = "limit=200") {
  const { demandas } = await (await listar(req(`/api/demandas?${consulta}`))).json() as { demandas: { id: string }[] }
  return new Set(demandas.map((d) => d.id).filter((id) => id.startsWith(p)))
}
const abrir = (id: string) => card.GET(req(`/api/demandas/${id}`), params(id))

beforeAll(async () => {
  // O convite cifra o telefone do videomaker (lib/secret-crypto.ts).
  vi.stubEnv("NEXTAUTH_SECRET", "segredo-sintetico-de-teste")
  await db.organizacao.createMany({ data: [
    { id: org.dona, nome: nomes.dona, slug: org.dona },
    { id: org.gh, nome: nomes.gh, slug: org.gh },
  ] })
  const papel = { debora: "admin", gabriel: "admin", x: "videomaker", y: "videomaker" } as const
  for (const [k, id] of Object.entries(gente) as [keyof typeof gente, string][]) {
    await db.usuario.create({ data: { id, nome: `${k[0].toUpperCase()}${k.slice(1)} ${p}`, email: `${id}@exemplo.test`, tipo: papel[k], senhaHash: "sem-login" } })
  }
  await db.usuarioOrganizacao.createMany({ data: [
    { usuarioId: gente.debora, organizacaoId: org.dona, papel: "admin", categoria: "interna", areas: ["audiovisual"] },
    { usuarioId: gente.gabriel, organizacaoId: org.gh, papel: "admin", categoria: "interna", areas: ["audiovisual"] },
    { usuarioId: gente.x, organizacaoId: org.gh, papel: "videomaker", categoria: "externo", areas: ["audiovisual"] },
    { usuarioId: gente.y, organizacaoId: org.gh, papel: "videomaker", categoria: "externo", areas: ["audiovisual"] },
  ] })
  await db.videomaker.createMany({ data: [
    { id: vm.gabriel, nome: `Gabriel ${p}`, usuarioId: gente.gabriel, telefone: "5541900000101" },
    { id: vm.x, nome: `X da GH ${p}`, usuarioId: gente.x, telefone: "5541900000102" },
    { id: vm.y, nome: `Y da GH ${p}`, usuarioId: gente.y },
    { id: vm.outro, nome: `Outro ${p}` },
  ] })
  await db.videomakerOrganizacao.createMany({ data: [
    { organizacaoId: org.dona, videomakerId: vm.gabriel, valorDiaria: 1200 },
    { organizacaoId: org.dona, videomakerId: vm.outro },
    { organizacaoId: org.gh, videomakerId: vm.x },
    { organizacaoId: org.gh, videomakerId: vm.y },
  ] })
  const base = {
    organizacaoId: org.dona, descricao: "Gravar depoimentos na clínica.", cidade: "Curitiba", tipoVideo: "cobertura_evento",
    departamento: "eventos", cobertura: true, tipoGravacao: "conteudo" as const, edicaoPor: "equipe" as const,
    solicitanteId: gente.debora, videomakerId: vm.gabriel, localGravacao: "Clínica Bem Estar",
    clienteFinalTelefone: "5541900000999", publicToken: `${p}-tok`,
  }
  await db.demanda.createMany({ data: [
    { ...base, id: cards.a, codigo: cards.a, titulo: "Depoimentos Ultraformer", statusInterno: "videomaker_aceitou", statusVisivel: "producao", dataCaptacao: new Date("2026-11-20T13:00:00Z") },
    { ...base, id: cards.b, codigo: cards.b, titulo: "Entrega de equipamento", statusInterno: "videomaker_notificado", statusVisivel: "producao", publicToken: `${p}-tok-b` },
    { ...base, id: cards.concluido, codigo: cards.concluido, titulo: "Gravação de outubro", statusInterno: "encerrado", statusVisivel: "finalizado", finalizadaEm: new Date("2026-10-20T12:00:00Z"), publicToken: `${p}-tok-c` },
  ] })
  await db.comentario.create({ data: { demandaId: cards.a, usuarioId: gente.debora, comentario: `Conversa interna ${p}` } })
})

afterAll(async () => {
  await esperarAvisos()
  const orgs = { in: Object.values(org) }
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: orgs } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: orgs } })
  await db.demanda.deleteMany({ where: { organizacaoId: orgs } })
  await db.parceriaOrganizacao.deleteMany({ where: { organizacaoConvidanteId: org.dona } })
  await db.videomaker.deleteMany({ where: { id: { in: Object.values(vm) } } })
  await db.organizacao.deleteMany({ where: { id: orgs } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(gente) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("roteiro: Gabriel trabalha para a Contourline pela GH", () => {
  it("1. a Contourline grava 'Empresa dele: GH' — sem parceria aceita, nada aparece na GH", async () => {
    comoDebora()
    const res = await empresa.PUT(req(`/api/videomakers/${vm.gabriel}/empresa`, { method: "PUT", body: { slug: org.gh } }), params(vm.gabriel))
    expect(res.status).toBe(200)
    const corpo = await res.json()
    expect(corpo.empresa.nome).toBe(nomes.gh)
    expect(corpo.parceria).toMatchObject({ status: "pendente", convidouFoiEsta: true })
    comoGabriel()
    expect(await idsNaLista()).toEqual(new Set())
  })

  it("só a gestão da dona grava a Empresa dele; a GH recebe 404 no cadastro", async () => {
    comoGabriel()
    expect((await empresa.PUT(req(`/api/videomakers/${vm.gabriel}/empresa`, { method: "PUT", body: { slug: null } }), params(vm.gabriel))).status).toBe(404)
    expect((await empresa.GET(req(`/api/videomakers/${vm.gabriel}/empresa`), params(vm.gabriel))).status).toBe(404)
  })

  it("2–3. o Gabriel aceita na GH: aparecem os 2 cards abertos, o concluído não; a gestão da GH é avisada", async () => {
    comoGabriel()
    const { parcerias: lista } = await (await parcerias()).json() as { parcerias: { parceriaId: string; nome: string }[] }
    const convite = lista.find((x) => x.nome === nomes.dona)!
    const res = await responderParceria(req(`/api/parcerias/${convite.parceriaId}`, { method: "PATCH", body: { acao: "aceitar" } }), params(convite.parceriaId))
    expect(await res.json()).toMatchObject({ status: "aceita", espelhados: 2 })
    await esperarAvisos()

    expect(await idsNaLista()).toEqual(new Set([cards.a, cards.b]))
    // Gravações Externas da GH: o espelho automático é sempre Job.
    expect(await idsNaLista("quadro=jobs&limit=200")).toEqual(new Set([cards.a, cards.b]))
    const sino = await db.alertaIA.findMany({ where: { organizacaoId: org.gh, tipoAlerta: "espelho_chegou", usuarioId: gente.gabriel } })
    expect(sino).toHaveLength(2)
    // Sem QR da GH, nada é enfileirado no WhatsApp dela.
    expect(await db.mensagemWhatsapp.count({ where: { organizacaoId: org.gh } })).toBe(0)
  })

  it("na Contourline: o card diz 'pela GH' e o espelho automático não tem revogar", async () => {
    comoDebora()
    const corpo = await (await abrir(cards.a)).json()
    expect(corpo.espelho).toMatchObject({ papel: "origem", automatico: true, contraparte: nomes.gh })
    const del = await espelhar.DELETE(req(`/api/demandas/${cards.a}/espelhar?destino=${org.gh}`, { method: "DELETE" }), params(cards.a))
    expect(del.status).toBe(409)
  })

  it("4. o Gabriel escolhe o X; a Contourline e o X não alcançam a escolha", async () => {
    comoDebora()
    expect((await executor.GET(req(`/api/demandas/${cards.a}/executor`), params(cards.a))).status).toBe(404)
    comoX()
    expect((await executor.PUT(req(`/api/demandas/${cards.a}/executor`, { method: "PUT", body: { videomakerId: vm.x } }), params(cards.a))).status).toBe(403)

    comoGabriel()
    const { opcoes } = await (await executor.GET(req(`/api/demandas/${cards.a}/executor`), params(cards.a))).json() as { opcoes: { id: string }[] }
    expect(opcoes.map((o) => o.id).sort()).toEqual([vm.x, vm.y].sort())
    // Videomaker de fora da GH não serve.
    expect((await executor.PUT(req(`/api/demandas/${cards.a}/executor`, { method: "PUT", body: { videomakerId: vm.outro } }), params(cards.a))).status).toBe(400)
    const res = await executor.PUT(req(`/api/demandas/${cards.a}/executor`, { method: "PUT", body: { videomakerId: vm.x } }), params(cards.a))
    expect(res.status).toBe(200)
    await esperarAvisos()
    expect(await db.alertaIA.count({ where: { organizacaoId: org.gh, usuarioId: gente.x, tipoAlerta: "espelho_executor", demandaId: cards.a } })).toBe(1)
  })

  it("Minhas Gravações do X: só o card dele, sem a conversa entre as empresas; o Y não vê", async () => {
    comoX()
    expect(await idsNaLista("quadro=jobs&limit=200")).toEqual(new Set([cards.a]))
    const res = await abrir(cards.a)
    expect(res.status).toBe(200)
    const corpo = await res.json()
    expect(corpo.souExecutorDoEspelho).toBe(true)
    expect(corpo.demanda).not.toHaveProperty("comentarios")
    expect(corpo.demanda).toMatchObject({ localGravacao: "Clínica Bem Estar" })
    const texto = JSON.stringify(corpo)
    for (const s of [`Conversa interna ${p}`, "5541900000999", `${p}-tok`, "1200"]) expect(texto).not.toContain(s)
    expect((await abrir(cards.b)).status).toBe(404)
    comoY()
    expect((await abrir(cards.a)).status).toBe(404)
    expect(await idsNaLista("quadro=jobs&limit=200")).toEqual(new Set())
  })

  it("5. o X capta: na Contourline entra como do Gabriel, pela GH; quem foi fica na auditoria da GH", async () => {
    comoX()
    expect((await captar(req(`/api/jobs/${cards.a}/captacao`, { method: "POST" }), params(cards.a))).status).toBe(200)
    const inicio = await db.historicoStatus.findFirstOrThrow({ where: { demandaId: cards.a, statusNovo: "captacao_iniciada" } })
    expect(inicio.usuarioId).toBe(gente.gabriel)
    expect(inicio.observacao).toContain(nomes.gh)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: org.gh, acao: "espelho.captacao", atorId: gente.x } })).toBe(1)

    // Aceitar ou recusar é do Gabriel.
    expect((await mover(req(`/api/demandas/${cards.a}/status`, { method: "PATCH", body: { statusInterno: "videomaker_recusou", observacao: "não" } }), params(cards.a))).status).toBe(403)
    const fim = await mover(req(`/api/demandas/${cards.a}/status`, { method: "PATCH", body: { statusInterno: "captacao_realizada", origem: "manual" } }), params(cards.a))
    expect(fim.status).toBe(200)
    const h = await db.historicoStatus.findFirstOrThrow({ where: { demandaId: cards.a, statusNovo: "captacao_realizada" } })
    expect(h.usuarioId).toBe(gente.gabriel)
    expect(h.observacao).toBe(`Pela ${nomes.gh}.`)
  })

  it("5. o X entrega os brutos por link: a nota nasce para o Gabriel, na Contourline", async () => {
    comoY()
    expect((await entregar(req(`/api/jobs/${cards.a}/entrega`, { method: "POST", body: { linkBrutos: "https://drive.example/y" } }), params(cards.a))).status).toBe(404)
    comoX()
    const res = await entregar(req(`/api/jobs/${cards.a}/entrega`, { method: "POST", body: { linkBrutos: "https://drive.example/brutos" } }), params(cards.a))
    expect(await res.json()).toMatchObject({ completo: true, mudouEtapa: true })
    const d = await db.demanda.findUniqueOrThrow({ where: { id: cards.a } })
    expect(d).toMatchObject({ statusInterno: "brutos_enviados", linkBrutos: "https://drive.example/brutos" })
    expect(await db.notaFiscalUpload.count({ where: { demandaId: cards.a, videomakerId: vm.gabriel } })).toBe(1)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: org.gh, acao: "espelho.entrega", atorId: gente.x } })).toBe(1)
  })

  it("6. a Contourline vê só o Gabriel: nem nome nem id do X", async () => {
    comoDebora()
    const texto = JSON.stringify(await (await abrir(cards.a)).json())
    for (const s of [vm.x, gente.x, `X da GH ${p}`]) expect(texto).not.toContain(s)
    expect(texto).toContain(`Gabriel ${p}`)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: org.dona, atorId: gente.x } })).toBe(0)
  })

  it("7. trocar o videomaker tira o card da GH (e do X); voltar ao Gabriel traz de volta", async () => {
    comoDebora()
    const trocar = (videomakerId: string) => card.PUT(req(`/api/demandas/${cards.b}`, { method: "PUT", body: { videomakerId } }), params(cards.b))
    expect((await trocar(vm.outro)).status).toBe(200)
    comoGabriel()
    expect((await abrir(cards.b)).status).toBe(404)
    expect(await idsNaLista()).toEqual(new Set([cards.a]))
    comoDebora()
    expect((await trocar(vm.gabriel)).status).toBe(200)
    comoGabriel()
    expect((await abrir(cards.b)).status).toBe(200)
  })
})

describe("outros pontos que gravam o videomaker do card", () => {
  it("duplicar um card do Gabriel leva a cópia para a GH também", async () => {
    comoDebora()
    const res = await duplicar(req(`/api/demandas/${cards.b}/duplicate`, { method: "POST" }), params(cards.b))
    expect(res.status).toBe(201)
    const { demanda } = await res.json() as { demanda: { id: string } }
    const aresta = await db.demandaCompartilhamento.findFirst({ where: { demandaId: demanda.id, organizacaoDestinoId: org.gh, revogadoEm: null } })
    expect(aresta?.porVideomakerId).toBe(vm.gabriel)
  })
})

describe("rotas que continuam só da Contourline: 404 para a GH", () => {
  const id = () => cards.a
  type Rota = [string, () => Promise<Response>]
  const rotas: Rota[] = [
    ["PUT /api/demandas/[id]", () => card.PUT(req(`/api/demandas/${id()}`, { method: "PUT", body: { titulo: "Invadido pela GH" } }), params(id()))],
    ["DELETE /api/demandas/[id]", () => card.DELETE(req(`/api/demandas/${id()}`, { method: "DELETE" }), params(id()))],
    ["POST /api/demandas/[id]/espelhar", () => espelhar.POST(req(`/api/demandas/${id()}/espelhar`, { method: "POST", body: { organizacaoDestinoId: org.dona } }), params(id()))],
    ["DELETE /api/demandas/[id]/espelhar", () => espelhar.DELETE(req(`/api/demandas/${id()}/espelhar?destino=${org.gh}`, { method: "DELETE" }), params(id()))],
    ["POST /api/demandas/[id]/compartilhar", () => compartilhar.POST(req(`/api/demandas/${id()}/compartilhar`, { method: "POST", body: {} }), params(id()))],
    ["DELETE /api/demandas/[id]/compartilhar", () => compartilhar.DELETE(req(`/api/demandas/${id()}/compartilhar`, { method: "DELETE" }), params(id()))],
    ["POST /api/demandas/[id]/aprovar", () => aprovar.POST(req(`/api/demandas/${id()}/aprovar`, { method: "POST", body: { acao: "aprovar" } }), params(id()))],
    ["GET /api/demandas/[id]/pagamento", () => pagamento.GET(req(`/api/demandas/${id()}/pagamento`), params(id()))],
    ["POST /api/demandas/[id]/pagamento", () => pagamento.POST(req(`/api/demandas/${id()}/pagamento`, { method: "POST", body: { acao: "aprovar_pagamento" } }), params(id()))],
    ["POST /api/demandas/[id]/produto", () => produto.POST(req(`/api/demandas/${id()}/produto`, { method: "POST", body: {} }), params(id()))],
    ["GET /api/demandas/[id]/checklist", () => checklist.GET(req(`/api/demandas/${id()}/checklist`), params(id()))],
    ["POST /api/demandas/[id]/checklist", () => checklist.POST(req(`/api/demandas/${id()}/checklist`, { method: "POST", body: { texto: "x" } }), params(id()))],
    ["GET /api/demandas/[id]/upload-url", () => uploadUrl.GET(req(`/api/demandas/${id()}/upload-url?nome=a.mp4&tipo=video/mp4`), params(id()))],
    ["POST /api/demandas/[id]/upload-video", () => uploadVideo.POST(req(`/api/demandas/${id()}/upload-video`, { method: "POST", body: {} }), params(id()))],
    ["POST /api/demandas/[id]/convite", () => convite.POST(req(`/api/demandas/${id()}/convite`, { method: "POST", body: { acao: "reenviar" } }), params(id()))],
    ["POST /api/demandas/[id]/responder-entrega", () => responderEntrega.POST(req(`/api/demandas/${id()}/responder-entrega`, { method: "POST", body: {} }), params(id()))],
    ["POST /api/demandas/[id]/enviar-whatsapp", () => enviarWhatsapp.POST(req(`/api/demandas/${id()}/enviar-whatsapp`, { method: "POST", body: {} }), params(id()))],
    ["POST /api/jobs/[id]/nota", () => nota.POST(req(`/api/jobs/${id()}/nota`, { method: "POST", body: { acao: "enviar_compras" } }), params(id()))],
    ["POST /api/jobs/[id]/cancelar", () => cancelar.POST(req(`/api/jobs/${id()}/cancelar`, { method: "POST", body: { motivo: "Cliente desmarcou", cobra: false } }), params(id()))],
    ["POST /api/jobs/[id]/transferir", () => transferir.POST(req(`/api/jobs/${id()}/transferir`, { method: "POST", body: {} }), params(id()))],
    ["POST /api/custos-videomaker", () => custos.POST(req(`/api/custos-videomaker`, { method: "POST", body: { videomakerId: vm.gabriel, demandaId: id(), tipo: "diaria", valor: "100", dataReferencia: "2026-11-20" } }))],
    ["POST /api/aprovacao-video", () => aprovacaoVideo.POST(req(`/api/aprovacao-video`, { method: "POST", body: { demandaId: id(), urlVideo: "https://v.example/a.mp4" } }))],
    ["PUT /api/videomakers/[id] (cadastro)", () => videomaker.PUT(req(`/api/videomakers/${vm.gabriel}`, { method: "PUT", body: { nome: "Invadido" } }), params(vm.gabriel))],
    ["PUT /api/videomakers/[id]/empresa", () => empresa.PUT(req(`/api/videomakers/${vm.gabriel}/empresa`, { method: "PUT", body: { slug: null } }), params(vm.gabriel))],
  ]

  for (const [nome, chamar] of rotas) {
    it(`${nome} → 404 para a GH`, async () => {
      comoGabriel()
      const res = await chamar()
      expect(res.status, nome).toBe(404)
    })
  }

  it("e nada mudou no card nem no cadastro", async () => {
    const d = await db.demanda.findUniqueOrThrow({ where: { id: cards.a } })
    expect(d.titulo).toBe("Depoimentos Ultraformer")
    expect((await db.videomaker.findUniqueOrThrow({ where: { id: vm.gabriel } })).nome).toBe(`Gabriel ${p}`)
    expect(await db.custoVideomaker.count({ where: { demandaId: cards.a } })).toBe(0)
  })

  it("o perfil do Gabriel na GH (a rede é pública) não traz nada da Contourline", async () => {
    comoGabriel()
    const res = await videomaker.GET(req(`/api/videomakers/${vm.gabriel}`), params(vm.gabriel))
    const texto = JSON.stringify(await res.json())
    expect(texto).not.toContain("1200")
    for (const c of Object.values(cards)) expect(texto).not.toContain(c)
  })

  it("custos e notas da Contourline não aparecem na GH", async () => {
    comoGabriel()
    const { custos: lista } = await (await custos.GET(req(`/api/custos-videomaker?demandaId=${cards.a}`))).json() as { custos?: unknown[] }
    expect(lista ?? []).toHaveLength(0)
  })
})
