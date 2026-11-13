import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// O sino de cada pessoa (13/11/2026). O Giovani entrou como a Tatiane,
// videomaker parceira, e o sino mostrou a atividade da empresa inteira: a rota
// lia "broadcast + dirigidos a mim" sem olhar o papel, e quase todo alerta nasce
// broadcast preso a um card. Rotas reais, banco real; só a sessão é simulada.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as listar, PATCH as marcar } from "@/app/api/notificacoes/route"

const p = `sino-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = {
  admin: `${p}-admin`,
  parceira: `${p}-parc`,   // videomaker externa (a Tatiane)
  vmInterno: `${p}-vmi`,   // videomaker da casa: o preset também não vê o quadro
  solicitante: `${p}-sol`,
  editor: `${p}-ed`,       // editor da casa: o preset vê o quadro
}
const vm = { parceira: `${p}-vm-parc`, outro: `${p}-vm-outro` }
const cards = { daParceira: `${p}-c1`, deOutro: `${p}-c2`, doSolicitante: `${p}-c3` }
const a = {
  cardDela: `${p}-a1`,          // broadcast no card dela
  cardDeOutro: `${p}-a2`,       // broadcast no card de outro
  semCard: `${p}-a3`,           // broadcast sem card (WhatsApp caiu)
  pessoalSemCard: `${p}-a4`,    // dirigido a ela, sem card
  mencaoNoDela: `${p}-a5`,      // dirigido a ela, no card dela
  doAdminNoDela: `${p}-a6`,     // dirigido ao admin, no card dela
  mencaoNoDeOutro: `${p}-a7`,   // dirigido a ela num card que ela não enxerga
  cardDoSolicitante: `${p}-a8`, // broadcast no pedido da solicitante
}

function como(id: string, papel: string) {
  estado.sessao = { user: { id, organizacaoId: org, tipo: papel, papel, name: id } }
}

async function noSino() {
  const res = await listar()
  expect(res.status).toBe(200)
  const { alertas, total } = await res.json() as { alertas: { id: string }[]; total: number }
  return { ids: new Set(alertas.map((x) => x.id)), total }
}

const patch = (body: object) => marcar(new NextRequest("http://localhost/api/notificacoes", { method: "PATCH", body: JSON.stringify(body) }))

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  const papeis = { admin: "admin", parceira: "videomaker", vmInterno: "videomaker", solicitante: "solicitante", editor: "editor" } as const
  for (const [quem, id] of Object.entries(pessoas) as [keyof typeof pessoas, string][]) {
    const papel = papeis[quem]
    await db.usuario.create({ data: { id, nome: id, email: `${id}@exemplo.test`, tipo: papel, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: {
      usuarioId: id, organizacaoId: org, areas: ["audiovisual"], papel,
      categoria: quem === "parceira" ? "externo" : "interna",
    } })
  }
  const base = { redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] }
  await db.videomaker.create({ data: { id: vm.parceira, nome: "Parceira", usuarioId: pessoas.parceira, ...base } })
  await db.videomaker.create({ data: { id: vm.outro, nome: "Outro", ...base } })
  const card = { organizacaoId: org, descricao: "Briefing.", cidade: "Curitiba", area: "audiovisual" as const,
    tipoVideo: "reels", departamento: "audiovisual", statusInterno: "planejamento" as const, statusVisivel: "producao" as const }
  await db.demanda.createMany({ data: [
    { ...card, id: cards.daParceira, codigo: cards.daParceira, titulo: "Gravação dela", solicitanteId: pessoas.admin, videomakerId: vm.parceira },
    { ...card, id: cards.deOutro, codigo: cards.deOutro, titulo: "Gravação de outro", solicitanteId: pessoas.admin, videomakerId: vm.outro },
    { ...card, id: cards.doSolicitante, codigo: cards.doSolicitante, titulo: "Pedido", solicitanteId: pessoas.solicitante },
  ] })
  const al = (id: string, demandaId: string | null, usuarioId: string | null) =>
    ({ id, organizacaoId: org, demandaId, usuarioId, tipoAlerta: "teste", mensagem: id, severidade: "info" as const })
  await db.alertaIA.createMany({ data: [
    al(a.cardDela, cards.daParceira, null),
    al(a.cardDeOutro, cards.deOutro, null),
    al(a.semCard, null, null),
    al(a.pessoalSemCard, null, pessoas.parceira),
    al(a.mencaoNoDela, cards.daParceira, pessoas.parceira),
    al(a.doAdminNoDela, cards.daParceira, pessoas.admin),
    al(a.mencaoNoDeOutro, cards.deOutro, pessoas.parceira),
    al(a.cardDoSolicitante, cards.doSolicitante, null),
  ] })
})

beforeEach(async () => {
  await db.alertaIA.updateMany({ where: { organizacaoId: org }, data: { lida: false } })
})

afterAll(async () => {
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: { in: Object.values(vm) } } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("o sino mostra a cada pessoa só o que é dela", () => {
  it("a videomaker parceira vê o card dela e o que foi dirigido a ela, nada mais", async () => {
    como(pessoas.parceira, "videomaker")
    const { ids, total } = await noSino()
    expect([...ids].sort()).toEqual([a.cardDela, a.pessoalSemCard, a.mencaoNoDela].sort())
    expect(total).toBe(3)
  })

  it("a parceira não marca como lido, por id, alerta de card que não é dela", async () => {
    como(pessoas.parceira, "videomaker")
    for (const id of [a.cardDeOutro, a.semCard, a.doAdminNoDela, a.mencaoNoDeOutro, a.cardDoSolicitante]) {
      expect((await patch({ id })).status).toBe(200)
      expect((await db.alertaIA.findUniqueOrThrow({ where: { id } })).lida).toBe(false)
    }
    await patch({ id: a.cardDela })
    expect((await db.alertaIA.findUniqueOrThrow({ where: { id: a.cardDela } })).lida).toBe(true)
  })

  it("o 'marcar todas' da parceira não apaga o sino da gestão", async () => {
    como(pessoas.parceira, "videomaker")
    await patch({})
    const lidas = await db.alertaIA.findMany({ where: { organizacaoId: org, lida: true }, select: { id: true } })
    expect(lidas.map((x) => x.id).sort()).toEqual([a.cardDela, a.pessoalSemCard, a.mencaoNoDela].sort())
    como(pessoas.admin, "admin")
    const { ids } = await noSino()
    expect(ids.has(a.cardDeOutro) && ids.has(a.semCard) && ids.has(a.cardDoSolicitante)).toBe(true)
  })

  it("videomaker da casa sem card escalado não vê a atividade da empresa", async () => {
    como(pessoas.vmInterno, "videomaker")
    expect((await noSino()).total).toBe(0)
  })

  it("a solicitante vê só o que pediu", async () => {
    como(pessoas.solicitante, "solicitante")
    const { ids } = await noSino()
    expect([...ids]).toEqual([a.cardDoSolicitante])
  })

  it("o editor que vê o quadro recebe os alertas dos cards, não os da gestão nem os de outra pessoa", async () => {
    como(pessoas.editor, "editor")
    const { ids } = await noSino()
    expect([...ids].sort()).toEqual([a.cardDela, a.cardDeOutro, a.cardDoSolicitante].sort())
  })

  it("a gestão continua vendo o broadcast e o que é dela", async () => {
    como(pessoas.admin, "admin")
    const { ids } = await noSino()
    expect([...ids].sort()).toEqual([a.cardDela, a.cardDeOutro, a.semCard, a.doAdminNoDela, a.cardDoSolicitante].sort())
  })
})
