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
import { familiaDaSaida } from "@/lib/avisos-arte"
import { avisarGravacao } from "@/lib/avisos-gravacao"
import { PATCH as mover } from "@/app/api/demandas/[id]/status/route"
import { registrarServicoPendente } from "@/lib/custo-servico"
import { GET as lerAlertas } from "@/app/api/alertas/route"
import { POST as baixa } from "@/app/api/notas-fiscais/baixa/route"

const p = `notasfisc-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const tel = () => `5541${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const PIX = "529.982.247-25"
const DEBORA = `debora@${p}.test`
// operadora: opera as gravações, sem financeiro. financeira: opera e vê custos.
// avisada: só "recebe todos os avisos" (gestão), sem financeiro nem operação.
const gente = {
  operadora: { id: `${p}-op`, papel: "solicitante", opera: true, verCustos: false, todos: false },
  financeira: { id: `${p}-fin`, papel: "solicitante", opera: true, verCustos: true, todos: false },
  admin: { id: `${p}-admin`, papel: "admin", opera: false, verCustos: true, todos: false },
  avisada: { id: `${p}-av`, papel: "solicitante", opera: false, verCustos: false, todos: true },
}
const vm = `${p}-vm`
// O interno: contrato "interno" no vínculo com a empresa, "externo" no cadastro
// global — exatamente o caso do Giovani em produção (12/11/2026).
const vmInterno = `${p}-vmint`
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

// O que saiu para o videomaker: motivo da chave, texto e a arte que a fila vai usar.
const doVideomaker = async (demandaId: string) => (await db.saidaWhatsapp.findMany({
  where: { organizacaoId: org, referencia: demandaId, destinatarioTipo: "videomaker" },
  select: { chave: true, destinatarioTipo: true, origem: true, conteudoCifrado: true }, orderBy: { createdAt: "asc" },
})).map((x) => ({ motivo: x.chave.split(":")[2], arte: familiaDaSaida(x), texto: decryptSecret(x.conteudoCifrado!) }))

beforeAll(async () => {
  vi.stubEnv("NEXTAUTH_URL", "https://nuflow.space")
  vi.stubEnv("EMAIL_ENCRYPTION_KEY", "chave-sintetica-notas-fiscais")
  vi.stubEnv("CHAVE_CIFRA_DADOS", "chave-sintetica-notas-fiscais-dados-0123456789")
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const g of Object.values(gente)) {
    await db.usuario.create({ data: { id: g.id, nome: `Pessoa ${g.id.slice(-3)}`, email: email(g.id), tipo: g.papel as "admin", telefone: tel(), senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: g.id, organizacaoId: org, papel: g.papel as "admin", operaGravacoes: g.opera, recebeTodosAvisos: g.todos, areas: ["audiovisual"] } })
    if (g.papel !== "admin") await db.permissaoUsuario.create({ data: { usuarioId: g.id, organizacaoId: org, ...PRESETS[g.papel], verCustos: g.verCustos } })
  }
  await db.videomaker.create({ data: { id: vm, nome: "João Martins", telefone: tel() } })
  await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: vm, tipoContrato: "externo", valorDiaria: 600 } })
  await db.videomakerDadosFiscais.create({ data: { organizacaoId: org, videomakerId: vm, cpfCnpj: "529.982.247-25", chavePix: encryptSecret(PIX) } })
  await db.videomaker.create({ data: { id: vmInterno, nome: "Giovani Interno", telefone: tel(), tipoContrato: "externo" } })
  await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: vmInterno, tipoContrato: "interno" } })
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
  await db.videomaker.deleteMany({ where: { id: { in: [vm, vmInterno] } } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } }).catch(() => undefined)
  await db.usuario.deleteMany({ where: { id: { in: Object.values(gente).map((g) => g.id) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("aviso da nota com os dados de pagamento", () => {
  it("a operação e o financeiro recebem o PIX inteiro no e-mail e no WhatsApp; o sino só o final; nada em log", async () => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")]
    const { id } = await notaEnviada()
    expect(await rodarSegundoPlano()).toEqual(["aviso-gravacao", "aviso-nota-videomaker"])

    // E-mail: um só, o completo — Débora (e-mail das notas) e as duas da operação.
    expect(emails.chamadas).toHaveLength(1)
    const [completo] = emails.chamadas
    expect(completo.para).toEqual([DEBORA, email(gente.financeira.id), email(gente.operadora.id)].sort())
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

    // Sino direcionado: um por pessoa da operação, SEM valor nem PIX (o texto
    // fica em alertas_ia, que a central de alertas mostra a outros; revisão do #145).
    const sinos = await db.alertaIA.findMany({ where: { organizacaoId: org, demandaId: id, tipoAlerta: "nf_recebida" }, select: { usuarioId: true, mensagem: true, acaoSugerida: true } })
    expect(sinos.map((x) => x.usuarioId).sort()).toEqual([gente.financeira.id, gente.operadora.id].sort())
    for (const x of sinos) {
      expect(x.mensagem).toBe("🧾 João mandou a nota de Dra. Ana Lima (VOP-" + id.slice(-6) + ").")
      expect(`${x.mensagem} ${x.acaoSugerida}`).not.toMatch(/4725|R\$|529\.982/)
      expect(x.acaoSugerida).toContain("/notas-fiscais")
    }
    expect(await db.alertaIA.count({ where: { organizacaoId: org, demandaId: id, usuarioId: null } })).toBe(0)

    // WhatsApp: a operação (as duas) com o PIX inteiro e o valor (decisão de 12/11/2026).
    const zap = await whatsapps(id)
    expect(zap.map((z) => z.para).sort()).toEqual([gente.financeira.id, gente.operadora.id, vm].sort())
    for (const quem of [gente.financeira.id, gente.operadora.id]) {
      const t = zap.find((z) => z.para === quem)!.texto
      expect(t).toContain("💰 Pagamento\nValor: R$ 600,00 (diária combinada, a confirmar)\nPIX (CPF): 529.982.247-25")
      expect(t).toContain("https://nuflow.space/notas-fiscais")
    }
    // O videomaker recebe a confirmação, com a arte do galo conferindo — sem valor nem PIX.
    const vmZap = await doVideomaker(id)
    expect(vmZap.map((z) => [z.motivo, z.arte])).toEqual([["nota_recebida", "nota_recebida"]])
    expect(vmZap[0].texto).toContain("✅ Recebemos a sua nota fiscal: gravação Dra. Ana Lima")
    expect(vmZap[0].texto).not.toContain("R$")
    expect(vmZap[0].texto).not.toContain(PIX)

    // Nada de PIX em log.
    const escrito = logs.flatMap((l) => l.mock.calls).map((c) => JSON.stringify(c)).join("\n")
    expect(escrito).not.toContain(PIX)
    expect(escrito).not.toContain("52998224725")
    logs.forEach((l) => l.mockRestore())
  })

  it("sem ninguém na operação, a gestão faz o papel: quem não é do financeiro nem da operação não recebe PIX nem valor", async () => {
    await db.usuarioOrganizacao.updateMany({ where: { organizacaoId: org }, data: { operaGravacoes: false } })
    try {
      const { id } = await notaEnviada()
      await rodarSegundoPlano()
      // Gestão aqui: o admin (vê o financeiro) e a avisada (recebe todos, sem financeiro).
      const completo = emails.chamadas.find((c) => c.para.includes(DEBORA))!
      const simples = emails.chamadas.find((c) => c.para.includes(email(gente.avisada.id)))!
      expect(completo.para).toEqual([DEBORA, email(gente.admin.id)].sort())
      expect(simples.para).toEqual([email(gente.avisada.id)])
      expect(simples.html).not.toContain(PIX)
      expect(simples.html).not.toContain("4725")
      expect(simples.html).not.toContain("R$")

      const sinos = await db.alertaIA.findMany({ where: { organizacaoId: org, demandaId: id, tipoAlerta: "nf_recebida" }, select: { usuarioId: true, mensagem: true } })
      const sinoAvisada = sinos.find((x) => x.usuarioId === gente.avisada.id)!.mensagem
      expect(sinoAvisada).not.toContain("PIX")
      expect(sinoAvisada).not.toContain("R$")
      expect(sinos.find((x) => x.usuarioId === gente.admin.id)!.mensagem).not.toContain("PIX")

      const zap = await whatsapps(id)
      const zapAvisada = zap.find((z) => z.para === gente.avisada.id)!.texto
      expect(zapAvisada).not.toContain("PIX")
      expect(zapAvisada).not.toContain("R$")
      expect(zap.find((z) => z.para === gente.admin.id)!.texto).toContain(`PIX (CPF): ${PIX}`)
    } finally {
      for (const g of Object.values(gente)) {
        await db.usuarioOrganizacao.updateMany({ where: { organizacaoId: org, usuarioId: g.id }, data: { operaGravacoes: g.opera } })
      }
    }
  })
})

describe("confirmação ao videomaker que manda a nota pela área dele", () => {
  it("quem fez a mudança não recebe aviso dela — menos o videomaker, na confirmação da nota", async () => {
    const { id } = await notaEnviada()
    tarefas.length = 0
    await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org, referencia: id } })
    const vmUsuario = `${p}-vmlogin`
    const telefone = (await db.videomaker.findUniqueOrThrow({ where: { id: vm } })).telefone
    await db.usuario.create({ data: { id: vmUsuario, nome: "João Martins", email: email(vmUsuario), tipo: "videomaker", telefone, senhaHash: "sem-login" } })
    try {
      // Como a rota de "Minhas notas" chama: o autor é o próprio videomaker.
      await avisarGravacao(org, id, "nota_recebida", vmUsuario)
      expect((await doVideomaker(id)).map((z) => z.motivo)).toEqual(["nota_recebida"])
      // Em outro evento, o autor continua sem receber o aviso do que fez.
      await avisarGravacao(org, id, "nota_paga", vmUsuario)
      expect((await doVideomaker(id)).map((z) => z.motivo)).toEqual(["nota_recebida"])
    } finally {
      await db.usuario.delete({ where: { id: vmUsuario } })
    }
  })
})

describe("videomaker interno nunca entra na nota (12/11/2026)", () => {
  const moverPara = (id: string, statusInterno: string) => mover(
    new NextRequest(`http://localhost/api/demandas/${id}/status`, { method: "PATCH", body: JSON.stringify({ origem: "kanban", statusInterno, linkBrutos: "https://drive.example/brutos" }) }),
    { params: Promise.resolve({ id }) },
  )
  async function card(videomakerId: string) {
    const id = `${p}-${randomUUID().slice(0, 6)}`
    await db.demanda.create({ data: {
      id, organizacaoId: org, codigo: `VOP-${id.slice(-6)}`, titulo: "Video Juliana", descricao: "Teste.",
      area: "audiovisual", departamento: "eventos", tipoVideo: "cobertura_evento", cidade: "Curitiba",
      solicitanteId: gente.admin.id, videomakerId, statusInterno: "captacao_realizada", statusVisivel: "producao",
    } })
    return id
  }
  const saidasDoVm = async (demandaId: string, videomakerId: string) => (await db.saidaWhatsapp.findMany({
    where: { organizacaoId: org, referencia: demandaId }, select: { chave: true, destinatarioTipo: true, destinatarioId: true, origem: true, conteudoCifrado: true },
  })).filter((x) => x.destinatarioId === videomakerId).map((x) => ({ chave: x.chave, arte: familiaDaSaida(x), texto: decryptSecret(x.conteudoCifrado!) }))

  it("material recebido: o externo recebe o pedido da nota com a arte do material (nunca a do pagamento); o interno, nada", async () => {
    entrar(gente.admin)
    const externo = await card(vm), interno = await card(vmInterno)
    expect((await moverPara(externo, "brutos_enviados")).status).toBe(200)
    expect((await moverPara(interno, "brutos_enviados")).status).toBe(200)
    await rodarSegundoPlano()

    const ext = (await saidasDoVm(externo, vm)).filter((x) => x.texto.includes("Material recebido"))
    expect(ext).toHaveLength(1)
    expect(ext[0].texto).toContain("/nf-upload/")
    expect(ext[0].arte).toBe("material")
    expect(await db.notaFiscalUpload.count({ where: { demandaId: externo } })).toBe(1)

    expect((await saidasDoVm(interno, vmInterno)).filter((x) => /nota|nf-upload/i.test(x.texto))).toEqual([])
    expect(await db.notaFiscalUpload.count({ where: { demandaId: interno } })).toBe(0)
  })

  it("link antigo de nota do interno não abre nem recebe; sem custo 'aguardando nota'; sem aviso de nota; fora da página", async () => {
    const interno = await card(vmInterno)
    await db.demanda.update({ where: { id: interno }, data: { statusInterno: "brutos_enviados", linkBrutos: "https://drive.example/b", tipoGravacao: "conteudo", dataCaptacao: new Date("2026-11-10T13:00:00Z") } })
    const nf = await db.notaFiscalUpload.create({ data: { demandaId: interno, videomakerId: vmInterno } })
    const form = new FormData()
    form.set("arquivo", new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], "nota.pdf", { type: "application/pdf" }))
    const r = await uploadNF(new NextRequest("http://localhost/api/nf-upload/x", { method: "POST", body: form }), { params: Promise.resolve({ token: nf.token }) })
    expect(r.status).toBe(404)
    expect((await db.notaFiscalUpload.findUniqueOrThrow({ where: { id: nf.id } })).status).toBe("pendente")

    // Concluir não cria custo "aguardando nota" para o interno.
    await db.demanda.update({ where: { id: interno }, data: { statusVisivel: "finalizado" } })
    expect(await registrarServicoPendente(db, org, interno, vmInterno)).toBeNull()
    expect(await db.custoVideomaker.count({ where: { demandaId: interno } })).toBe(0)

    // Nenhum aviso de nota ao interno, nem se alguém marcar algo por outro caminho.
    for (const ev of ["nota_recebida", "nota_cadastrada", "nota_paga"] as const) await avisarGravacao(org, interno, ev)
    expect(await saidasDoVm(interno, vmInterno)).toEqual([])

    // A página das notas não mostra o interno, nem no filtro de videomakers.
    entrar(gente.financeira)
    const j = await (await listar(new NextRequest("http://localhost/api/notas-fiscais"))).json() as { linhas: { demandaId: string }[]; videomakers: { id: string }[] }
    expect(j.linhas.map((l) => l.demandaId)).not.toContain(interno)
    expect(j.videomakers.map((v) => v.id)).not.toContain(vmInterno)
  })
})

describe("revisão do #145", () => {
  it("a central de alertas mostra o sino da nota a quem vê todas as demandas sem ver o financeiro: o texto não leva valor nem PIX", async () => {
    // A avisada passa a ver alertas e todas as demandas, sem ver custos.
    await db.permissaoUsuario.update({ where: { usuarioId_organizacaoId: { usuarioId: gente.avisada.id, organizacaoId: org } }, data: { verAlertas: true, verTodasDemandas: true, verCustos: false } })
    try {
      const { id } = await notaEnviada()
      await rodarSegundoPlano()
      entrar(gente.avisada)
      const r = await lerAlertas(new NextRequest("http://localhost/api/alertas?tipo=nf_recebida"))
      expect(r.status).toBe(200)
      const j = await r.json() as { alertas: { usuarioId: string | null; demanda: { id: string } | null; mensagem: string; acaoSugerida: string | null }[] }
      // Ela enxerga os sinos direcionados às pessoas da operação…
      const daNota = j.alertas.filter((x) => x.demanda?.id === id)
      expect(daNota.map((x) => x.usuarioId).sort()).toEqual([gente.financeira.id, gente.operadora.id].sort())
      // …e nada de valor nem de PIX neles.
      expect(JSON.stringify(daNota)).not.toMatch(/4725|R\$|529\.982|52998224725/)
    } finally {
      await db.permissaoUsuario.update({ where: { usuarioId_organizacaoId: { usuarioId: gente.avisada.id, organizacaoId: org } }, data: { verAlertas: false, verTodasDemandas: false } })
    }
  })

  it("gravação externa sem tipoGravacao entra na página e nos totais; a do interno continua fora", async () => {
    const card = async (videomakerId: string) => {
      const id = `${p}-${randomUUID().slice(0, 6)}`
      await db.demanda.create({ data: {
        id, organizacaoId: org, codigo: `VOP-EXT-${id.slice(-6)}`, titulo: "Cobertura antiga", descricao: "Teste.",
        area: "audiovisual", departamento: "eventos", tipoVideo: "cobertura_evento", cidade: "Curitiba",
        solicitanteId: gente.admin.id, videomakerId, statusInterno: "entregue_cliente", statusVisivel: "finalizado",
        dataCaptacao: new Date("2026-09-14T13:00:00Z"),
      } })
      await db.custoVideomaker.create({ data: { organizacaoId: org, demandaId: id, videomakerId, valor: 0, dataReferencia: new Date(), statusPagamento: "pendente_nf" } })
      return id
    }
    const externo = await card(vm), interno = await card(vmInterno)
    entrar(gente.financeira)
    const j = await (await listar(new NextRequest("http://localhost/api/notas-fiscais"))).json() as { linhas: { demandaId: string; estado: string }[]; retrato: Record<string, number> }
    expect(j.linhas.find((l) => l.demandaId === externo)?.estado).toBe("pendente")
    expect(j.linhas.map((l) => l.demandaId)).not.toContain(interno)
    expect(j.retrato.pendente).toBe(j.linhas.filter((l) => l.estado === "pendente").length)
  })
})

describe("baixa nas notas (12/11/2026)", () => {
  const darBaixa = (demandaIds: string[]) => baixa(new NextRequest("http://localhost/api/notas-fiscais/baixa", { method: "POST", body: JSON.stringify({ demandaIds }) }))
  async function antiga(videomakerId: string, custo?: "pendente_nf" | "nf_enviada" | "pago") {
    const id = `${p}-${randomUUID().slice(0, 6)}`
    await db.demanda.create({ data: {
      id, organizacaoId: org, codigo: `VOP-EXT-${id.slice(-6)}`, titulo: "Cobertura do mês", descricao: "Teste.",
      area: "audiovisual", departamento: "eventos", tipoVideo: "cobertura_evento", cidade: "Curitiba",
      solicitanteId: gente.admin.id, videomakerId, statusInterno: "entregue_cliente", statusVisivel: "finalizado",
      dataCaptacao: new Date("2026-09-14T13:00:00Z"),
    } })
    if (custo) await db.custoVideomaker.create({ data: { organizacaoId: org, demandaId: id, videomakerId, valor: 0, dataReferencia: new Date(), statusPagamento: custo, pago: custo === "pago" } })
    return id
  }

  it("as marcadas ficam pagas no nome de quem deu baixa, de qualquer estado, e ninguém é avisado", async () => {
    const comCusto = await antiga(vm, "pendente_nf"), semCusto = await antiga(vm), enviada = await antiga(vm, "nf_enviada"), jaPaga = await antiga(vm, "pago")
    const nf = await db.notaFiscalUpload.create({ data: { demandaId: semCusto, videomakerId: vm } })
    const interno = await antiga(vmInterno, "pendente_nf")
    entrar(gente.financeira)
    const r = await darBaixa([comCusto, semCusto, enviada, jaPaga, interno])
    expect(r.status).toBe(200)
    const j = await r.json() as { baixadas: string[]; jaPagas: string[]; recusadas: { codigo: string }[]; mensagem: string }
    expect(j.baixadas).toHaveLength(3)
    expect(j.jaPagas).toHaveLength(1)
    expect(j.recusadas.map((x) => x.codigo)).toEqual([interno])
    expect(j.mensagem).toContain("Ninguém foi avisado.")

    for (const id of [comCusto, semCusto, enviada]) {
      const c = await db.custoVideomaker.findFirstOrThrow({ where: { organizacaoId: org, demandaId: id, videomakerId: vm } })
      expect(c).toMatchObject({ statusPagamento: "pago", pago: true, pagoPorId: gente.financeira.id })
      expect(c.dataPagamento).not.toBeNull()
      const h = await db.historicoStatus.findMany({ where: { demandaId: id, statusNovo: "nota_videomaker" } })
      expect(h.map((x) => x.observacao)).toEqual(["Baixa na nota: resolvida por fora, sem aviso ao videomaker"])
    }
    // Nenhum aviso: nem WhatsApp, nem e-mail, nem tarefa de segundo plano.
    expect(await db.saidaWhatsapp.count({ where: { organizacaoId: org, referencia: { in: [comCusto, semCusto, enviada] } } })).toBe(0)
    expect(emails.chamadas).toEqual([])
    expect(tarefas).toEqual([])

    // A página mostra pagas; o link antigo da nota não aceita mais arquivo.
    const pg = await (await listar(new NextRequest(`http://localhost/api/notas-fiscais?videomakerId=${vm}`))).json() as { linhas: { demandaId: string; estado: string; paga: { por: string } | null }[] }
    for (const id of [comCusto, semCusto, enviada]) {
      const l = pg.linhas.find((x) => x.demandaId === id)!
      expect(l.estado).toBe("paga")
      expect(l.paga?.por).toBe(`Pessoa ${gente.financeira.id.slice(-3)}`)
    }
    const form = new FormData()
    form.set("arquivo", new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], "nota.pdf", { type: "application/pdf" }))
    const up = await uploadNF(new NextRequest("http://localhost/api/nf-upload/x", { method: "POST", body: form }), { params: Promise.resolve({ token: nf.token }) })
    expect(up.status).not.toBe(200)

    // Dar baixa de novo não muda quem deu.
    entrar(gente.admin)
    const de_novo = await (await darBaixa([comCusto])).json() as { jaPagas: string[] }
    expect(de_novo.jaPagas).toHaveLength(1)
    expect((await db.custoVideomaker.findFirstOrThrow({ where: { demandaId: comCusto } })).pagoPorId).toBe(gente.financeira.id)
  })

  it("quem não é da gestão nem do financeiro não dá baixa", async () => {
    const id = await antiga(vm, "pendente_nf")
    entrar(gente.avisada)
    expect((await darBaixa([id])).status).toBe(403)
    expect((await db.custoVideomaker.findFirstOrThrow({ where: { demandaId: id } })).statusPagamento).toBe("pendente_nf")
    entrar(gente.financeira)
    expect((await darBaixa([])).status).toBe(400)
  })
})

describe("página Notas fiscais", () => {
  it("quem não é do financeiro não entra (e não vê PIX)", async () => {
    entrar(gente.avisada)
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
    expect((await marcar("marcar_cadastrada")).status).toBe(200)
    j = await ler()
    linha = j.linhas.find((l) => l.demandaId === id)!
    expect(linha.estado).toBe("cadastrada")
    expect(linha.cadastrada?.por).toBe(`Pessoa ${gente.financeira.id.slice(-3)}`)
    // Marcar de novo não muda quem marcou.
    entrar(gente.admin)
    expect((await marcar("marcar_cadastrada")).status).toBe(200)
    expect((await marcar("enviar_compras")).status).toBe(200)
    const custo = await db.custoVideomaker.findFirstOrThrow({ where: { organizacaoId: org, demandaId: id } })
    expect(custo.cadastradoPagamentoPorId).toBe(gente.financeira.id)
    expect(custo.statusPagamento).toBe("aguardando_pagamento")
    // Um aviso de "cadastrada" só, mesmo marcando duas vezes.
    expect(await rodarSegundoPlano()).toEqual(["aviso-gravacao"])

    expect((await marcar("marcar_paga")).status).toBe(200)
    expect(await rodarSegundoPlano()).toEqual(["aviso-gravacao"])
    // O videomaker soube dos três momentos, cada um com a sua arte.
    const vmZap = await doVideomaker(id)
    expect(vmZap.map((z) => [z.motivo, z.arte])).toEqual([
      ["nota_recebida", "nota_recebida"], ["nota_cadastrada", "nota_cadastrada"], ["nota_paga", "nota_paga"],
    ])
    expect(vmZap[1].texto).toContain("🗂️ Sua nota foi cadastrada para pagamento")
    expect(vmZap[2].texto).toContain("💸 Pagamento feito")
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
