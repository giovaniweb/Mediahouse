import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// O "Nova demanda" (NovaDemandaModal) gravava todo pedido de vídeo com o
// departamento "growth", o do quadro de arte. O pedido de vídeo é do
// Audiovisual. Rota real e banco real; a sessão e os avisos são simulados.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => undefined }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET, POST } from "@/app/api/demandas/route"
import { departamentoDoPedido } from "@/lib/departamento-do-pedido"

const p = `pedido-dep-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = { admin: `${p}-admin`, rh: `${p}-rh` }

function sessao(id: string, papel: string) {
  estado.sessao = { user: { id, organizacaoId: org, tipo: papel, papel, name: id } }
}

// O corpo que o modal manda num pedido de vídeo (handleSubmit, tipo "video").
const corpoDoVideo = () => ({
  titulo: "Vídeo de boas-vindas", descricao: "Vídeo para apresentar o RH aos novos colaboradores.",
  departamento: departamentoDoPedido("video"), tipoVideo: "reels", cidade: "N/A", prioridade: "normal",
  produtoIds: [], classificacao: "b2b", formato: "9:16", cobertura: false,
})

async function criar(body: Record<string, unknown>) {
  const res = await POST(new NextRequest("http://localhost/api/demandas", { method: "POST", body: JSON.stringify(body) }))
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string }
}

async function idsDoFiltro(qs: string) {
  const res = await GET(new NextRequest(`http://localhost/api/demandas?${qs}&limit=200`))
  expect(res.status).toBe(200)
  return ((await res.json()).demandas as { id: string }[]).map((d) => d.id)
}

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const [papel, id] of Object.entries(pessoas)) {
    await db.usuario.create({ data: { id, nome: id, tipo: papel === "admin" ? "admin" : "solicitante", senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: id, organizacaoId: org, areas: ["audiovisual"], papel: papel === "admin" ? "admin" : "solicitante" } })
  }
  // A empresa cadastrou os próprios departamentos e não listou "audiovisual":
  // o pedido de vídeo não pode ser recusado por isso (é um dos legados).
  await db.configParametro.createMany({ data: [
    { organizacaoId: org, grupo: "departamentos", valor: "growth", label: "Growth", ordem: 0 },
    { organizacaoId: org, grupo: "departamentos", valor: "rh", label: "RH", ordem: 1 },
  ] })
})

afterAll(async () => {
  const ids = (await db.demanda.findMany({ where: { organizacaoId: org }, select: { id: true } })).map((d) => d.id)
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.checklistItem.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demandaProduto.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demandaResponsavel.deleteMany({ where: { demandaId: { in: ids } } })
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: org } }).catch(() => undefined)
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.configParametro.deleteMany({ where: { organizacaoId: org } })
  await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("pedido de vídeo pelo Nova demanda", () => {
  it("grava o departamento Audiovisual, não Growth", async () => {
    sessao(pessoas.rh, "solicitante")
    const { id } = await criar(corpoDoVideo())
    const d = await db.demanda.findUniqueOrThrow({ where: { id }, select: { departamento: true, area: true } })
    expect(d).toEqual({ departamento: "audiovisual", area: "audiovisual" })
    sessao(pessoas.admin, "admin")
    expect(await idsDoFiltro("departamento=audiovisual")).toContain(id)
    expect(await idsDoFiltro("departamento=growth")).not.toContain(id)
  })

  it("cobertura continua em Eventos", async () => {
    sessao(pessoas.admin, "admin")
    const { id } = await criar({
      ...corpoDoVideo(), titulo: "Cobertura do congresso", departamento: departamentoDoPedido("cobertura"),
      tipoVideo: "cobertura_evento", cidade: "Curitiba", localEvento: "Centro de Convenções", cobertura: true, formato: undefined,
      dataLimite: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    })
    expect((await db.demanda.findUniqueOrThrow({ where: { id }, select: { departamento: true } })).departamento).toBe("eventos")
  })
})
