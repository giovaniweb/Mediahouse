import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Videomaker que trabalha por uma empresa (Gabriel → GH Produção), 12/11/2026.
// A Contourline (dona) escala o Gabriel; a GH (parceira) executa por espelho.
// Rotas reais, banco real; só a sessão é simulada.
//
// Fase A: o espelho que já existia, consertado antes de ser usado — a parceira
// lê o card pela lista branca, vê só a própria aresta, não grava a pessoa dela
// no histórico da dona, e revogar com a parceria encerrada não dá erro.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as listar } from "@/app/api/demandas/route"
import { GET as abrir } from "@/app/api/demandas/[id]/route"
import { PATCH as mover } from "@/app/api/demandas/[id]/status/route"
import { GET as verEspelho, DELETE as revogar } from "@/app/api/demandas/[id]/espelhar/route"

const p = `esp-${randomUUID().slice(0, 8)}`
const org = { dona: `${p}-contour`, gh: `${p}-gh`, outra: `${p}-outra` }
const nomes = { dona: `Contourline-teste ${p}`, gh: `GH-teste ${p}`, outra: `Outra-teste ${p}` }
const pessoas = { debora: `${p}-debora`, gabriel: `${p}-gabriel`, intrusa: `${p}-intrusa` }
const vmGabriel = `${p}-vm-gabriel`
const cards = { aberto: `${p}-aberto` }
const SEGREDOS = {
  publicToken: `${p}-tok-publico`, linkCliente: `https://cliente.example/${p}`,
  telefoneSolicitante: "5511900000001", clienteFinalTelefone: "5511900000002", clienteFinalEmail: `${p}@cliente.example`,
  notaFiscalUrl: `https://nf.example/${p}.pdf`,
}

function como(id: string, organizacaoId: string, papel = "admin") {
  estado.sessao = { user: { id, organizacaoId, tipo: papel, papel, name: id } }
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeAll(async () => {
  await db.organizacao.createMany({ data: [
    { id: org.dona, nome: nomes.dona, slug: org.dona },
    { id: org.gh, nome: nomes.gh, slug: org.gh },
    { id: org.outra, nome: nomes.outra, slug: org.outra },
  ] })
  for (const id of Object.values(pessoas)) {
    await db.usuario.create({ data: { id, nome: id, email: `${id}@exemplo.test`, tipo: "admin", senhaHash: "sem-login", telefone: null } })
  }
  await db.usuarioOrganizacao.createMany({ data: [
    { usuarioId: pessoas.debora, organizacaoId: org.dona, papel: "admin", categoria: "interna" },
    { usuarioId: pessoas.gabriel, organizacaoId: org.gh, papel: "admin", categoria: "interna" },
    { usuarioId: pessoas.intrusa, organizacaoId: org.outra, papel: "admin", categoria: "interna" },
  ] })
  await db.videomaker.create({ data: { id: vmGabriel, nome: "Gabriel", usuarioId: pessoas.gabriel, telefone: "5511900000003" } })
  await db.videomakerOrganizacao.create({ data: { organizacaoId: org.dona, videomakerId: vmGabriel, valorDiaria: 900 } })

  await db.demanda.create({ data: {
    id: cards.aberto, codigo: cards.aberto, organizacaoId: org.dona, titulo: "Gravação na clínica", descricao: "Briefing.",
    cidade: "Curitiba", tipoVideo: "cobertura_evento", departamento: "eventos", solicitanteId: pessoas.debora,
    videomakerId: vmGabriel, statusInterno: "captacao_agendada", statusVisivel: "producao", tipoGravacao: "conteudo", cobertura: true,
    localGravacao: "Clínica Teste", dataCaptacao: new Date("2026-11-20T13:00:00Z"), publicTokenAtivo: true, ...SEGREDOS,
  } })
  await db.aprovacaoVideo.create({ data: { demandaId: cards.aberto, urlVideo: "https://video.example/v.mp4", token: `${p}-aprov`, expiresAt: new Date(Date.now() + 864e5) } })
  await db.notaFiscalUpload.create({ data: { demandaId: cards.aberto, videomakerId: vmGabriel, token: `${p}-nf` } })

  // Duas parcerias aceitas e duas arestas: a GH não pode ver a da "Outra".
  for (const parceira of [org.gh, org.outra]) {
    await db.parceriaOrganizacao.create({ data: {
      organizacaoConvidanteId: org.dona, organizacaoConvidadaId: parceira, nomeConvidante: "", nomeConvidada: "",
      status: "aceita", criadoPorId: pessoas.debora, respondidoEm: new Date(),
    } })
    await db.demandaCompartilhamento.create({ data: {
      demandaId: cards.aberto, organizacaoOrigemId: org.dona, organizacaoDestinoId: parceira,
      nomeOrigem: "", nomeDestino: "", criadoPorId: pessoas.debora,
    } })
  }
})

afterAll(async () => {
  const orgs = { in: Object.values(org) }
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: orgs } })
  await db.demanda.deleteMany({ where: { organizacaoId: orgs } })
  await db.parceriaOrganizacao.deleteMany({ where: { organizacaoConvidanteId: org.dona } })
  await db.videomaker.deleteMany({ where: { id: vmGabriel } })
  await db.organizacao.deleteMany({ where: { id: orgs } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

function semSegredos(corpo: unknown) {
  const texto = JSON.stringify(corpo)
  for (const s of [...Object.values(SEGREDOS), `${p}-aprov`, `${p}-nf`, nomes.outra, org.outra, "5511900000003", pessoas.debora]) {
    expect(texto, `vazou ${s}`).not.toContain(s)
  }
}

describe("Fase A — a parceira lê o card da dona pela lista branca", () => {
  it("a ficha do card espelhado abre para a GH sem token, nota, cliente, quem pediu nem outros parceiros", async () => {
    como(pessoas.gabriel, org.gh)
    const res = await abrir(new NextRequest(`http://localhost/api/demandas/${cards.aberto}`), params(cards.aberto))
    expect(res.status).toBe(200)
    const corpo = await res.json()
    expect(corpo.papelNoCard).toBe("espelho")
    expect(corpo.demanda).toMatchObject({ codigo: cards.aberto, localGravacao: "Clínica Teste" })
    expect(corpo.demanda.solicitante.nome).toBe(nomes.dona)
    expect(corpo.ultimaEntrega).toBeNull()
    semSegredos(corpo)
  })

  it("a dona continua lendo tudo", async () => {
    como(pessoas.debora, org.dona)
    const corpo = await (await abrir(new NextRequest(`http://localhost/api/demandas/${cards.aberto}`), params(cards.aberto))).json()
    expect(corpo.papelNoCard).toBe("dona")
    expect(corpo.demanda.publicToken).toBe(SEGREDOS.publicToken)
    expect(corpo.demanda.aprovacoesVideo[0].token).toBe(`${p}-aprov`)
  })

  it("na lista da GH o card aparece, projetado", async () => {
    como(pessoas.gabriel, org.gh)
    const res = await listar(new NextRequest(`http://localhost/api/demandas?limit=200`))
    const { demandas } = await res.json() as { demandas: { id: string; espelho: { contraparte: string } }[] }
    const card = demandas.find((d) => d.id === cards.aberto)
    expect(card?.espelho.contraparte).toBe(nomes.dona)
    semSegredos(card)
  })

  it("GET /espelhar mostra à GH só a própria aresta", async () => {
    como(pessoas.gabriel, org.gh)
    const corpo = await (await verEspelho(new NextRequest(`http://localhost/api/demandas/${cards.aberto}/espelhar`), params(cards.aberto))).json()
    expect(corpo.compartilhamentos).toHaveLength(1)
    expect(corpo.compartilhamentos[0].organizacaoDestinoId).toBe(org.gh)
    semSegredos(corpo)
  })

  it("a empresa sem aresta recebe 404", async () => {
    como(pessoas.intrusa, `${p}-ninguem`)
    await db.organizacao.create({ data: { id: `${p}-ninguem`, nome: "Ninguém", slug: `${p}-ninguem` } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: pessoas.intrusa, organizacaoId: `${p}-ninguem`, papel: "admin", categoria: "interna" } })
    const res = await abrir(new NextRequest(`http://localhost/api/demandas/${cards.aberto}`), params(cards.aberto))
    expect(res.status).toBe(404)
    await db.organizacao.delete({ where: { id: `${p}-ninguem` } })
  })

  it("mover pela GH grava 'Pela GH' no histórico da dona, sem a pessoa da GH; quem foi fica na auditoria da GH", async () => {
    como(pessoas.gabriel, org.gh)
    const req = new NextRequest(`http://localhost/api/demandas/${cards.aberto}/status`, {
      method: "PATCH", body: JSON.stringify({ statusInterno: "captacao_realizada", origem: "kanban" }),
    })
    const res = await mover(req, params(cards.aberto))
    expect(res.status).toBe(200)
    semSegredos(await res.json())
    const h = await db.historicoStatus.findFirstOrThrow({ where: { demandaId: cards.aberto, statusNovo: "captacao_realizada" } })
    expect(h.usuarioId).toBeNull()
    expect(h.observacao).toBe(`Pela ${nomes.gh}.`)
    const aud = await db.eventoAuditoria.findFirstOrThrow({ where: { organizacaoId: org.gh, acao: "espelho.mover", recursoId: cards.aberto } })
    expect(aud.atorId).toBe(pessoas.gabriel)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: org.dona, acao: "espelho.mover" } })).toBe(0)
  })

  it("revogar com a parceria já encerrada funciona (era erro 500)", async () => {
    await db.parceriaOrganizacao.updateMany({
      where: { organizacaoConvidanteId: org.dona, organizacaoConvidadaId: org.outra },
      data: { status: "encerrada", encerradaEm: new Date() },
    })
    como(pessoas.debora, org.dona)
    const res = await revogar(new NextRequest(`http://localhost/api/demandas/${cards.aberto}/espelhar?destino=${org.outra}`, { method: "DELETE" }), params(cards.aberto))
    expect(res.status).toBe(200)
    const aresta = await db.demandaCompartilhamento.findFirstOrThrow({ where: { demandaId: cards.aberto, organizacaoDestinoId: org.outra } })
    expect(aresta.revogadoEm).not.toBeNull()
  })
})
