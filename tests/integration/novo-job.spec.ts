import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// "+ Novo Job" de /jobs: o mesmo POST /api/demandas do formulário de cobertura.
// Desde 28/10/2026 quem é da casa cria já aprovado, e o card aparece no quadro
// de Jobs; só a urgência de quem não decide a fila (admin/gestor ou líder do
// audiovisual) cai em Aprovações. Banco real, dados sintéticos.
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
import { GET, POST } from "@/app/api/demandas/route"
import { foiAprovada } from "@/lib/job-fase"

const p = `novo-job-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = { admin: `${p}-admin`, lider: `${p}-lider`, solicitante: `${p}-sol` }

function sessao(id: string, papel: string) {
  estado.sessao = { user: { id, organizacaoId: org, tipo: papel, papel, name: id } }
}

// O corpo que o NovaDemandaModal manda pelo "+ Novo Job".
function corpoDoJob(extra: Record<string, unknown> = {}) {
  return {
    titulo: "Cobertura na clínica", descricao: "Gravar a entrega do equipamento.",
    departamento: "eventos", tipoVideo: "cobertura_evento", cidade: "Curitiba",
    localEvento: "Clínica Teste", cobertura: true, prioridade: "normal",
    dataLimite: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    aprovarAoCriar: true, ...extra,
  }
}

async function criar(body: Record<string, unknown>) {
  const res = await POST(new NextRequest("http://localhost/api/demandas", { method: "POST", body: JSON.stringify(body) }))
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string; statusInterno: string; statusVisivel: string; gestorId: string | null }
}

async function noQuadroDeJobs(id: string) {
  const res = await GET(new NextRequest("http://localhost/api/demandas?area=audiovisual&quadro=jobs&limit=200"))
  expect(res.status).toBe(200)
  const { demandas } = await res.json() as { demandas: { id: string; statusInterno: never; statusVisivel: string }[] }
  // O quadro de Jobs aplica o portão de aprovação na lista carregada.
  return demandas.some((d) => d.id === id && foiAprovada(d))
}

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const [papel, id] of Object.entries(pessoas)) {
    await db.usuario.create({ data: { id, nome: id, tipo: papel === "admin" ? "admin" : "solicitante", senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: {
      usuarioId: id, organizacaoId: org, areas: ["audiovisual"],
      papel: papel === "admin" ? "admin" : "solicitante", liderAudiovisual: papel === "lider",
    } })
  }
})

beforeEach(() => { agendados.length = 0 })

afterAll(async () => {
  const ids = (await db.demanda.findMany({ where: { organizacaoId: org }, select: { id: true } })).map((d) => d.id)
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.checklistItem.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("+ Novo Job", () => {
  it("admin cria aprovado: entra direto no quadro de Jobs, sem pedir aprovação a ninguém", async () => {
    sessao(pessoas.admin, "admin")
    const d = await criar(corpoDoJob())
    expect(d).toMatchObject({ statusInterno: "aguardando_triagem", gestorId: pessoas.admin })
    expect(await noQuadroDeJobs(d.id)).toBe(true)
    expect(await db.alertaIA.count({ where: { demandaId: d.id, tipoAlerta: "aprovacao_pendente" } })).toBe(0)
    expect(agendados).not.toContain("nova-demanda-gestores")
    expect(agendados).toContain("nova-demanda-lideres")
    const h = await db.historicoStatus.findFirstOrThrow({ where: { demandaId: d.id } })
    expect(h.observacao).toBe("Demanda criada e aprovada por quem pediu")
  })

  it("líder do audiovisual também aprova; urgente aprovado entra em produção", async () => {
    sessao(pessoas.lider, "solicitante")
    const d = await criar(corpoDoJob({ prioridade: "urgente", motivoUrgencia: "Cliente antecipou" }))
    expect(d.statusInterno).toBe("urgencia_aprovada")
    expect(await noQuadroDeJobs(d.id)).toBe(true)
  })

  it("quem é da casa e não aprova: entra aprovado, sem virar o gestor do pedido (28/10)", async () => {
    sessao(pessoas.solicitante, "solicitante")
    const d = await criar(corpoDoJob())
    expect(d).toMatchObject({ statusInterno: "aguardando_triagem", gestorId: null })
    expect(await noQuadroDeJobs(d.id)).toBe(true)
    expect(await db.alertaIA.count({ where: { demandaId: d.id, tipoAlerta: "aprovacao_pendente" } })).toBe(0)
    expect(agendados).not.toContain("nova-demanda-gestores")
    const h = await db.historicoStatus.findFirstOrThrow({ where: { demandaId: d.id } })
    expect(h.observacao).toBe("Demanda criada pela equipe — entra sem passar por Aprovações")
  })

  it("urgência de quem não decide a fila ainda passa por Aprovações", async () => {
    sessao(pessoas.solicitante, "solicitante")
    const d = await criar(corpoDoJob({ prioridade: "urgente", motivoUrgencia: "Cliente antecipou" }))
    expect(d.statusInterno).toBe("urgencia_pendente_aprovacao")
    expect(await noQuadroDeJobs(d.id)).toBe(false)
    expect(agendados).toContain("nova-demanda-gestores")
  })

  it("sem a marca, também: quem decide é quem cria, não a tela", async () => {
    sessao(pessoas.admin, "admin")
    const d = await criar(corpoDoJob({ aprovarAoCriar: undefined }))
    expect(d.statusInterno).toBe("aguardando_triagem")
  })
})
