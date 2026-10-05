import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { emitirConvite, responderConvite } from "@/lib/convites"
import { EVENTO_EDICAO } from "@/lib/status"
import { GET, POST } from "@/app/api/jobs/[id]/transferir/route"
import { POST as CONVERTER } from "@/app/api/jobs/[id]/converter/route"

// Job criado por engano volta para Demandas: rota real, banco real; só a sessão é simulada.
const p = `transf-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const admin = `${p}-admin`, gestor = `${p}-gestor`, lider = `${p}-lider`, vm = `${p}-vm`
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const corpo = (body: unknown) => new NextRequest("http://localhost/api/jobs/x/transferir", { method: "POST", body: JSON.stringify(body) })
const transferir = (id: string, body: unknown = { confirmar: true, tipoVideo: "institucional" }) => POST(corpo(body), ctx(id))
const previa = (id: string) => GET(new NextRequest("http://localhost/api/jobs/x/transferir"), ctx(id))
const como = (usuario: string) => { estado.sessao = { user: { id: usuario, organizacaoId: org, tipo: "admin" } } }
const job = (extra: Record<string, unknown> = {}) => db.demanda.create({ data: {
  organizacaoId: org, codigo: `${p}-${randomUUID().slice(0, 6)}`, titulo: "Card errado", descricao: "Teste", cidade: "Teste",
  departamento: "eventos", tipoVideo: "cobertura_evento", area: "audiovisual", solicitanteId: admin,
  statusInterno: "planejamento", statusVisivel: "producao", ...extra,
} })
const ator = { organizacaoId: org, usuarioId: admin }

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: org, slug: org } })
  for (const [id, papel] of [[admin, "admin"], [gestor, "gestor"], [lider, "operacao"]] as const) {
    await db.usuario.create({ data: { id, nome: id, tipo: "admin", senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: id, organizacaoId: org, papel, areas: [], liderAudiovisual: id === lider } })
  }
  await db.videomaker.create({ data: { id: vm, nome: "Profissional sintético", redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
  await db.videomakerOrganizacao.create({ data: { videomakerId: vm, organizacaoId: org, valorDiaria: 500 } })
})
beforeEach(async () => {
  como(admin)
  await db.custoVideomaker.deleteMany({ where: { organizacaoId: org } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: org } })
})
afterAll(async () => {
  await db.custoVideomaker.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } })
  await db.videomaker.deleteMany({ where: { id: vm } })
  await db.usuario.deleteMany({ where: { id: { in: [admin, gestor, lider] } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("conversão", () => {
  it("tira as duas marcas, volta à triagem, cancela convite pendente e registra histórico e auditoria", async () => {
    const d = await job({ statusInterno: "videomaker_notificado" })
    const convite = await db.$transaction((tx) => emitirConvite(tx, ator, d.id, vm))
    await db.eventoAuditoria.deleteMany({ where: { organizacaoId: org } })

    const prev = await (await previa(d.id)).json()
    expect(prev).toMatchObject({ jaEstava: false, impedimentos: [], convitesPendentes: 1, statusDestino: "aguardando_triagem" })

    const r = await transferir(d.id)
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ fluxo: "demanda", jaEstava: false, convitesCancelados: 1 })

    expect(await db.demanda.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({
      departamento: "audiovisual", tipoVideo: "institucional", statusInterno: "aguardando_triagem", statusVisivel: "entrada",
      // O registro é o mesmo: nada de cópia.
      codigo: d.codigo, titulo: d.titulo,
    })
    expect((await db.conviteVideomaker.findUniqueOrThrow({ where: { id: convite.id } })).status).toBe("expirado")

    const hist = await db.historicoStatus.findMany({ where: { demandaId: d.id } })
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ statusAnterior: "videomaker_notificado", statusNovo: "aguardando_triagem", usuarioId: admin })
    expect(hist[0].observacao).toContain("antes: eventos / cobertura_evento")
    expect(hist[0].observacao).toContain("1 convite(s) pendente(s) cancelado(s)")

    const aud = await db.eventoAuditoria.findMany({ where: { organizacaoId: org, acao: "demanda.transferir" } })
    expect(aud).toHaveLength(1)
    expect(aud[0]).toMatchObject({ recurso: "demanda", recursoId: d.id, atorId: admin, resultado: "sucesso" })

    // Duas abas, clique duplo: o segundo não grava nada.
    const de_novo = await transferir(d.id)
    expect(await de_novo.json()).toMatchObject({ jaEstava: true })
    expect(await db.historicoStatus.count({ where: { demandaId: d.id } })).toBe(1)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: org, acao: "demanda.transferir" } })).toBe(1)
  })

  it("urgente vai para urgência aprovada; quem ainda espera aprovação continua esperando", async () => {
    const urgente = await job({ statusInterno: "planejamento", prioridade: "urgente" })
    expect((await transferir(urgente.id)).status).toBe(200)
    expect(await db.demanda.findUniqueOrThrow({ where: { id: urgente.id } })).toMatchObject({ statusInterno: "urgencia_aprovada", statusVisivel: "producao" })

    const pendente = await job({ statusInterno: "aguardando_aprovacao_interna", statusVisivel: "entrada" })
    expect((await transferir(pendente.id)).status).toBe(200)
    expect(await db.demanda.findUniqueOrThrow({ where: { id: pendente.id } })).toMatchObject({ statusInterno: "aguardando_aprovacao_interna", departamento: "audiovisual" })
    // A etapa não mudou: a linha do histórico é edição de campo, não transição.
    expect((await db.historicoStatus.findFirstOrThrow({ where: { demandaId: pendente.id } })).statusNovo).toBe(EVENTO_EDICAO)
  })

  it("exige confirmação explícita", async () => {
    const d = await job()
    const r = await transferir(d.id, { tipoVideo: "outro" })
    expect(r.status).toBe(400)
    expect((await db.demanda.findUniqueOrThrow({ where: { id: d.id } })).departamento).toBe("eventos")
  })
})

describe("bloqueio", () => {
  it("convite aceito (videomaker escalado) impede a transferência e não grava nada", async () => {
    const d = await job({ statusInterno: "videomaker_notificado" })
    const c = await db.$transaction((tx) => emitirConvite(tx, ator, d.id, vm))
    await db.$transaction((tx) => responderConvite(tx, { organizacaoId: org, token: c.token, acao: "aceitar", origem: "automacao", videomakerId: vm }))
    const historicoAntes = await db.historicoStatus.count({ where: { demandaId: d.id } })

    const prev = await (await previa(d.id)).json()
    expect(prev.impedimentos.map((i: { codigo: string }) => i.codigo)).toEqual(
      expect.arrayContaining(["videomaker_escalado", "convite_aceito", "etapa_avancada"])
    )

    const r = await transferir(d.id)
    expect(r.status).toBe(409)
    const json = await r.json()
    expect(json.impedimentos.map((i: { codigo: string }) => i.codigo)).toContain("convite_aceito")

    expect(await db.demanda.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({
      departamento: "eventos", tipoVideo: "cobertura_evento", statusInterno: "videomaker_aceitou", videomakerId: vm,
    })
    expect((await db.conviteVideomaker.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("aceito")
    expect(await db.historicoStatus.count({ where: { demandaId: d.id } })).toBe(historicoAntes)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: org, acao: "demanda.transferir" } })).toBe(0)
  })

  it("custo lançado impede a transferência", async () => {
    const d = await job()
    await db.custoVideomaker.create({ data: { organizacaoId: org, videomakerId: vm, demandaId: d.id, valor: 300, dataReferencia: new Date() } })
    const r = await transferir(d.id)
    expect(r.status).toBe(409)
    expect((await r.json()).impedimentos).toEqual([expect.objectContaining({ codigo: "custo_lancado" })])
    expect((await db.demanda.findUniqueOrThrow({ where: { id: d.id } })).departamento).toBe("eventos")
  })
})

describe("permissão", () => {
  it("gestor pode", async () => {
    como(gestor)
    const d = await job()
    expect((await transferir(d.id)).status).toBe(200)
    expect((await db.demanda.findUniqueOrThrow({ where: { id: d.id } })).departamento).toBe("audiovisual")
  })

  it("quem só edita demanda (operação, líder do audiovisual) não pode — nem pela rota antiga de conversão", async () => {
    como(lider)
    const d = await job()
    expect((await transferir(d.id)).status).toBe(403)
    expect((await previa(d.id)).status).toBe(403)
    const antiga = await CONVERTER(
      new NextRequest("http://localhost/api/jobs/x/converter", { method: "POST", body: JSON.stringify({ para: "demanda", confirmar: true }) }),
      ctx(d.id)
    )
    expect(antiga.status).toBe(403)
    expect(await db.demanda.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({ departamento: "eventos", statusInterno: "planejamento" })
    expect(await db.historicoStatus.count({ where: { demandaId: d.id } })).toBe(0)
  })

  it("card de outra empresa responde 404", async () => {
    const outra = `${p}-outra`
    await db.organizacao.create({ data: { id: outra, nome: outra, slug: outra } })
    try {
      const d = await db.demanda.create({ data: {
        organizacaoId: outra, codigo: `${p}-x`, titulo: "Alheio", descricao: "Teste", cidade: "Teste",
        departamento: "eventos", tipoVideo: "cobertura_evento", solicitanteId: admin, statusInterno: "planejamento",
      } })
      expect((await transferir(d.id)).status).toBe(404)
    } finally {
      await db.organizacao.delete({ where: { id: outra } })
    }
  })
})
