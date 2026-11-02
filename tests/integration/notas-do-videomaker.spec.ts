import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Minhas notas fiscais do videomaker (29/10/2026): a lista só traz gravação
// externa com nota pedida, e uma nota cobre várias gravações, tudo ou nada.
// Rotas reais, banco real; a sessão, o armazenamento e os avisos são simulados.
const { estado, tarefas } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
  tarefas: [] as string[],
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: (_t: () => Promise<unknown>, rotulo: string) => { tarefas.push(rotulo) } }))
vi.mock("@/lib/midia", async (original) => ({ ...await original<typeof import("@/lib/midia")>(), subirArquivo: async (caminho: string) => `/api/midia/${caminho}` }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET, POST } from "@/app/api/me/notas/route"

const p = `notas-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const usuario = `${p}-gabriel`, vm = `${p}-vm`, outro = `${p}-vm-outro`
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10])

async function gravacao(videomakerId: string, statusInterno: "editando" | "entregue_cliente" | "brutos_enviados", pedeNota: boolean, dia: string) {
  const id = `${p}-${randomUUID().slice(0, 6)}`
  await db.demanda.create({ data: {
    id, organizacaoId: org, codigo: id, titulo: "Gravação", descricao: "-", clienteFinalNome: `Clínica ${dia}`,
    area: "audiovisual", departamento: "eventos", tipoVideo: "cobertura_evento", cidade: "Curitiba",
    solicitanteId: usuario, videomakerId, statusInterno, statusVisivel: "edicao", dataCaptacao: new Date(`${dia}T16:00:00Z`),
  } })
  if (pedeNota) await db.notaFiscalUpload.create({ data: { demandaId: id, videomakerId } })
  return id
}

const enviar = (ids: string[]) => {
  const fd = new FormData()
  fd.append("arquivo", new File([PDF], "nota-outubro.pdf", { type: "application/pdf" }))
  fd.append("demandaIds", JSON.stringify(ids))
  return POST(new NextRequest("http://localhost/api/me/notas", { method: "POST", body: fd }))
}
const listar = async () => (await GET()).json() as Promise<{ paraEnviar: { id: string }[]; enviadas: { id: string; estado: string; nota: string | null }[] }>

let a: string, b: string, antiga: string, doOutro: string
beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  await db.usuario.create({ data: { id: usuario, nome: "Gabriel Landin", email: `${usuario}@exemplo.test`, tipo: "videomaker", senhaHash: "sem-login" } })
  await db.usuarioOrganizacao.create({ data: { usuarioId: usuario, organizacaoId: org, papel: "videomaker", areas: ["audiovisual"] } })
  await db.videomaker.create({ data: { id: vm, nome: "Gabriel Landin", usuarioId: usuario } })
  await db.videomaker.create({ data: { id: outro, nome: "Outro" } })
  for (const v of [vm, outro]) await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: v, tipoContrato: "externo" } })
  a = await gravacao(vm, "editando", true, "2026-10-10")
  b = await gravacao(vm, "brutos_enviados", true, "2026-10-20")
  antiga = await gravacao(vm, "entregue_cliente", false, "2026-03-19")
  doOutro = await gravacao(outro, "editando", true, "2026-10-15")
  estado.sessao = { user: { id: usuario, organizacaoId: org, tipo: "videomaker", papel: "videomaker", name: "Gabriel" } }
})

beforeEach(() => { tarefas.length = 0 })

afterAll(async () => {
  const ids = (await db.demanda.findMany({ where: { organizacaoId: org }, select: { id: true } })).map((d) => d.id)
  await db.custoVideomaker.deleteMany({ where: { organizacaoId: org } })
  await db.notaFiscalUpload.deleteMany({ where: { demandaId: { in: ids } } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: org } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.videomakerOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: { in: [vm, outro] } } })
  await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: usuario } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("minhas notas fiscais", () => {
  it("lista só as gravações dele com nota pedida; card antigo sem pedido e de outro videomaker ficam de fora", async () => {
    expect((await listar()).paraEnviar.map((g) => g.id)).toEqual([b, a])
    expect((await listar()).paraEnviar.map((g) => g.id)).not.toContain(antiga)
  })

  it("tudo ou nada: com uma gravação que não é dele, nada é recebido", async () => {
    expect((await enviar([a, doOutro])).status).toBe(404)
    expect((await db.notaFiscalUpload.findFirstOrThrow({ where: { demandaId: a } })).status).toBe("pendente")
  })

  it("uma nota para duas gravações: o mesmo arquivo nas duas, e um aviso só", async () => {
    const r = await enviar([a, b])
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ mensagem: "Nota enviada para 2 gravações." })
    const notas = await db.notaFiscalUpload.findMany({ where: { demandaId: { in: [a, b] } } })
    expect(notas.map((n) => n.status)).toEqual(["enviada", "enviada"])
    expect(new Set(notas.map((n) => n.url)).size).toBe(1)
    expect(notas[0].url).toMatch(new RegExp(`^/api/midia/org/${org}/nf/lote-`))
    expect((await db.custoVideomaker.findMany({ where: { organizacaoId: org, demandaId: { in: [a, b] } } })).map((c) => c.statusPagamento)).toEqual(["nf_enviada", "nf_enviada"])
    expect(tarefas).toEqual(["aviso-gravacao"])
  })

  it("pedido antigo não some atrás de muitas gravações recentes; uma nota cobre até 50", async () => {
    const velha = await gravacao(vm, "editando", true, "2025-01-10")
    const recentes = Array.from({ length: 105 }, (_, i) => `${p}-r${i}`)
    await db.demanda.createMany({ data: recentes.map((id, i) => ({
      id, organizacaoId: org, codigo: id, titulo: "Gravação", descricao: "-", area: "audiovisual", departamento: "eventos",
      tipoVideo: "cobertura_evento", cidade: "Curitiba", solicitanteId: usuario, videomakerId: vm, statusInterno: "aprovado" as const,
      statusVisivel: "para_postar" as const, dataCaptacao: new Date(Date.UTC(2026, 9, 1, 12, i)),
    })) })
    await db.notaFiscalUpload.createMany({ data: recentes.map((demandaId) => ({ demandaId, videomakerId: vm, status: "enviada", url: "https://exemplo.invalid/n.pdf" })) })
    expect((await listar()).paraEnviar.map((g) => g.id)).toContain(velha)
    const r = await enviar(Array.from({ length: 51 }, (_, i) => `${p}-x${i}`))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe("Escolha de 1 a 50 gravações para esta nota.")
    await db.notaFiscalUpload.deleteMany({ where: { demandaId: { in: [...recentes, velha] } } })
    await db.demanda.deleteMany({ where: { id: { in: [...recentes, velha] } } })
  })

  it("depois de enviada, sai da lista de espera e aparece em enviadas com o link da nota", async () => {
    const l = await listar()
    expect(l.paraEnviar).toEqual([])
    expect(l.enviadas.map((g) => [g.id, g.estado])).toEqual([[b, "recebida"], [a, "recebida"]])
    expect(l.enviadas[0].nota).toMatch(/\?token=/)
    expect((await enviar([a])).status).toBe(409)
  })
})
