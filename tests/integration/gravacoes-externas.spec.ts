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
import { POST as pedirPublico } from "@/app/api/publico/demanda/route"
import { GET as acompanhar } from "@/app/api/publico/demanda/[token]/route"
import { GET as abrirConvite } from "@/app/api/convites/[token]/route"
import { POST as entregar } from "@/app/api/convites/[token]/entrega/route"
import { POST as responderConvite } from "@/app/api/convites/[token]/route"
import { avisarGravacao } from "@/lib/avisos-gravacao"
import { executarRotina } from "@/lib/automacoes-regras"
import { hojeEmSaoPaulo, somarDias } from "@/lib/datas"
import { GET as listarKit, POST as criarKit } from "@/app/api/gravacoes/kit/route"
import { POST as enviarKit } from "@/app/api/jobs/[id]/kit/route"
import { POST as cancelar } from "@/app/api/jobs/[id]/cancelar/route"
import { emitirConvite } from "@/lib/convites"
import { podeLerMidia } from "@/lib/midia-acesso"
import { decryptSecret } from "@/lib/secret-crypto"
import { comOrg } from "@/lib/org-contexto"
import { foiCancelada, situacaoDaNota } from "@/lib/etapas-da-gravacao"

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
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: org } })
  await db.agenteExecucao.deleteMany({ where: { organizacaoId: org } })
  await db.conviteVideomaker.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demandaProduto.deleteMany({ where: { demandaId: { in: ids } } })
  await db.notaFiscalUpload.deleteMany({ where: { demandaId: { in: ids } } })
  await db.custoVideomaker.deleteMany({ where: { organizacaoId: org } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.videomakerOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: { in: [vm, `${p}-vm-novo`, `${p}-vm-dele`] } } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.produto.deleteMany({ where: { organizacaoId: org } })
  await db.usuario.deleteMany({ where: { email: { endsWith: `@${p}.test` } } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: [...Object.values(pessoas), `${p}-adm-aviso`, `${p}-debora`, `${p}-vm-login`] } } })
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

  it("a nota que veio pelo link do videomaker vai a compras com endereço completo e credencial de leitura", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://nuflow.test/")
    const id = await gravacao("captacao_realizada")
    await db.demanda.update({ where: { id }, data: { statusInterno: "editando", statusVisivel: "edicao" } })
    const url = `/api/midia/org/${org}/nf/${id}/nota.pdf`
    const nf = await db.notaFiscalUpload.create({ data: { demandaId: id, videomakerId: vm, status: "enviada", url } })
    await db.custoVideomaker.create({ data: { organizacaoId: org, demandaId: id, videomakerId: vm, valor: 0, dataReferencia: new Date(), statusPagamento: "nf_enviada", notaFiscalUrl: url } })
    como(pessoas.admin, "admin")
    emailParaCompras.resultado = { ok: true }
    emailParaCompras.chamadas.length = 0
    expect((await agir(id, "enviar_compras")).status).toBe(200)
    const link = (emailParaCompras.chamadas[0][0] as { notaFiscalUrl: string }).notaFiscalUrl
    expect(link).toBe(`https://nuflow.test${url}?token=${encodeURIComponent(nf.token)}`)
    // Quem recebe o e-mail não tem conta: a credencial do link basta para ler a nota.
    estado.sessao = null
    expect(await podeLerMidia(`org/${org}/nf/${id}/nota.pdf`, nf.token)).toBe(true)
    vi.unstubAllEnvs()
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

describe("pedido com tipo, brinde e equipamento", () => {
  it("o pedido público grava tipo, brinde, levar e só o equipamento desta empresa", async () => {
    // A rota assina o token de anexo da resposta.
    vi.stubEnv("NEXTAUTH_SECRET", "segredo-so-do-teste")
    const produto = await db.produto.create({ data: { organizacaoId: org, nome: "Supreme" } })
    const res = await pedirPublico(new NextRequest(`http://localhost/api/publico/demanda?org=${p}`, {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify({
        nomeCliente: "Consultora Teste", email: `consultora@${p}.test`, telefone: "11999998888",
        titulo: "Gravação · Renata", descricao: "Entrega de equipamento em Renata.",
        tipoSolicitacao: "cobertura", tipoVideo: "cobertura_evento",
        localEvento: "Praça Leonor de Barros Camargo, 42, Indaiatuba - SP", dataEvento: "2026-11-07T08:30:00-03:00",
        clienteFinalNome: "Renata", clienteFinalTelefone: "5519981031327",
        tipoGravacao: "entrega_equipamento", temBrinde: true, brinde: "Caixa mineira", levar: "banner",
        produtoIds: [produto.id, "produto-de-outra-empresa"],
      }),
    }))
    expect(res.status).toBe(201)
    const { codigo, acompanhamento } = await res.json() as { codigo: string; acompanhamento: string }
    const d = await db.demanda.findFirstOrThrow({ where: { codigo, organizacaoId: org }, include: { produtos: true } })
    expect(d).toMatchObject({ tipoGravacao: "entrega_equipamento", temBrinde: true, brinde: "Caixa mineira", levar: "banner", clienteFinalTelefone: "5519981031327" })
    expect(d.produtos.map((x) => x.produtoId)).toEqual([produto.id])
    // Quem pediu sai com o link de acompanhamento, e ele vai no WhatsApp de recebido.
    expect(acompanhamento).toBe(`/d/${d.publicToken}`)
    expect(tarefas.map((t) => t.rotulo)).toContain("wa-solicitante-recebida")
  })

  it("a página de quem pediu mostra a gravação, sem nada de dentro", async () => {
    const id = await gravacao("captacao_agendada")
    const token = `tok-acomp-${p}`
    await db.demanda.update({ where: { id }, data: { clienteFinalNome: "Clínica Cristal", tipoGravacao: "entrega_equipamento", clienteFinalTelefone: "5519981031327",
      dataCaptacao: new Date("2031-05-10T16:00:00Z"), localGravacao: "Alameda dos Nhambiquaras, 1700", publicToken: token, publicTokenAtivo: true } })
    const res = await acompanhar(new NextRequest(`http://localhost/api/publico/demanda/${token}`), { params: Promise.resolve({ token }) })
    expect(res.status).toBe(200)
    const { demanda } = await res.json() as { demanda: Record<string, unknown> & { gravacao: Record<string, unknown> } }
    expect(demanda.gravacao).toMatchObject({ cliente: "Clínica Cristal", tipo: "Entrega de equipamento", quando: "Sáb, 10/05 · 13:00",
      onde: "Alameda dos Nhambiquaras, 1700", videomaker: vm, situacao: "Gravação agendada" })
    for (const campo of ["statusInterno", "videomaker", "videomakerId", "historicos", "custos", "clienteFinalTelefone", "edicaoPor", "departamento"]) {
      expect(demanda, campo).not.toHaveProperty(campo)
    }
    await db.demanda.update({ where: { id }, data: { publicTokenAtivo: false } })
  })

  it("no card, tipo fora da lista é recusado; o certo grava", async () => {
    const id = await gravacao("captacao_agendada")
    como(pessoas.admin, "admin")
    const salvar = (corpo: unknown) => editar(new NextRequest(`http://localhost/api/demandas/${id}`, { method: "PUT", body: JSON.stringify(corpo) }), { params: Promise.resolve({ id }) })
    expect((await salvar({ tipoGravacao: "treinamento" })).status).toBe(400)
    expect((await salvar({ tipoGravacao: "demonstracao", temBrinde: false, levar: "tripé" })).status).toBe(200)
    expect(await db.demanda.findUniqueOrThrow({ where: { id } })).toMatchObject({ tipoGravacao: "demonstracao", temBrinde: false, levar: "tripé" })
  })
})

describe("entrega do videomaker pelo link do convite", () => {
  async function comConvite(edicaoPor: "equipe" | "videomaker", status = "aceito") {
    const id = await gravacao("captacao_agendada")
    await db.demanda.update({ where: { id }, data: { edicaoPor } })
    const token = `tok-${randomUUID()}`
    await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vm, token, status, expiresAt: new Date(Date.now() + 86400_000) } })
    return { id, token }
  }
  const abrir = (token: string) => abrirConvite(new NextRequest(`http://localhost/api/convites/${token}`), { params: Promise.resolve({ token }) })
  const mandar = (token: string, corpo: unknown) => entregar(
    new NextRequest(`http://localhost/api/convites/${token}/entrega`, { method: "POST", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ token }) },
  )

  it("nossa edição: os brutos chegam, a gravação vai para a edição e a nota abre no mesmo link", async () => {
    const { id, token } = await comConvite("equipe")
    const antes = await (await abrir(token)).json()
    expect(antes.entrega).toEqual({ liberada: true, nota: null })

    expect((await mandar(token, { linkBrutos: "drive sem protocolo" })).status).toBe(400)
    const r = await mandar(token, { linkBrutos: "https://drive.example/brutos" })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ completo: true, mudouEtapa: true })
    expect(await db.demanda.findUniqueOrThrow({ where: { id } })).toMatchObject({ statusInterno: "brutos_enviados", linkBrutos: "https://drive.example/brutos" })

    const depois = await (await abrir(token)).json()
    expect(depois.entrega.nota).toMatchObject({ status: "pendente", token: expect.any(String) })
    const historico = await db.historicoStatus.findMany({ where: { demandaId: id }, select: { observacao: true } })
    expect(historico.map((h) => h.observacao)).toContain("Material entregue pelo videomaker no link do convite")
  })

  it("edição dele: só os brutos não completam; com o vídeo pronto vai direto para enviar", async () => {
    const { id, token } = await comConvite("videomaker")
    expect(await (await mandar(token, { linkBrutos: "https://drive.example/b" })).json()).toEqual({ completo: false, mudouEtapa: false })
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).statusInterno).toBe("captacao_agendada")
    expect(await (await mandar(token, { linkVideo: "https://drive.example/pronto" })).json()).toEqual({ completo: true, mudouEtapa: true })
    expect(await db.demanda.findUniqueOrThrow({ where: { id } })).toMatchObject({ statusInterno: "aprovado", linkFinal: "https://drive.example/pronto" })
    // Pronto para o cliente: o link do convite não troca mais o vídeo.
    expect((await mandar(token, { linkVideo: "https://drive.example/outro" })).status).toBe(409)
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).linkFinal).toBe("https://drive.example/pronto")
  })

  it("nossa edição: o convite não aceita vídeo pronto, nem troca os brutos que já chegaram", async () => {
    const { id, token } = await comConvite("equipe")
    expect((await mandar(token, { linkVideo: "https://drive.example/pronto" })).status).toBe(403)
    expect((await mandar(token, { linkBrutos: "https://drive.example/b" })).status).toBe(200)
    await db.demanda.update({ where: { id }, data: { linkFinal: "https://drive.example/editado-pela-equipe" } })
    expect((await mandar(token, { linkBrutos: "https://drive.example/b2" })).status).toBe(409)
    expect((await mandar(token, { linkVideo: "https://drive.example/meu" })).status).toBe(403)
    expect(await db.demanda.findUniqueOrThrow({ where: { id } })).toMatchObject({ linkBrutos: "https://drive.example/b", linkFinal: "https://drive.example/editado-pela-equipe" })
  })

  it("convite recusado não entrega", async () => {
    const { token } = await comConvite("equipe", "recusado")
    expect((await abrir(token)).status).toBe(400)
    expect((await mandar(token, { linkBrutos: "https://drive.example/b" })).status).toBe(403)
  })
})

describe("avisos das gravações", () => {
  // Telefones de teste, únicos nesta rodada: a fila só aceita quem ela reconhece.
  const tel = () => `5541${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const telAdmin = tel(), telOperadora = tel(), telVm = tel(), telCliente = tel()
  const adminAviso = `${p}-adm-aviso`, operadora = `${p}-debora`

  beforeAll(async () => {
    await db.usuario.create({ data: { id: adminAviso, nome: "Gestão", tipo: "admin", telefone: telAdmin, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: adminAviso, organizacaoId: org, papel: "admin" } })
    await db.usuario.create({ data: { id: operadora, nome: "Débora", tipo: "solicitante", telefone: telOperadora, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: operadora, organizacaoId: org, papel: "solicitante", operaGravacoes: true } })
    await db.videomaker.update({ where: { id: vm }, data: { telefone: telVm } })
  })

  const saidas = (demandaId: string) => db.saidaWhatsapp.findMany({ where: { organizacaoId: org, referencia: demandaId }, select: { destinatarioTipo: true, destinatarioId: true, origem: true } })
  async function noConvite(acao: "aceitar" | "recusar") {
    const id = await gravacao("captacao_agendada")
    await db.demanda.update({ where: { id }, data: { statusInterno: "videomaker_notificado", clienteFinalTelefone: telCliente, dataCaptacao: new Date(`${somarDias(hojeEmSaoPaulo(), 5)}T13:00:00-03:00`) } })
    const token = `tok-${randomUUID()}`
    await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vm, token, status: "pendente", expiresAt: new Date(Date.now() + 86400_000) } })
    const res = await responderConvite(new NextRequest(`http://localhost/api/convites/${token}`, { method: "POST", body: JSON.stringify({ acao }) }), { params: Promise.resolve({ token }) })
    expect(res.status).toBe(200)
    return id
  }

  it("confirmou pelo convite: a operação e o cliente recebem; a gestão, não", async () => {
    const id = await noConvite("aceitar")
    const s = await saidas(id)
    expect(s).toEqual(expect.arrayContaining([
      expect.objectContaining({ destinatarioTipo: "usuario", destinatarioId: operadora }),
      expect.objectContaining({ destinatarioTipo: "cliente", destinatarioId: id }),
    ]))
    expect(s.some((x) => x.destinatarioId === adminAviso)).toBe(false)
  })

  it("recusa é trava: a operação e a gestão recebem", async () => {
    const s = await saidas(await noConvite("recusar"))
    expect(s.map((x) => x.destinatarioId).sort()).toEqual([adminAviso, operadora].sort())
  })

  it("quem fez a mudança não recebe; sem ninguém marcado, a gestão faz o papel da operação", async () => {
    const id = await gravacao("captacao_agendada")
    await avisarGravacao(org, id, "pronta", operadora)
    expect(await saidas(id)).toEqual([])

    await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: operadora, organizacaoId: org } }, data: { operaGravacoes: false } })
    try {
      const outra = await gravacao("captacao_agendada")
      await avisarGravacao(org, outra, "pronta")
      expect((await saidas(outra)).map((x) => x.destinatarioId)).toContain(adminAviso)
    } finally {
      await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: operadora, organizacaoId: org } }, data: { operaGravacoes: true } })
    }
  })

  it("rotina diária: véspera para o videomaker e gravação sem videomaker para a gestão", async () => {
    const amanha = somarDias(hojeEmSaoPaulo(), 1)
    const vespera = await gravacao("captacao_agendada")
    await db.demanda.update({ where: { id: vespera }, data: { dataCaptacao: new Date(`${amanha}T13:00:00-03:00`) } })
    const semVm = await gravacao("captacao_agendada")
    await db.demanda.update({ where: { id: semVm }, data: { statusInterno: "aguardando_triagem", statusVisivel: "entrada", videomakerId: null, dataEvento: new Date(`${amanha}T09:00:00-03:00`) } })

    await executarRotina(org, "gravacoes")

    expect(await saidas(vespera)).toEqual([expect.objectContaining({ origem: "regra", destinatarioTipo: "videomaker", destinatarioId: vm })])
    expect(await saidas(semVm)).toEqual([expect.objectContaining({ origem: "regra", destinatarioId: adminAviso })])
  })

  it("nota parada há 5 dias avisa a gestão mesmo com o vídeo já entregue ao cliente", async () => {
    const entregue = await gravacao("captacao_realizada")
    await db.demanda.update({ where: { id: entregue }, data: { statusInterno: "entregue_cliente", statusVisivel: "finalizado" } })
    const custo = await db.custoVideomaker.create({ data: { organizacaoId: org, demandaId: entregue, videomakerId: vm, valor: 0, dataReferencia: new Date(), statusPagamento: "nf_enviada", notaFiscalUrl: "https://exemplo.invalid/nf.pdf" } })
    await db.$executeRaw`UPDATE custos_videomaker SET "updatedAt" = ${new Date(Date.now() - 5 * 86400_000)} WHERE id = ${custo.id}`

    await executarRotina(org, "gravacoes")

    expect(await saidas(entregue)).toEqual([expect.objectContaining({ origem: "regra", destinatarioId: adminAviso })])
  })
})

describe("kit do videomaker", () => {
  const tel = () => `5541${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const textos = async (demandaId: string) => (await db.saidaWhatsapp.findMany({ where: { organizacaoId: org, referencia: demandaId }, select: { conteudoCifrado: true, origem: true } }))
    .map((x) => ({ origem: x.origem, texto: decryptSecret(x.conteudoCifrado!) }))
  const adicionar = (corpo: unknown) => criarKit(new NextRequest("http://localhost/api/gravacoes/kit", { method: "POST", body: JSON.stringify(corpo) }))
  const pdf = `/api/midia/org/${org}/kit/guia/1.pdf`

  // Um videomaker que nunca gravou com a empresa: é a primeira vez dele.
  const vmNovo = `${p}-vm-novo`
  beforeAll(async () => {
    await db.videomaker.update({ where: { id: vm }, data: { telefone: tel() } })
    await db.videomaker.create({ data: { id: vmNovo, nome: "Novo", telefone: tel() } })
    await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: vmNovo, tipoContrato: "externo" } })
  })

  it("monta o kit quem é da gestão; a equipe só vê", async () => {
    como(pessoas.admin, "admin")
    expect((await adicionar({ titulo: "Guia de captação", tipo: "guia", url: pdf, tipoGravacao: "entrega_equipamento" })).status).toBe(201)
    expect((await adicionar({ titulo: "Referência: depoimento", tipo: "referencia", url: "https://drive.example/depoimento" })).status).toBe(201)
    expect((await adicionar({ titulo: "Colinha", tipo: "colinha", texto: "🎬 Hoje: {cliente}, {hora}.\n{link}" })).status).toBe(201)
    expect((await adicionar({ titulo: "Link solto", tipo: "referencia", url: "javascript:alert(1)" })).status).toBe(400)
    como(pessoas.equipe, "solicitante")
    expect((await adicionar({ titulo: "Outro", tipo: "referencia", url: "https://x.example" })).status).toBe(403)
    const lido = await (await listarKit()).json()
    expect(lido).toMatchObject({ podeEditar: false })
    expect(lido.materiais).toHaveLength(3)
  })

  it("o convite da primeira vez aponta o guia; o link mostra o kit e libera o PDF só com o convite", async () => {
    const id = await gravacao("captacao_agendada")
    await db.demanda.update({ where: { id }, data: { statusInterno: "planejamento", videomakerId: null, tipoGravacao: "entrega_equipamento", clienteFinalNome: "Clínica Kit", dataCaptacao: new Date(`${somarDias(hojeEmSaoPaulo(), 6)}T13:00:00-03:00`) } })
    const convite = await comOrg(org, () => db.$transaction((tx) => emitirConvite(tx, { organizacaoId: org, usuarioId: pessoas.admin }, id, vmNovo)))
    const convites = await db.saidaWhatsapp.findMany({ where: { organizacaoId: org, referencia: convite.id }, select: { conteudoCifrado: true } })
    expect(decryptSecret(convites[0].conteudoCifrado!)).toContain("É a sua primeira gravação com a gente")

    const pagina = await (await abrirConvite(new NextRequest(`http://localhost/api/convites/${convite.token}`), { params: Promise.resolve({ token: convite.token }) })).json()
    expect(pagina.kit.materiais.map((m: { titulo: string }) => m.titulo).sort()).toEqual(["Guia de captação", "Referência: depoimento"])
    expect(pagina.kit.materiais.find((m: { tipo: string }) => m.tipo === "guia").url).toBe(`${pdf}?token=${encodeURIComponent(convite.token)}`)
    expect(pagina.kit.colinha).toBe("🎬 Hoje: Clínica Kit, 13:00.")

    const caminho = pdf.replace("/api/midia/", "")
    expect(await podeLerMidia(caminho, convite.token)).toBe(true)
    estado.sessao = null
    expect(await podeLerMidia(caminho, "token-de-outro")).toBe(false)
  })

  it("o botão do card manda as instruções no WhatsApp do videomaker, uma vez por dia", async () => {
    const { id } = await (async () => {
      const id = await gravacao("captacao_agendada")
      await db.demanda.update({ where: { id }, data: { tipoGravacao: "entrega_equipamento", clienteFinalNome: "Clínica Botão" } })
      await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vm, token: `tok-${randomUUID()}`, status: "aceito", expiresAt: new Date(Date.now() + 86400_000) } })
      return { id }
    })()
    como(pessoas.admin, "admin")
    const mandar = () => enviarKit(new NextRequest(`http://localhost/api/jobs/${id}/kit`, { method: "POST" }), { params: Promise.resolve({ id }) })
    expect(await (await mandar()).json()).toEqual({ mensagem: "Instruções enviadas ao videomaker." })
    expect(await (await mandar()).json()).toEqual({ mensagem: "Já foi enviado hoje para este videomaker." })
    const [enviado] = await textos(id)
    expect(enviado.texto).toContain("Instruções e referências da gravação Clínica Botão")
    expect(enviado.texto).toContain("• Guia de captação")
    expect(enviado.texto).toContain("/convite/tok-")
  })

  it("no dia da gravação, a rotina manda a colinha preenchida", async () => {
    const id = await gravacao("captacao_agendada")
    await db.demanda.update({ where: { id }, data: { clienteFinalNome: "Clínica Hoje", dataCaptacao: new Date(`${hojeEmSaoPaulo()}T23:30:00-03:00`) } })
    await executarRotina(org, "gravacoes")
    const enviados = await textos(id)
    expect(enviados).toEqual([expect.objectContaining({ origem: "regra", texto: expect.stringContaining("🎬 Hoje: Clínica Hoje, 23:30.") })])
  })
})

describe("cancelar a gravação", () => {
  const tel = () => `5541${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const textos = async (demandaId: string) => (await db.saidaWhatsapp.findMany({ where: { organizacaoId: org, referencia: demandaId }, select: { conteudoCifrado: true } }))
    .map((x) => decryptSecret(x.conteudoCifrado!))
  const pedir = (id: string, corpo: unknown) => cancelar(
    new NextRequest(`http://localhost/api/jobs/${id}/cancelar`, { method: "POST", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ id }) },
  )
  beforeAll(async () => {
    await db.videomaker.update({ where: { id: vm }, data: { telefone: tel() } })
  })

  it("sem videomaker: encerra com o motivo, ninguém para pagar", async () => {
    const id = await gravacao("captacao_agendada")
    await db.demanda.update({ where: { id }, data: { statusInterno: "aguardando_triagem", statusVisivel: "entrada", videomakerId: null } })
    como(pessoas.admin, "admin")
    expect((await pedir(id, { motivo: "" })).status).toBe(400)
    const r = await pedir(id, { motivo: "Chuva" })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ mensagem: "Gravação cancelada." })
    expect(await db.demanda.findUniqueOrThrow({ where: { id } })).toMatchObject({ statusInterno: "encerrado", statusVisivel: "finalizado" })
    const h = await db.historicoStatus.findFirstOrThrow({ where: { demandaId: id, statusNovo: "encerrado" } })
    expect(h.observacao).toBe("Gravação cancelada: Chuva")
    expect(await db.notaFiscalUpload.count({ where: { demandaId: id } })).toBe(0)
    // Continua no quadro, em Concluído (não some como recusa).
    expect(await noQuadro(id)).toMatchObject({ statusInterno: "encerrado" })
  })

  it("convite sem resposta: o convite deixa de valer e o convidado é avisado", async () => {
    const id = await gravacao("captacao_agendada")
    await db.demanda.update({ where: { id }, data: { statusInterno: "videomaker_notificado", statusVisivel: "producao" } })
    await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vm, token: `tok-${randomUUID()}`, status: "pendente", expiresAt: new Date(Date.now() + 86400_000) } })
    como(pessoas.admin, "admin")
    expect(await (await pedir(id, { motivo: "A doutora não pôde" })).json()).toEqual({ mensagem: "Gravação cancelada. O videomaker foi avisado." })
    expect((await db.conviteVideomaker.findFirstOrThrow({ where: { demandaId: id } })).status).toBe("expirado")
    expect((await textos(id)).some((t) => t.includes("Gravação cancelada") && t.includes("Pode liberar a sua agenda"))).toBe(true)
  })

  it("videomaker confirmado: tem de dizer se ele cobra; não cobra, só o aviso", async () => {
    const id = await gravacao("captacao_agendada")
    como(pessoas.admin, "admin")
    expect((await pedir(id, { motivo: "Chuva" })).status).toBe(400)
    expect((await pedir(id, { motivo: "Chuva", cobra: false })).status).toBe(200)
    expect(await db.notaFiscalUpload.count({ where: { demandaId: id } })).toBe(0)
    expect((await db.historicoStatus.findFirstOrThrow({ where: { demandaId: id, statusNovo: "encerrado" } })).observacao).toBe("Gravação cancelada: Chuva · o videomaker não cobra")
  })

  it("videomaker confirmado que cobra: a nota é pedida e ele recebe o link no WhatsApp", async () => {
    const id = await gravacao("captacao_agendada")
    como(pessoas.admin, "admin")
    expect(await (await pedir(id, { motivo: "Chuva", cobra: true })).json()).toEqual({ mensagem: "Gravação cancelada. O videomaker recebeu o link para mandar a nota." })
    const nf = await db.notaFiscalUpload.findFirstOrThrow({ where: { demandaId: id, videomakerId: vm } })
    expect(nf.status).toBe("pendente")
    expect((await textos(id)).some((t) => t.includes("taxa de cancelamento") && t.includes(`/nf-upload/${nf.token}`))).toBe(true)
    // No quadro, a cobrança vira "Falta a nota" para quem vê nota.
    como(pessoas.financeiro, "solicitante")
    expect(situacaoDaNota((await noQuadro(id))!)).toMatchObject({ etapa: "falta" })
  })

  it("convite sem resposta para quem não está escalado: o convidado também é avisado", async () => {
    const id = await gravacao("captacao_agendada")
    // O convite não escala ninguém (lib/convites.ts): a gravação segue sem videomaker.
    await db.demanda.update({ where: { id }, data: { statusInterno: "aguardando_triagem", statusVisivel: "entrada", videomakerId: null } })
    await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vm, token: `tok-${randomUUID()}`, status: "pendente", expiresAt: new Date(Date.now() + 86400_000) } })
    como(pessoas.admin, "admin")
    expect(await (await pedir(id, { motivo: "Cliente desistiu" })).json()).toEqual({ mensagem: "Gravação cancelada. O videomaker foi avisado." })
    expect((await db.conviteVideomaker.findFirstOrThrow({ where: { demandaId: id } })).status).toBe("expirado")
    expect((await textos(id)).some((t) => t.includes("Gravação cancelada") && t.includes("Pode liberar a sua agenda"))).toBe(true)
  })

  it("com o vídeo já pronto: no quadro aparece cancelada, não \"Enviado ao cliente\"", async () => {
    const id = await gravacao("captacao_agendada")
    await db.demanda.update({ where: { id }, data: { statusInterno: "aprovado", statusVisivel: "para_postar", linkFinal: "https://drive.example/pronto" } })
    como(pessoas.admin, "admin")
    expect((await pedir(id, { motivo: "O cliente não quis o vídeo" })).status).toBe(200)
    const card = await noQuadro(id) as unknown as Parameters<typeof foiCancelada>[0]
    expect(card.historicos?.some((h) => h.observacao?.startsWith("Gravação cancelada"))).toBe(true)
    expect(foiCancelada(card)).toBe(true)
  })

  it("concluída não se cancela; quem não opera não cancela", async () => {
    const id = await gravacao("captacao_agendada")
    await db.demanda.update({ where: { id }, data: { statusInterno: "entregue_cliente", statusVisivel: "finalizado", linkFinal: "https://drive.example/v" } })
    como(pessoas.admin, "admin")
    expect((await pedir(id, { motivo: "Chuva", cobra: false })).status).toBe(409)
    const outra = await gravacao("captacao_agendada")
    como(pessoas.equipe, "solicitante")
    expect((await pedir(outra, { motivo: "Chuva", cobra: false })).status).toBe(403)
  })
})

describe("o videomaker logado no quadro de Gravações Externas", () => {
  const login = `${p}-vm-login`, dele = `${p}-vm-dele`
  beforeAll(async () => {
    await db.usuario.create({ data: { id: login, nome: "Gabriel", email: `${login}@exemplo.test`, tipo: "videomaker", senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: login, organizacaoId: org, areas: ["audiovisual"], papel: "videomaker" } })
    // O preset do videomaker não tem `verTodasDemandas` (#118): a rota devolve só as dele.
    await db.permissaoUsuario.create({ data: { usuarioId: login, organizacaoId: org, ...PRESETS.videomaker } })
    await db.videomaker.create({ data: { id: dele, nome: "Gabriel", usuarioId: login } })
    await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: dele, tipoContrato: "externo" } })
  })

  it("vê só as gravações em que ele é o videomaker", async () => {
    const minha = await gravacao("captacao_agendada")
    await db.demanda.update({ where: { id: minha }, data: { videomakerId: dele } })
    const deOutro = await gravacao("captacao_agendada")
    como(login, "videomaker")
    const ids = (await (await GET(new NextRequest("http://localhost/api/demandas?area=audiovisual&quadro=jobs"))).json() as { demandas: { id: string }[] }).demandas.map((d) => d.id)
    expect(ids).toContain(minha)
    expect(ids).not.toContain(deOutro)
  })
})
