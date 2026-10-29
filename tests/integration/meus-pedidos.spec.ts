import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"

// "Meus Pedidos" (29/10/2026): quem pede vê só o que pediu, com o andamento em
// palavras, e nada do que é de dentro. Rota real, banco real; só a sessão é
// simulada.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET } from "@/app/api/meus-pedidos/route"

const p = `pedidos-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = { lucas: `${p}-lucas`, outra: `${p}-outra` }

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const id of Object.values(pessoas)) {
    await db.usuario.create({ data: { id, nome: id, email: `${id}@exemplo.test`, tipo: "solicitante", senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: id, organizacaoId: org, areas: ["audiovisual"], papel: "solicitante" } })
  }
  const card = { organizacaoId: org, descricao: "Briefing.", cidade: "Curitiba", area: "audiovisual" as const, tipoVideo: "reels", departamento: "audiovisual" }
  await db.demanda.createMany({ data: [
    { ...card, codigo: `${p}-1`, titulo: "Em produção", solicitanteId: pessoas.lucas, statusInterno: "planejamento", statusVisivel: "producao" },
    { ...card, codigo: `${p}-2`, titulo: "Para aprovar", solicitanteId: pessoas.lucas, statusInterno: "revisao_pendente", statusVisivel: "aprovacao" },
    { ...card, codigo: `${p}-3`, titulo: "Entregue", solicitanteId: pessoas.lucas, statusInterno: "encerrado", statusVisivel: "finalizado", finalizadaEm: new Date() },
    { ...card, codigo: `${p}-4`, titulo: "Da outra pessoa", solicitanteId: pessoas.outra, statusInterno: "planejamento", statusVisivel: "producao" },
  ] })
})

afterAll(async () => {
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("meus pedidos", () => {
  it("traz só o que a pessoa pediu, em palavras, e separa o que espera por ela", async () => {
    estado.sessao = { user: { id: pessoas.lucas, organizacaoId: org, tipo: "solicitante", papel: "solicitante", name: "Lucas" } }
    const res = await GET()
    expect(res.status).toBe(200)
    const { pedidos, totalEncerrados } = await res.json() as { pedidos: Record<string, unknown>[]; totalEncerrados: number }
    expect(pedidos.map((x) => x.titulo).sort()).toEqual(["Em produção", "Entregue", "Para aprovar"])
    expect(totalEncerrados).toBe(1)
    const porTitulo = Object.fromEntries(pedidos.map((x) => [x.titulo, x]))
    expect(porTitulo["Em produção"]).toMatchObject({ situacao: "Em produção", aberto: true, esperandoVoce: false })
    expect(porTitulo["Para aprovar"]).toMatchObject({ tom: "voce", esperandoVoce: true })
    expect(porTitulo["Entregue"]).toMatchObject({ situacao: "Entregue", aberto: false })
  })

  it("não deixa sair o que é de dentro", async () => {
    estado.sessao = { user: { id: pessoas.lucas, organizacaoId: org, tipo: "solicitante", papel: "solicitante", name: "Lucas" } }
    const { pedidos } = await (await GET()).json() as { pedidos: Record<string, unknown>[] }
    for (const chave of ["statusInterno", "historicos", "videomaker", "editor", "responsaveis", "solicitanteId", "descricao"]) {
      expect(pedidos.some((x) => chave in x), chave).toBe(false)
    }
  })

  it("sem login, nada", async () => {
    estado.sessao = null
    expect((await GET()).status).toBe(401)
  })
})
