import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Quem vê o quê no audiovisual (29/10/2026). Uma conta de videomaker externo
// abria os 263 cards da Contourline: o preset dava `verTodasDemandas`, quem não
// tinha registro de permissões não caía em filtro nenhum, e a ficha, a edição e
// a exclusão conferiam a empresa, não a pessoa. Rotas reais, banco real; só a
// sessão é simulada.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as listar } from "@/app/api/demandas/route"
import { GET as abrir, PUT as editar, DELETE as excluir } from "@/app/api/demandas/[id]/route"
import { POST as duplicar } from "@/app/api/demandas/[id]/duplicate/route"

const p = `escopo-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = {
  admin: `${p}-admin`,
  externo: `${p}-ext`,        // videomaker externo, sem registro de permissões
  externoMarcado: `${p}-extm`, // videomaker externo com "Ver todas" marcado à mão
  solicitante: `${p}-sol`,     // solicitante sem registro de permissões
  editor: `${p}-ed`,           // videomaker interno, sem registro: o preset vê o quadro
}
const vm = { externo: `${p}-vm-ext`, outro: `${p}-vm-outro` }
const cards = { doExterno: `${p}-c1`, deOutro: `${p}-c2`, doSolicitante: `${p}-c3` }

function como(id: string, papel: string) {
  estado.sessao = { user: { id, organizacaoId: org, tipo: papel, papel, name: id } }
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function idsNaLista() {
  const res = await listar(new NextRequest("http://localhost/api/demandas?limit=200"))
  expect(res.status).toBe(200)
  const { demandas } = await res.json() as { demandas: { id: string }[] }
  return new Set(demandas.map((d) => d.id))
}

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  const papeis: Record<keyof typeof pessoas, "admin" | "videomaker" | "solicitante" | "editor"> = {
    admin: "admin", externo: "videomaker", externoMarcado: "videomaker", solicitante: "solicitante", editor: "editor",
  }
  for (const [quem, id] of Object.entries(pessoas) as [keyof typeof pessoas, string][]) {
    const papel = papeis[quem]
    await db.usuario.create({ data: { id, nome: id, email: `${id}@exemplo.test`, tipo: papel, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: {
      usuarioId: id, organizacaoId: org, areas: ["audiovisual"], papel,
      categoria: papel === "videomaker" ? "externo" : "interna",
    } })
  }
  // A marca explícita continua mandando: a gestão pode abrir o quadro a um
  // freelancer de confiança, mas tem de marcar.
  await db.permissaoUsuario.create({ data: { usuarioId: pessoas.externoMarcado, organizacaoId: org, verDemandas: true, verTodasDemandas: true } })
  const base = { redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] }
  await db.videomaker.create({ data: { id: vm.externo, nome: "Externo", usuarioId: pessoas.externo, ...base } })
  await db.videomaker.create({ data: { id: vm.outro, nome: "Outro", ...base } })
  const card = { organizacaoId: org, descricao: "Briefing do cliente.", cidade: "Curitiba", area: "audiovisual" as const,
    tipoVideo: "reels", departamento: "audiovisual", statusInterno: "planejamento" as const, statusVisivel: "producao" as const }
  await db.demanda.createMany({ data: [
    { ...card, id: cards.doExterno, codigo: cards.doExterno, titulo: "Gravação dele", solicitanteId: pessoas.admin, videomakerId: vm.externo },
    { ...card, id: cards.deOutro, codigo: cards.deOutro, titulo: "Gravação de outro", solicitanteId: pessoas.admin, videomakerId: vm.outro },
    { ...card, id: cards.doSolicitante, codigo: cards.doSolicitante, titulo: "Pedido da solicitante", solicitanteId: pessoas.solicitante },
  ] })
})

afterAll(async () => {
  await db.historicoStatus.deleteMany({ where: { demanda: { organizacaoId: org } } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: { in: Object.values(vm) } } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("até onde cada pessoa enxerga as demandas", () => {
  it("videomaker externo vê só a gravação em que está escalado", async () => {
    como(pessoas.externo, "videomaker")
    const ids = await idsNaLista()
    expect(ids.has(cards.doExterno)).toBe(true)
    expect(ids.has(cards.deOutro)).toBe(false)
    expect(ids.has(cards.doSolicitante)).toBe(false)
  })

  it("videomaker externo não abre, edita, duplica nem exclui o card de outro", async () => {
    como(pessoas.externo, "videomaker")
    expect((await abrir(new NextRequest(`http://localhost/api/demandas/${cards.deOutro}`), params(cards.deOutro))).status).toBe(404)
    const put = new NextRequest(`http://localhost/api/demandas/${cards.deOutro}`, { method: "PUT", body: JSON.stringify({ titulo: "Mexido por fora" }) })
    expect((await editar(put, params(cards.deOutro))).status).toBe(404)
    expect((await duplicar(new NextRequest(`http://localhost/api/demandas/${cards.deOutro}/duplicate`, { method: "POST" }), params(cards.deOutro))).status).toBe(404)
    expect((await excluir(new NextRequest(`http://localhost/api/demandas/${cards.deOutro}`, { method: "DELETE" }), params(cards.deOutro))).status).toBe(404)
    const intacto = await db.demanda.findUniqueOrThrow({ where: { id: cards.deOutro }, select: { titulo: true } })
    expect(intacto.titulo).toBe("Gravação de outro")
  })

  it("no card dele, abre e salva o link dos brutos, mas não exclui sem a permissão", async () => {
    como(pessoas.externo, "videomaker")
    expect((await abrir(new NextRequest(`http://localhost/api/demandas/${cards.doExterno}`), params(cards.doExterno))).status).toBe(200)
    const put = new NextRequest(`http://localhost/api/demandas/${cards.doExterno}`, { method: "PUT", body: JSON.stringify({ linkBrutos: "https://drive.exemplo/brutos" }) })
    expect((await editar(put, params(cards.doExterno))).status).toBe(200)
    expect((await excluir(new NextRequest(`http://localhost/api/demandas/${cards.doExterno}`, { method: "DELETE" }), params(cards.doExterno))).status).toBe(403)
    expect(await db.demanda.count({ where: { id: cards.doExterno } })).toBe(1)
  })

  it("com 'Ver todas' marcado à mão, o videomaker externo vê o quadro", async () => {
    como(pessoas.externoMarcado, "videomaker")
    const ids = await idsNaLista()
    expect(ids.has(cards.doExterno) && ids.has(cards.deOutro)).toBe(true)
  })

  it("solicitante sem registro de permissões vê só o que pediu", async () => {
    como(pessoas.solicitante, "solicitante")
    const ids = await idsNaLista()
    expect([...ids].filter((id) => id.startsWith(p))).toEqual([cards.doSolicitante])
    expect((await abrir(new NextRequest(`http://localhost/api/demandas/${cards.deOutro}`), params(cards.deOutro))).status).toBe(404)
  })

  it("quem é da casa continua vendo o quadro pelo preset, sem registro", async () => {
    como(pessoas.editor, "editor")
    const ids = await idsNaLista()
    expect(Object.values(cards).every((id) => ids.has(id))).toBe(true)
    expect((await abrir(new NextRequest(`http://localhost/api/demandas/${cards.deOutro}`), params(cards.deOutro))).status).toBe(200)
  })

  it("a gestão vê e exclui", async () => {
    como(pessoas.admin, "admin")
    const ids = await idsNaLista()
    expect(Object.values(cards).every((id) => ids.has(id))).toBe(true)
    expect((await excluir(new NextRequest(`http://localhost/api/demandas/${cards.doSolicitante}`, { method: "DELETE" }), params(cards.doSolicitante))).status).toBe(200)
    expect(await db.demanda.count({ where: { id: cards.doSolicitante } })).toBe(0)
  })
})
