import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Gravações Externas (28/10/2026): a nota do videomaker corre em paralelo às
// etapas. A lista do quadro só traz o estado dela para quem vê custos ou aprova
// pagamentos, e a nota é pedida quando o material chega — bruto ou já editado
// pelo videomaker. Rotas reais, banco real; só a sessão e os avisos são
// simulados (as tarefas de segundo plano ficam guardadas para o teste rodar).
const { estado, tarefas, emailParaCompras } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
  tarefas: [] as { rotulo: string; tarefa: () => Promise<unknown> }[],
  emailParaCompras: { resultado: { ok: false, error: "simulado" } as { ok: boolean; error?: string }, chamadas: [] as unknown[][] },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: (tarefa: () => Promise<unknown>, rotulo: string) => { tarefas.push({ rotulo, tarefa }) } }))
// Nenhum e-mail sai do teste: o resultado do envio para compras é escolhido aqui.
vi.mock("@/lib/email", async (original) => ({
  ...await original<typeof import("@/lib/email")>(),
  sendEmailNotaParaCompras: async (...args: unknown[]) => { emailParaCompras.chamadas.push(args); return emailParaCompras.resultado },
}))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { PRESETS } from "@/lib/permissoes"
import { GET } from "@/app/api/demandas/route"
import { PATCH as mover } from "@/app/api/demandas/[id]/status/route"
import { GET as abrir, PUT as editar } from "@/app/api/demandas/[id]/route"
import { POST as nota } from "@/app/api/jobs/[id]/nota/route"
import { situacaoDaNota } from "@/lib/etapas-da-gravacao"

const p = `gravacoes-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = { admin: `${p}-admin`, equipe: `${p}-equipe`, financeiro: `${p}-fin` }
const vm = `${p}-vm`

function como(id: string, papel: string) {
  estado.sessao = { user: { id, organizacaoId: org, tipo: papel, papel, name: id } }
}

async function gravacao(statusInterno: "captacao_realizada" | "captacao_agendada") {
  const id = `${p}-${randomUUID().slice(0, 6)}`
  await db.demanda.create({ data: {
    id, organizacaoId: org, codigo: id, titulo: "Gravação na clínica", descricao: "Treinamento do equipamento.",
    area: "audiovisual", departamento: "eventos", tipoVideo: "cobertura_evento", cidade: "Curitiba",
    solicitanteId: pessoas.admin, videomakerId: vm, statusInterno, statusVisivel: "producao",
  } })
  return id
}

async function noQuadro(id: string) {
  const res = await GET(new NextRequest("http://localhost/api/demandas?area=audiovisual&quadro=jobs&limit=200"))
  expect(res.status).toBe(200)
  const { demandas } = await res.json() as { demandas: { id: string; statusInterno: string; videomakerId: string | null; custos?: never; notasFiscais?: never }[] }
  return demandas.find((d) => d.id === id)
}

async function moverPara(id: string, statusInterno: string) {
  const res = await mover(
    new NextRequest(`http://localhost/api/demandas/${id}/status`, { method: "PATCH", body: JSON.stringify({ statusInterno, origem: "kanban" }) }),
    { params: Promise.resolve({ id }) },
  )
  return res
}

async function rodarSegundoPlano() {
  const fila = tarefas.splice(0)
  for (const t of fila) await t.tarefa()
  return fila.map((t) => t.rotulo)
}

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const [quem, id] of Object.entries(pessoas)) {
    const papel = quem === "admin" ? "admin" : "solicitante"
    await db.usuario.create({ data: { id, nome: id, email: `${id}@exemplo.test`, tipo: papel, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: id, organizacaoId: org, areas: ["audiovisual"], papel } })
  }
  // Quem é da equipe vê o quadro, mas não custos; o financeiro vê custos.
  await db.permissaoUsuario.create({ data: { usuarioId: pessoas.equipe, organizacaoId: org, ...PRESETS.solicitante, verTodasDemandas: true, verCustos: false, verAprovacoes: false } })
  await db.permissaoUsuario.create({ data: { usuarioId: pessoas.financeiro, organizacaoId: org, ...PRESETS.solicitante, verTodasDemandas: true, verCustos: true } })
  await db.videomaker.create({ data: { id: vm, nome: vm } })
  await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: vm, tipoContrato: "externo" } })
})

beforeEach(() => { tarefas.length = 0 })

afterAll(async () => {
  const ids = (await db.demanda.findMany({ where: { organizacaoId: org }, select: { id: true } })).map((d) => d.id)
  await db.notaFiscalUpload.deleteMany({ where: { demandaId: { in: ids } } })
  await db.custoVideomaker.deleteMany({ where: { organizacaoId: org } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.videomakerOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: vm } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: Object.values(pessoas) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("nota do videomaker no quadro de Gravações Externas", () => {
  it("só quem vê custos ou administra recebe o estado da nota; a equipe vê o card sem ele", async () => {
    const id = await gravacao("captacao_realizada")
    como(pessoas.admin, "admin")
    expect(await noQuadro(id)).toMatchObject({ custos: [], notasFiscais: [] })
    como(pessoas.financeiro, "solicitante")
    expect(await noQuadro(id)).toMatchObject({ custos: [], notasFiscais: [] })
    como(pessoas.equipe, "solicitante")
    const daEquipe = await noQuadro(id)
    expect(daEquipe).toBeDefined()
    expect(daEquipe).not.toHaveProperty("custos")
    expect(daEquipe).not.toHaveProperty("notasFiscais")
  })

  it("material que chega editado pelo videomaker (Agendado → Para enviar) pede a nota, como os brutos", async () => {
    const id = await gravacao("captacao_realizada")
    como(pessoas.admin, "admin")
    expect((await moverPara(id, "aprovado")).status).toBe(200)
    expect(await rodarSegundoPlano()).toContain("nf-upload-brutos")
    expect(await db.notaFiscalUpload.count({ where: { demandaId: id, videomakerId: vm } })).toBe(1)
    const card = await noQuadro(id)
    expect(card && situacaoDaNota(card)).toEqual({ etapa: "falta", texto: "Falta a nota", tom: "falta" })
  })

  it("gravou mas não mandou (continua agendado) ainda não pede nota", async () => {
    const id = await gravacao("captacao_agendada")
    como(pessoas.admin, "admin")
    expect((await moverPara(id, "captacao_realizada")).status).toBe(200)
    expect(await rodarSegundoPlano()).not.toContain("nf-upload-brutos")
    expect(await db.notaFiscalUpload.count({ where: { demandaId: id } })).toBe(0)
  })

  it("o card aberto traz o link da nota para quem pode ver; a equipe não", async () => {
    const id = await gravacao("captacao_realizada")
    como(pessoas.admin, "admin")
    await db.demanda.update({ where: { id }, data: { linkBrutos: "https://drive.example/brutos" } })
    expect((await moverPara(id, "brutos_enviados")).status).toBe(200)
    await rodarSegundoPlano()
    const lido = async () => (await (await abrir(new NextRequest(`http://localhost/api/demandas/${id}`), { params: Promise.resolve({ id }) })).json()).demanda
    const doAdmin = await lido()
    expect(doAdmin.notasFiscais).toHaveLength(1)
    expect(doAdmin.notasFiscais[0]).toMatchObject({ status: "pendente", token: expect.any(String) })
    como(pessoas.equipe, "solicitante")
    expect(await lido()).not.toHaveProperty("notasFiscais")
  })
})

describe("quem edita a gravação", () => {
  const salvar = (id: string, edicaoPor: unknown) => editar(
    new NextRequest(`http://localhost/api/demandas/${id}`, { method: "PUT", body: JSON.stringify({ edicaoPor }) }),
    { params: Promise.resolve({ id }) },
  )

  it("grava o combinado e registra no histórico; nulo limpa", async () => {
    const id = await gravacao("captacao_agendada")
    como(pessoas.admin, "admin")
    expect((await salvar(id, "videomaker")).status).toBe(200)
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).edicaoPor).toBe("videomaker")
    await rodarSegundoPlano()
    const historico = await db.historicoStatus.findMany({ where: { demandaId: id }, select: { observacao: true } })
    expect(historico.some((h) => h.observacao?.includes("quem edita"))).toBe(true)
    expect((await salvar(id, null)).status).toBe(200)
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).edicaoPor).toBeNull()
  })

  it("valor fora dos três é recusado com a frase", async () => {
    const id = await gravacao("captacao_agendada")
    como(pessoas.admin, "admin")
    const res = await salvar(id, "cliente")
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/videomaker, equipe ou sem edição/)
  })
})

describe("nota do videomaker até compras", () => {
  async function comNotaRecebida() {
    const id = await gravacao("captacao_realizada")
    await db.demanda.update({ where: { id }, data: { statusInterno: "editando", statusVisivel: "edicao", clienteFinalNome: "Clínica Teste" } })
    await db.notaFiscalUpload.create({ data: { demandaId: id, videomakerId: vm, status: "enviada", url: "https://exemplo.invalid/nf.pdf" } })
    await db.custoVideomaker.create({ data: { organizacaoId: org, demandaId: id, videomakerId: vm, valor: 0, dataReferencia: new Date(), statusPagamento: "nf_enviada", notaFiscalUrl: "https://exemplo.invalid/nf.pdf" } })
    return id
  }
  const agir = (id: string, acao: string) => nota(
    new NextRequest(`http://localhost/api/jobs/${id}/nota`, { method: "POST", body: JSON.stringify({ acao }) }),
    { params: Promise.resolve({ id }) },
  )
  const custoDe = async (id: string) => db.custoVideomaker.findFirstOrThrow({ where: { demandaId: id } })

  it("e-mail que falha não muda nada e diz o plano B; \"já mandei por fora\" anda sem e-mail", async () => {
    const id = await comNotaRecebida()
    como(pessoas.admin, "admin")
    emailParaCompras.resultado = { ok: false, error: "Nenhum e-mail de compras configurado" }
    const falha = await agir(id, "enviar_compras")
    expect(falha.status).toBe(502)
    expect((await falha.json()).error).toMatch(/Baixe a nota, mande por fora e marque como enviada/)
    expect((await custoDe(id)).statusPagamento).toBe("nf_enviada")

    expect((await agir(id, "marcar_enviada")).status).toBe(200)
    expect(await custoDe(id)).toMatchObject({ statusPagamento: "aguardando_pagamento", emailFinanceiroAt: null })
    const historico = await db.historicoStatus.findMany({ where: { demandaId: id, statusNovo: "nota_videomaker" } })
    expect(historico.map((h) => h.observacao)).toContain("Nota enviada para compras (por fora)")
  })

  it("e-mail que sai vai com cópia para quem clicou; depois, marcar como paga", async () => {
    const id = await comNotaRecebida()
    como(pessoas.financeiro, "solicitante")
    emailParaCompras.resultado = { ok: true }
    emailParaCompras.chamadas.length = 0
    expect((await agir(id, "enviar_compras")).status).toBe(200)
    expect(emailParaCompras.chamadas[0][2]).toEqual([`${pessoas.financeiro}@exemplo.test`])
    expect((emailParaCompras.chamadas[0][0] as { cliente: string }).cliente).toBe("Clínica Teste")
    expect((await custoDe(id)).statusPagamento).toBe("aguardando_pagamento")
    expect((await custoDe(id)).emailFinanceiroAt).not.toBeNull()

    expect((await agir(id, "marcar_paga")).status).toBe(200)
    expect(await custoDe(id)).toMatchObject({ statusPagamento: "pago", pago: true })
  })

  it("pagar antes de mandar para compras é recusado; quem não vê custos não age", async () => {
    const id = await comNotaRecebida()
    como(pessoas.admin, "admin")
    const cedo = await agir(id, "marcar_paga")
    expect(cedo.status).toBe(409)
    como(pessoas.equipe, "solicitante")
    expect((await agir(id, "marcar_enviada")).status).toBe(403)
  })
})
