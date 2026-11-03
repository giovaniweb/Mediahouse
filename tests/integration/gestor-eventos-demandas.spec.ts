import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import type { Session } from "next-auth"

// O que o gestor de eventos vê (03/11/2026). De 03/06 a 03/11 eram só os cards
// ligados a evento. A Contourline não tem nenhum, e a Mariana (gestora de
// eventos) via "Todas: 0" com 39 pedidos dela abertos. Agora são os de evento
// E os que ela pediu, na tela e no assistente (MCP). Rotas reais, banco real; só
// a sessão é simulada.
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
import { ArgumentoInvalido, lerDemanda, listarDemandas } from "@/lib/mcp-demandas"

const p = `gev-${randomUUID().slice(0, 8)}`, org = `${p}-org`, outraOrg = `${p}-org2`
const pessoas = {
  gestora: `${p}-gestora`,   // gestor_eventos pelo preset (vê todas), como a Mariana
  restrita: `${p}-restrita`, // gestor_eventos com registro explícito sem "Ver todas"
  admin: `${p}-admin`,
}
const eventos = { a: `${p}-evt-a`, b: `${p}-evt-b` }
const cards = {
  dela: `${p}-dela`,                 // pedido dela, sem evento, atrasado
  delaFinalizada: `${p}-dela-fim`,   // pedido dela, finalizado em agosto (histórico)
  delaArte: `${p}-dela-arte`,        // pedido dela no quadro do Growth
  evento: `${p}-evt-a-card`,         // de outra pessoa, ligado ao evento A
  eventoB: `${p}-evt-b-card`,        // de outra pessoa, ligado ao evento B
  outro: `${p}-outro`,               // de outra pessoa, sem evento, atrasado
  outroFinalizado: `${p}-outro-fim`, // de outra pessoa, sem evento, finalizado em agosto
  outraArte: `${p}-outra-arte`,      // de outra pessoa, sem evento, Growth
  daRestrita: `${p}-restrita-card`,  // pedido da gestora com registro explícito
  outraEmpresa: `${p}-org2-card`,    // pedido dela, mas em outra empresa
}

// O que o quadro de Demandas do audiovisual pede (src/app/(dashboard)/demandas/page.tsx).
const QUADRO = "filaTrabalho=1&area=audiovisual&quadro=demandas&limit=100&offset=0"

function como(id: string, papel: string) {
  estado.sessao = { user: { id, organizacaoId: org, tipo: papel, papel, name: id } }
}

// A sessão como o MCP monta para a chave da pessoa (src/lib/mcp-token.ts).
function quem(id: string, papel: string) {
  const sessao = { user: { id, name: id, email: `${id}@exemplo.test`, tipo: papel, organizacaoId: org, papel }, expires: "" } as unknown as Session
  return { organizacaoId: org, sessao, tokenId: `${id}-token` }
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function lista(consulta: string) {
  const res = await listar(new NextRequest(`http://localhost/api/demandas?${consulta}`))
  expect(res.status).toBe(200)
  return await res.json() as { demandas: { id: string }[]; total?: number }
}

async function ids(consulta: string) {
  const { demandas } = await lista(consulta)
  return new Set(demandas.map((d) => d.id).filter((id) => id.startsWith(p)))
}

beforeAll(async () => {
  await db.organizacao.createMany({ data: [{ id: org, nome: p, slug: p }, { id: outraOrg, nome: `${p}-2`, slug: `${p}-2` }] })
  const papeis = { gestora: "gestor_eventos", restrita: "gestor_eventos", admin: "admin" } as const
  for (const [chave, id] of Object.entries(pessoas) as [keyof typeof pessoas, string][]) {
    const papel = papeis[chave]
    await db.usuario.create({ data: { id, nome: id, email: `${id}@exemplo.test`, tipo: papel, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: {
      usuarioId: id, organizacaoId: org, papel, categoria: "interna",
      areas: papel === "gestor_eventos" ? ["eventos"] : ["audiovisual", "growth"],
    } })
  }
  await db.usuarioOrganizacao.create({ data: { usuarioId: pessoas.gestora, organizacaoId: outraOrg, papel: "gestor_eventos", categoria: "interna", areas: ["eventos"] } })
  // Registro explícito vence o preset: com "Ver todas" desmarcado, só as dela.
  await db.permissaoUsuario.create({ data: { usuarioId: pessoas.restrita, organizacaoId: org, verDemandas: true, verTodasDemandas: false } })

  const evento = { organizacaoId: org, dataInicio: new Date("2026-11-20T12:00:00Z"), dataFim: new Date("2026-11-21T12:00:00Z"), createdById: pessoas.admin }
  await db.eventoGestao.createMany({ data: [
    { ...evento, id: eventos.a, codigo: eventos.a, nome: "Congresso A" },
    { ...evento, id: eventos.b, codigo: eventos.b, nome: "Feira B" },
  ] })

  const atrasada = new Date("2026-09-01T00:00:00Z")
  const agosto = new Date("2026-08-15T15:00:00Z")
  const card = { organizacaoId: org, descricao: "Briefing.", cidade: "Curitiba", area: "audiovisual" as const,
    tipoVideo: "reels", departamento: "audiovisual", statusInterno: "editando" as const, statusVisivel: "edicao" as const }
  const fim = { statusInterno: "entregue_cliente" as const, statusVisivel: "finalizado" as const, finalizadaEm: agosto }
  const arte = { area: "design" as const, tipoVideo: "post_estatico", departamento: "growth" }
  await db.demanda.createMany({ data: [
    { ...card, id: cards.dela, codigo: cards.dela, titulo: "Vídeo do treinamento Ultraformer", solicitanteId: pessoas.gestora, dataLimite: atrasada },
    { ...card, ...fim, id: cards.delaFinalizada, codigo: cards.delaFinalizada, titulo: "Reels de agosto", solicitanteId: pessoas.gestora },
    { ...card, ...arte, id: cards.delaArte, codigo: cards.delaArte, titulo: "Arte do convite", solicitanteId: pessoas.gestora },
    { ...card, id: cards.evento, codigo: cards.evento, titulo: "Cobertura do congresso", solicitanteId: pessoas.admin, eventoGestaoId: eventos.a, statusInterno: "planejamento", statusVisivel: "producao" },
    { ...card, id: cards.eventoB, codigo: cards.eventoB, titulo: "Vídeo da feira", solicitanteId: pessoas.admin, eventoGestaoId: eventos.b },
    { ...card, id: cards.outro, codigo: cards.outro, titulo: "Vídeo do treinamento interno", solicitanteId: pessoas.admin, dataLimite: atrasada },
    { ...card, ...fim, id: cards.outroFinalizado, codigo: cards.outroFinalizado, titulo: "Reels de agosto (outro)", solicitanteId: pessoas.admin },
    { ...card, ...arte, id: cards.outraArte, codigo: cards.outraArte, titulo: "Arte da campanha", solicitanteId: pessoas.admin },
    { ...card, id: cards.daRestrita, codigo: cards.daRestrita, titulo: "Pedido da restrita", solicitanteId: pessoas.restrita },
    { ...card, organizacaoId: outraOrg, id: cards.outraEmpresa, codigo: cards.outraEmpresa, titulo: "Pedido em outra empresa", solicitanteId: pessoas.gestora },
  ] })
})

afterAll(async () => {
  const orgs = { in: [org, outraOrg] }
  await db.historicoStatus.deleteMany({ where: { demanda: { organizacaoId: orgs } } })
  await db.demanda.deleteMany({ where: { organizacaoId: orgs } })
  await db.eventoGestao.deleteMany({ where: { organizacaoId: org } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.deleteMany({ where: { id: orgs } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("gestor de eventos: os cards de evento e os que pediu", () => {
  it("o quadro de Demandas mostra o que ela pediu e os de evento, e não os dos outros sem evento", async () => {
    como(pessoas.gestora, "gestor_eventos")
    const { total } = await lista(QUADRO)
    expect(await ids(QUADRO)).toEqual(new Set([cards.dela, cards.evento, cards.eventoB]))
    // É o "Todas: N" do topo, que mostrava 0.
    expect(total).toBe(3)
  })

  it("as abas Minhas, Criadas por mim e Atrasadas e a busca recortam o mesmo conjunto", async () => {
    como(pessoas.gestora, "gestor_eventos")
    expect(await ids(`${QUADRO}&mine=1`)).toEqual(new Set([cards.dela]))
    expect(await ids(`${QUADRO}&criadasPorMim=1`)).toEqual(new Set([cards.dela]))
    // Os dois atrasados são o dela e o de outra pessoa sem evento.
    expect(await ids(`${QUADRO}&atrasadas=1`)).toEqual(new Set([cards.dela]))
    // A busca também é um OR: as duas condições têm de valer juntas.
    expect(await ids(`${QUADRO}&search=treinamento`)).toEqual(new Set([cards.dela]))
  })

  it("o filtro por evento escolhido na tela vale (antes era trocado por 'qualquer evento')", async () => {
    como(pessoas.gestora, "gestor_eventos")
    expect(await ids(`${QUADRO}&eventoGestaoId=${eventos.a}`)).toEqual(new Set([cards.evento]))
  })

  it("o histórico e o quadro do Growth seguem a mesma regra", async () => {
    como(pessoas.gestora, "gestor_eventos")
    expect(await ids("statusVisivel=finalizado&de=2026-08-01&ate=2026-08-31&limit=50&offset=0"))
      .toEqual(new Set([cards.delaFinalizada]))
    expect(await ids("filaTrabalho=1&area=design&limit=100")).toEqual(new Set([cards.delaArte]))
  })

  it("abre a ficha do que pediu e a do card de evento", async () => {
    como(pessoas.gestora, "gestor_eventos")
    for (const id of [cards.dela, cards.evento]) {
      expect((await abrir(new NextRequest(`http://localhost/api/demandas/${id}`), params(id))).status).toBe(200)
    }
  })

  it("continua só lendo: não move o card de evento", async () => {
    como(pessoas.gestora, "gestor_eventos")
    const req = new NextRequest(`http://localhost/api/demandas/${cards.evento}/status`, {
      method: "PATCH", body: JSON.stringify({ statusInterno: "editando", origem: "kanban" }),
    })
    expect((await mover(req, params(cards.evento))).status).toBe(403)
    const intacto = await db.demanda.findUniqueOrThrow({ where: { id: cards.evento }, select: { statusInterno: true } })
    expect(intacto.statusInterno).toBe("planejamento")
  })

  it("não traz o pedido dela de outra empresa", async () => {
    como(pessoas.gestora, "gestor_eventos")
    expect((await ids("limit=200")).has(cards.outraEmpresa)).toBe(false)
  })

  it("com registro explícito sem 'Ver todas', fica só com as dela", async () => {
    como(pessoas.restrita, "gestor_eventos")
    expect(await ids(QUADRO)).toEqual(new Set([cards.daRestrita]))
  })

  it("o assistente (MCP) lê o mesmo que a tela", async () => {
    como(pessoas.gestora, "gestor_eventos")
    const naTela = await ids("limit=200")
    expect(naTela).toEqual(new Set([cards.dela, cards.delaFinalizada, cards.delaArte, cards.evento, cards.eventoB]))

    const pessoa = quem(pessoas.gestora, "gestor_eventos")
    const r = await listarDemandas(pessoa, { status: "todas", limite: 100 })
    expect(new Set(r.demandas.map((d) => d.id))).toEqual(naTela)
    expect((await lerDemanda(pessoa, cards.dela)).id).toBe(cards.dela)
    await expect(lerDemanda(pessoa, cards.outro)).rejects.toThrow(ArgumentoInvalido)
  })

  it("os outros papéis não mudam: a gestão vê o quadro inteiro", async () => {
    como(pessoas.admin, "admin")
    const quadro = await ids(QUADRO)
    expect([cards.dela, cards.evento, cards.eventoB, cards.outro, cards.daRestrita].every((id) => quadro.has(id))).toBe(true)
  })
})
