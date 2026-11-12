import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Notas fiscais dos videomakers (Giovani, 12/11/2026):
//   1. o aviso da nota leva os dados de pagamento — inteiros só no e-mail, e só
//      para quem vê o financeiro; sino e WhatsApp com o final da chave;
//   2. o e-mail das notas da empresa (a Débora) recebe a nota com o trabalho e
//      o pagamento;
//   3. a página Notas fiscais: só gestão e financeiro, e as marcas de
//      "cadastrada para pagamento" e "paga" com quem e quando.
// Rotas reais, banco real; sessão, armazenamento e envio de e-mail simulados.
const { estado, tarefas, emails } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
  tarefas: [] as { rotulo: string; tarefa: () => Promise<unknown> }[],
  emails: { chamadas: [] as { para: string[]; assunto: string; html: string }[] },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: (tarefa: () => Promise<unknown>, rotulo: string) => { tarefas.push({ rotulo, tarefa }) } }))
vi.mock("@/lib/midia", async (original) => ({
  ...await original<typeof import("@/lib/midia")>(),
  subirArquivo: async (caminho: string) => `/api/midia/${caminho}`,
}))
vi.mock("@/lib/email", async (original) => {
  const real = await original<typeof import("@/lib/email")>()
  return {
    ...real,
    sendEmailAvisoDaOperacao: async (para: string[], assunto: string, dados: import("@/lib/email").AvisoDaOperacaoEmail) => {
      emails.chamadas.push({ para: [...para].sort(), assunto, html: real.templateAvisoDaOperacao(dados) })
      return { ok: true }
    },
  }
})

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { POST as uploadNF } from "@/app/api/nf-upload/[token]/route"
import { GET as listar } from "@/app/api/notas-fiscais/route"
import { POST as agir } from "@/app/api/jobs/[id]/nota/route"
import { GET as lerConfig, POST as salvarConfig } from "@/app/api/configuracoes/email/route"
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto"
import { PRESETS } from "@/lib/permissoes"

const p = `notasfisc-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const tel = () => `5541${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const PIX = "529.982.247-25"
const DEBORA = `debora@${p}.test`
// operadora: opera as gravações, sem financeiro. financeira: opera e vê custos.
const gente = {
  operadora: { id: `${p}-op`, papel: "solicitante", opera: true, verCustos: false },
  financeira: { id: `${p}-fin`, papel: "solicitante", opera: true, verCustos: true },
  admin: { id: `${p}-admin`, papel: "admin", opera: false, verCustos: true },
}
const vm = `${p}-vm`
const email = (id: string) => `${id}@${p}.test`
const entrar = (g: { id: string; papel: string }) => {
  estado.sessao = { user: { id: g.id, organizacaoId: org, tipo: g.papel, papel: g.papel, name: g.id } }
}

async function rodarSegundoPlano() {
  const fila = tarefas.splice(0)
  for (const t of fila) await t.tarefa()
  return fila.map((t) => t.rotulo)
}

async function notaEnviada() {
  const id = `${p}-${randomUUID().slice(0, 6)}`
  await db.demanda.create({ data: {
    id, organizacaoId: org, codigo: `VOP-${id.slice(-6)}`, titulo: "Gravação na clínica", descricao: "Teste.",
    area: "audiovisual", departamento: "eventos", tipoVideo: "cobertura_evento", cidade: "Curitiba",
    clienteFinalNome: "Dra. Ana Lima", localGravacao: "Clínica Cristal", tipoGravacao: "conteudo",
    dataCaptacao: new Date("2026-11-10T13:00:00Z"),
    solicitanteId: gente.admin.id, videomakerId: vm, statusInterno: "brutos_enviados", statusVisivel: "producao", linkBrutos: "https://drive.example/b",
  } })
  const nf = await db.notaFiscalUpload.create({ data: { demandaId: id, videomakerId: vm } })
  const form = new FormData()
  form.set("arquivo", new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], "nota.pdf", { type: "application/pdf" }))
  const r = await uploadNF(new NextRequest("http://localhost/api/nf-upload/x", { method: "POST", body: form }), { params: Promise.resolve({ token: nf.token }) })
  expect(r.status).toBe(200)
  return { id, nf }
}

const whatsapps = async (demandaId: string) => (await db.saidaWhatsapp.findMany({ where: { organizacaoId: org, referencia: demandaId }, select: { destinatarioId: true, conteudoCifrado: true } }))
  .map((s) => ({ para: s.destinatarioId, texto: decryptSecret(s.conteudoCifrado!) }))

beforeAll(async () => {
  vi.stubEnv("NEXTAUTH_URL", "https://nuflow.space")
  vi.stubEnv("EMAIL_ENCRYPTION_KEY", "chave-sintetica-notas-fiscais")
  vi.stubEnv("CHAVE_CIFRA_DADOS", "chave-sintetica-notas-fiscais-dados-0123456789")
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const g of Object.values(gente)) {
    await db.usuario.create({ data: { id: g.id, nome: `Pessoa ${g.id.slice(-3)}`, email: email(g.id), tipo: g.papel as "admin", telefone: tel(), senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: g.id, organizacaoId: org, papel: g.papel as "admin", operaGravacoes: g.opera, areas: ["audiovisual"] } })
    if (g.papel !== "admin") await db.permissaoUsuario.create({ data: { usuarioId: g.id, organizacaoId: org, ...PRESETS[g.papel], verCustos: g.verCustos } })
  }
  await db.videomaker.create({ data: { id: vm, nome: "João Martins", telefone: tel() } })
  await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: vm, tipoContrato: "externo", valorDiaria: 600 } })
  await db.videomakerDadosFiscais.create({ data: { organizacaoId: org, videomakerId: vm, cpfCnpj: "529.982.247-25", chavePix: encryptSecret(PIX) } })
  await db.configEmail.create({ data: { organizacaoId: org, emailsFinanceiro: [], emailsNotasFiscais: [DEBORA] } })
})

beforeEach(() => { tarefas.length = 0; emails.chamadas.length = 0; estado.sessao = null })

afterAll(async () => {
  const ids = (await db.demanda.findMany({ where: { organizacaoId: org }, select: { id: true } })).map((d) => d.id)
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.notaFiscalUpload.deleteMany({ where: { demandaId: { in: ids } } })
  await db.custoVideomaker.deleteMany({ where: { organizacaoId: org } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: org } }).catch(() => undefined)
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.configEmail.deleteMany({ where: { organizacaoId: org } })
  await db.videomakerDadosFiscais.deleteMany({ where: { organizacaoId: org } })
  await db.videomakerOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: vm } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } }).catch(() => undefined)
  await db.usuario.deleteMany({ where: { id: { in: Object.values(gente).map((g) => g.id) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("aviso da nota com os dados de pagamento", () => {
  it("o PIX inteiro vai só no e-mail de quem vê o financeiro e no e-mail das notas; quem não é do financeiro não recebe PIX nem valor", async () => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")]
    const { id } = await notaEnviada()
    expect(await rodarSegundoPlano()).toEqual(["aviso-gravacao", "aviso-nota-videomaker"])

    // E-mail: dois envios — o completo (financeira + Débora) e o simples (operadora).
    expect(emails.chamadas).toHaveLength(2)
    const completo = emails.chamadas.find((c) => c.para.includes(DEBORA))!
    const simples = emails.chamadas.find((c) => c.para.includes(email(gente.operadora.id)))!
    expect(completo.para).toEqual([DEBORA, email(gente.financeira.id)].sort())
    expect(simples.para).toEqual([email(gente.operadora.id)])
    expect(completo.html).toContain(PIX)
    expect(completo.html).toContain("R$ 600,00 (diária combinada, a confirmar)")
    expect(completo.html).toContain("PIX (CPF)")
    // A descrição do trabalho: tipo, data, local/cidade, médico, código e card.
    expect(completo.html).toContain("Gravação — ")
    expect(completo.html).toContain("Clínica Cristal — Curitiba")
    expect(completo.html).toContain("Dra. Ana Lima")
    expect(completo.html).toContain(`VOP-${id.slice(-6)}`)
    expect(completo.html).toContain(`href="https://nuflow.space/jobs/${id}"`)
    expect(completo.html).toContain("Abrir a nota fiscal")
    expect(simples.html).not.toContain(PIX)
    expect(simples.html).not.toContain("4725")
    expect(simples.html).not.toContain("R$")

    // Sino direcionado: um por pessoa da operação; o resumo só para a financeira.
    const sinos = await db.alertaIA.findMany({ where: { organizacaoId: org, demandaId: id, tipoAlerta: "nf_recebida" }, select: { usuarioId: true, mensagem: true } })
    expect(sinos.map((s) => s.usuarioId).sort()).toEqual([gente.financeira.id, gente.operadora.id].sort())
    const sinoFin = sinos.find((s) => s.usuarioId === gente.financeira.id)!.mensagem
    const sinoOp = sinos.find((s) => s.usuarioId === gente.operadora.id)!.mensagem
    expect(sinoFin).toContain("PIX CPF final 4725")
    expect(sinoFin).toContain("R$ 600,00")
    expect(sinoFin).not.toContain(PIX)
    expect(sinoOp).not.toContain("PIX")
    expect(sinoOp).not.toContain("R$")
    // Nenhum sino para todos (usuarioId nulo) com a nota.
    expect(await db.alertaIA.count({ where: { organizacaoId: org, demandaId: id, usuarioId: null } })).toBe(0)

    // WhatsApp: final da chave e valor só para a financeira; nunca a chave inteira.
    const zap = await whatsapps(id)
    expect(zap.map((z) => z.para).sort()).toEqual([gente.financeira.id, gente.operadora.id].sort())
    const zapFin = zap.find((z) => z.para === gente.financeira.id)!.texto
    const zapOp = zap.find((z) => z.para === gente.operadora.id)!.texto
    expect(zapFin).toContain("PIX CPF final 4725")
    expect(zapFin).toContain("https://nuflow.space/notas-fiscais")
    expect(zapFin).not.toContain(PIX)
    expect(zapOp).not.toContain("PIX")
    expect(zapOp).not.toContain("R$")

    // Nada de PIX em log.
    const escrito = logs.flatMap((l) => l.mock.calls).map((c) => JSON.stringify(c)).join("\n")
    expect(escrito).not.toContain(PIX)
    expect(escrito).not.toContain("52998224725")
    logs.forEach((l) => l.mockRestore())
  })
})

describe("página Notas fiscais", () => {
  it("quem não é do financeiro não entra (e não vê PIX)", async () => {
    entrar(gente.operadora)
    const r = await listar(new NextRequest("http://localhost/api/notas-fiscais"))
    expect(r.status).toBe(403)
    expect(await r.text()).not.toContain(PIX)
  })

  it("lista com o status, filtra por videomaker e período, e marca cadastrada e paga com quem e quando", async () => {
    const { id } = await notaEnviada()
    await rodarSegundoPlano()
    entrar(gente.financeira)
    const ler = async (qs = "") => {
      const r = await listar(new NextRequest(`http://localhost/api/notas-fiscais${qs}`))
      expect(r.status).toBe(200)
      return r.json() as Promise<{ linhas: { demandaId: string; estado: string; pagamento: { chavePix: string; valor: string } | null; cadastrada: { por: string } | null; paga: { por: string; em: string } | null }[]; retrato: Record<string, number>; videomakers: { id: string }[] }>
    }
    let j = await ler()
    let linha = j.linhas.find((l) => l.demandaId === id)!
    expect(linha.estado).toBe("enviada")
    expect(linha.pagamento?.chavePix).toBe(PIX)
    expect(linha.pagamento?.valor).toBe("R$ 600,00 (diária combinada, a confirmar)")
    expect(j.retrato.enviada).toBeGreaterThanOrEqual(1)
    expect(j.videomakers.map((v) => v.id)).toEqual([vm])

    expect((await ler(`?videomakerId=${vm}-outro`)).linhas).toEqual([])
    expect((await ler("?de=2026-11-10&ate=2026-11-10")).linhas.map((l) => l.demandaId)).toContain(id)
    expect((await ler("?de=2026-11-11")).linhas.map((l) => l.demandaId)).not.toContain(id)

    const marcar = (acao: string) => agir(
      new NextRequest(`http://localhost/api/jobs/${id}/nota`, { method: "POST", body: JSON.stringify({ acao }) }),
      { params: Promise.resolve({ id }) },
    )
    // Paga antes de cadastrada: a régua de sempre não deixa pular.
    expect((await marcar("marcar_cadastrada")).status).toBe(200)
    j = await ler()
    linha = j.linhas.find((l) => l.demandaId === id)!
    expect(linha.estado).toBe("cadastrada")
    expect(linha.cadastrada?.por).toBe(`Pessoa ${gente.financeira.id.slice(-3)}`)
    // Marcar de novo não muda quem marcou.
    entrar(gente.admin)
    expect((await marcar("marcar_cadastrada")).status).toBe(200)
    const custo = await db.custoVideomaker.findFirstOrThrow({ where: { organizacaoId: org, demandaId: id } })
    expect(custo.cadastradoPagamentoPorId).toBe(gente.financeira.id)
    expect(custo.statusPagamento).toBe("aguardando_pagamento")

    expect((await marcar("marcar_paga")).status).toBe(200)
    entrar(gente.financeira)
    linha = (await ler()).linhas.find((l) => l.demandaId === id)!
    expect(linha.estado).toBe("paga")
    expect(linha.paga?.por).toBe(`Pessoa ${gente.admin.id.slice(-3)}`)
    expect(linha.paga?.em).toBeTruthy()
  })
})

describe("e-mail das notas em Configurações", () => {
  it("salva e lê o e-mail das notas sem apagar o do financeiro", async () => {
    entrar(gente.admin)
    const post = (corpo: unknown) => salvarConfig(new NextRequest("http://localhost/api/configuracoes/email", { method: "POST", body: JSON.stringify(corpo) }))
    expect((await post({ emailsFinanceiro: ["compras@x.test"] })).status).toBe(200)
    expect((await post({ emailsNotasFiscais: ["Debora.Soares@X.test"] })).status).toBe(200)
    expect((await post({ emailsNotasFiscais: ["nao-e-email"] })).status).toBe(400)
    const j = await (await lerConfig()).json() as { config: { emailsFinanceiro: string[]; emailsNotasFiscais: string[] } }
    expect(j.config.emailsFinanceiro).toEqual(["compras@x.test"])
    expect(j.config.emailsNotasFiscais).toEqual(["debora.soares@x.test"])
  })
})
