import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Pedido feito por dentro nasce aprovado (decisão de 28/10/2026): Aprovações
// fica com o que chega de fora. O freelancer logado no portal continua sendo de
// fora. Rotas reais, banco real; só a sessão e os avisos são simulados.
const { estado, agendados } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
  agendados: [] as string[],
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: (_t: unknown, rotulo: string) => { agendados.push(rotulo) } }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { POST } from "@/app/api/demandas/route"
import { POST as DUPLICAR } from "@/app/api/demandas/[id]/duplicate/route"

const p = `pedido-interno-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const interna = `${p}-interna`, freela = `${p}-freela`

function como(id: string, papel: string) {
  estado.sessao = { user: { id, organizacaoId: org, tipo: papel, papel, name: id } }
}

// O corpo do "+ Nova Demanda" de vídeo: edição, não cobertura.
const pedido = (extra: Record<string, unknown> = {}) => ({
  titulo: "Vídeo do lançamento", descricao: "Editar o material da semana.",
  departamento: "audiovisual", tipoVideo: "outro", cidade: "Curitiba", prioridade: "normal",
  dataLimite: new Date(Date.now() + 10 * 86_400_000).toISOString(), ...extra,
})

async function criar(body: Record<string, unknown>) {
  const res = await POST(new NextRequest("http://localhost/api/demandas", { method: "POST", body: JSON.stringify(body) }))
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string; statusInterno: string; gestorId: string | null }
}

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  await db.usuario.create({ data: { id: interna, nome: interna, tipo: "solicitante", senhaHash: "sem-login" } })
  await db.usuarioOrganizacao.create({ data: { usuarioId: interna, organizacaoId: org, papel: "solicitante", categoria: "solicitante" } })
  await db.usuario.create({ data: { id: freela, nome: freela, tipo: "videomaker", senhaHash: "sem-login" } })
  await db.usuarioOrganizacao.create({ data: { usuarioId: freela, organizacaoId: org, papel: "videomaker", categoria: "externo" } })
})

beforeEach(() => { agendados.length = 0 })

afterAll(async () => {
  const ids = (await db.demanda.findMany({ where: { organizacaoId: org }, select: { id: true } })).map((d) => d.id)
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.checklistItem.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: [interna, freela] } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("pedido de quem está logado", () => {
  it("quem pede de dentro da empresa não espera Aprovações", async () => {
    como(interna, "solicitante")
    const d = await criar(pedido())
    expect(d).toMatchObject({ statusInterno: "aguardando_triagem", gestorId: null })
    expect(await db.alertaIA.count({ where: { demandaId: d.id } })).toBe(0)
    expect(agendados).not.toContain("nova-demanda-gestores")
  })

  it("freelancer logado continua de fora: vai para Aprovações e avisa a gestão", async () => {
    como(freela, "videomaker")
    const d = await criar(pedido())
    expect(d.statusInterno).toBe("aguardando_aprovacao_interna")
    expect(await db.alertaIA.count({ where: { demandaId: d.id, tipoAlerta: "aprovacao_pendente" } })).toBe(1)
    expect(agendados).toContain("nova-demanda-gestores")
  })

  it("duplicar é um pedido novo de quem duplicou, com a mesma regra", async () => {
    como(interna, "solicitante")
    const original = await criar(pedido())
    const res = await DUPLICAR(new NextRequest("http://localhost/api/demandas/x/duplicate", { method: "POST" }), {
      params: Promise.resolve({ id: original.id }),
    })
    expect(res.status).toBe(201)
    const { demanda } = await res.json() as { demanda: { statusInterno: string } }
    expect(demanda.statusInterno).toBe("aguardando_triagem")
  })
})
