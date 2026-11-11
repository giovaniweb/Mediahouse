import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// O videomaker entregou material ou mandou a nota: a operação recebe e-mail,
// sino (no material) e WhatsApp com os links (Giovani, 11/11/2026). Rotas
// reais, banco real; a sessão, o armazenamento e o envio do e-mail são
// simulados, e as tarefas de segundo plano ficam guardadas para o teste rodar
// — é assim que se prova que elas rodam DEPOIS da entrega gravada.
const { estado, tarefas, emails } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
  tarefas: [] as { rotulo: string; tarefa: () => Promise<unknown> }[],
  emails: { resultado: { ok: true } as { ok: boolean; error?: string }, chamadas: [] as { para: string[]; assunto: string; html: string }[] },
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
      emails.chamadas.push({ para, assunto, html: real.templateAvisoDaOperacao(dados) })
      return emails.resultado
    },
  }
})

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { POST as entregar } from "@/app/api/convites/[token]/entrega/route"
import { PATCH as mover } from "@/app/api/demandas/[id]/status/route"
import { PUT as salvarFicha } from "@/app/api/demandas/[id]/route"
import { POST as uploadNF } from "@/app/api/nf-upload/[token]/route"
import { decryptSecret } from "@/lib/secret-crypto"

const p = `aventrega-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const tel = () => `5541${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const gente = {
  debora: { id: `${p}-debora`, papel: "solicitante", opera: true, email: `debora@${p}.test` },
  admin: { id: `${p}-admin`, papel: "admin", opera: false, email: `admin@${p}.test` },
  solicitante: { id: `${p}-solic`, papel: "solicitante", opera: false, email: `solic@${p}.test` },
  vmLogin: { id: `${p}-vmlogin`, papel: "videomaker", opera: false, email: `vm@${p}.test` },
}
const vm = `${p}-vm`

async function rodarSegundoPlano() {
  const fila = tarefas.splice(0)
  for (const t of fila) await t.tarefa()
  return fila.map((t) => t.rotulo)
}

async function gravacao(edicaoPor: "equipe" | "videomaker" = "equipe") {
  const id = `${p}-${randomUUID().slice(0, 6)}`
  await db.demanda.create({ data: {
    id, organizacaoId: org, codigo: `VOP-${id.slice(-6)}`, titulo: "Gravação na clínica", descricao: "Teste.",
    area: "audiovisual", departamento: "eventos", tipoVideo: "cobertura_evento", cidade: "Curitiba", clienteFinalNome: "Clínica Cristal",
    solicitanteId: gente.solicitante.id, videomakerId: vm, statusInterno: "captacao_agendada", statusVisivel: "producao", edicaoPor,
  } })
  const token = `tok-${randomUUID()}`
  await db.conviteVideomaker.create({ data: { demandaId: id, videomakerId: vm, token, status: "aceito", expiresAt: new Date(Date.now() + 86400_000) } })
  return { id, token }
}
const mandar = (token: string, corpo: unknown) => entregar(
  new NextRequest(`http://localhost/api/convites/${token}/entrega`, { method: "POST", body: JSON.stringify(corpo) }),
  { params: Promise.resolve({ token }) },
)
const sinos = (demandaId: string) => db.alertaIA.findMany({ where: { organizacaoId: org, demandaId, tipoAlerta: "material_recebido" }, select: { usuarioId: true, mensagem: true } })
const whatsapps = async (demandaId: string) => (await db.saidaWhatsapp.findMany({ where: { organizacaoId: org, referencia: demandaId }, select: { destinatarioId: true, conteudoCifrado: true } }))
  .map((s) => ({ para: s.destinatarioId, texto: decryptSecret(s.conteudoCifrado!) }))

beforeAll(async () => {
  vi.stubEnv("NEXTAUTH_URL", "https://nuflow.space")
  vi.stubEnv("EMAIL_ENCRYPTION_KEY", "chave-sintetica-avisos-entrega")
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const g of Object.values(gente)) {
    await db.usuario.create({ data: { id: g.id, nome: g.id, email: g.email, tipo: g.papel as "admin", telefone: tel(), senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: g.id, organizacaoId: org, papel: g.papel as "admin", operaGravacoes: g.opera, areas: ["audiovisual"] } })
  }
  await db.videomaker.create({ data: { id: vm, nome: "João Martins", telefone: tel(), usuarioId: gente.vmLogin.id } })
  await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: vm, tipoContrato: "externo" } })
})

beforeEach(() => { tarefas.length = 0; emails.chamadas.length = 0; emails.resultado = { ok: true } })

afterAll(async () => {
  const ids = (await db.demanda.findMany({ where: { organizacaoId: org }, select: { id: true } })).map((d) => d.id)
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.conviteVideomaker.deleteMany({ where: { demandaId: { in: ids } } })
  await db.notaFiscalUpload.deleteMany({ where: { demandaId: { in: ids } } })
  await db.custoVideomaker.deleteMany({ where: { organizacaoId: org } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: org } }).catch(() => undefined)
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.videomakerOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: vm } })
  await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } }).catch(() => undefined)
  await db.usuario.deleteMany({ where: { id: { in: Object.values(gente).map((g) => g.id) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("material pelo link do convite", () => {
  it("a operação recebe e-mail, sino e WhatsApp com os links; ninguém mais recebe", async () => {
    const { id, token } = await gravacao("equipe")
    const r = await mandar(token, { linkBrutos: "https://drive.example/brutos" })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ completo: true, mudouEtapa: true })

    // Nada sai antes do commit da entrega: tudo fica para o segundo plano.
    expect(await whatsapps(id)).toEqual([])
    expect(await sinos(id)).toEqual([])
    expect(emails.chamadas).toEqual([])

    expect(await rodarSegundoPlano()).toEqual(["aviso-gravacao", "aviso-entrega-videomaker"])
    const zap = await whatsapps(id)
    expect(zap.map((z) => z.para)).toEqual([gente.debora.id])
    expect(zap[0].texto).toContain("Brutos:\nhttps://drive.example/brutos")
    expect(zap[0].texto).toContain(`No NuFlow:\nhttps://nuflow.space/jobs/${id}`)
    expect((await sinos(id)).map((s) => s.usuarioId)).toEqual([gente.debora.id])
    expect(emails.chamadas).toHaveLength(1)
    expect(emails.chamadas[0].para).toEqual([gente.debora.email])
    expect(emails.chamadas[0].assunto).toContain("Material recebido")
    expect(emails.chamadas[0].html).toContain('href="https://drive.example/brutos"')
    expect(emails.chamadas[0].html).toContain(`href="https://nuflow.space/jobs/${id}"`)
  })

  it("edição dele: os brutos e depois o vídeo avisam as duas vezes; o reenvio recusado não avisa", async () => {
    const { id, token } = await gravacao("videomaker")
    expect((await mandar(token, { linkBrutos: "https://drive.example/b" })).status).toBe(200)
    await rodarSegundoPlano()
    expect((await sinos(id))[0].mensagem).toContain("Falta o vídeo pronto")
    expect((await whatsapps(id))[0].texto).toContain("Falta o vídeo pronto")

    expect((await mandar(token, { linkVideo: "https://drive.example/pronto" })).status).toBe(200)
    await rodarSegundoPlano()
    expect(await sinos(id)).toHaveLength(2)
    expect(emails.chamadas).toHaveLength(2)
    const zap = await whatsapps(id)
    expect(zap).toHaveLength(2)
    expect(zap.some((z) => z.texto.includes("Vídeo pronto:\nhttps://drive.example/pronto"))).toBe(true)

    // Já recebido: 409, e nada sai de novo.
    expect((await mandar(token, { linkVideo: "https://drive.example/outro" })).status).toBe(409)
    expect(tarefas).toEqual([])
    expect(await whatsapps(id)).toHaveLength(2)
  })

  it("e-mail que falha não desfaz a entrega", async () => {
    emails.resultado = { ok: false, error: "Resend fora do ar" }
    const { id, token } = await gravacao("equipe")
    expect((await mandar(token, { linkBrutos: "https://drive.example/b" })).status).toBe(200)
    await rodarSegundoPlano()
    expect(await db.demanda.findUniqueOrThrow({ where: { id } })).toMatchObject({ statusInterno: "brutos_enviados", linkBrutos: "https://drive.example/b" })
    expect(await sinos(id)).toHaveLength(1)
  })

  it("sem ninguém marcado em \"Opera Gravações Externas\", a gestão recebe", async () => {
    await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: gente.debora.id, organizacaoId: org } }, data: { operaGravacoes: false } })
    try {
      const { id, token } = await gravacao("equipe")
      await mandar(token, { linkBrutos: "https://drive.example/b" })
      await rodarSegundoPlano()
      expect((await sinos(id)).map((s) => s.usuarioId)).toEqual([gente.admin.id])
      expect(emails.chamadas[0].para).toEqual([gente.admin.email])
    } finally {
      await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: gente.debora.id, organizacaoId: org } }, data: { operaGravacoes: true } })
    }
  })
})

describe("material marcado no card", () => {
  const moverPara = (id: string, corpo: object) => mover(
    new NextRequest(`http://localhost/api/demandas/${id}/status`, { method: "PATCH", body: JSON.stringify({ origem: "kanban", ...corpo }) }),
    { params: Promise.resolve({ id }) },
  )

  it("o videomaker logado entrega: e-mail e sino para a operação", async () => {
    const { id } = await gravacao("equipe")
    estado.sessao = { user: { id: gente.vmLogin.id, organizacaoId: org, tipo: "videomaker", papel: "videomaker", name: "João" } }
    const r = await moverPara(id, { statusInterno: "brutos_enviados", linkBrutos: "https://drive.example/logado" })
    expect(r.status).toBe(200)
    expect(await rodarSegundoPlano()).toContain("aviso-entrega-videomaker")
    expect((await sinos(id)).map((s) => s.usuarioId)).toEqual([gente.debora.id])
    expect(emails.chamadas.map((e) => e.para)).toEqual([[gente.debora.email]])
  })

  it("a própria operação move o card: sem e-mail nem sino para ela", async () => {
    const { id } = await gravacao("equipe")
    await db.demanda.update({ where: { id }, data: { linkBrutos: "https://drive.example/b" } })
    estado.sessao = { user: { id: gente.admin.id, organizacaoId: org, tipo: "admin", papel: "admin", name: "Gestão" } }
    expect((await moverPara(id, { statusInterno: "brutos_enviados" })).status).toBe(200)
    expect(await rodarSegundoPlano()).not.toContain("aviso-entrega-videomaker")
    expect(await sinos(id)).toEqual([])
    expect(emails.chamadas).toEqual([])
  })
})

describe("links salvos na ficha, sem mudar a etapa", () => {
  const salvar = (id: string, corpo: object) => salvarFicha(
    new NextRequest(`http://localhost/api/demandas/${id}`, { method: "PUT", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ id }) },
  )

  it("o videomaker salva os brutos e depois o vídeo pronto: a operação é avisada nas duas; o mesmo link de novo, não", async () => {
    const { id } = await gravacao("videomaker")
    await db.demanda.update({ where: { id }, data: { tipoGravacao: "entrega_equipamento" } })
    estado.sessao = { user: { id: gente.vmLogin.id, organizacaoId: org, tipo: "videomaker", papel: "videomaker", name: "João" } }

    expect((await salvar(id, { linkBrutos: "https://drive.example/ficha-b" })).status).toBe(200)
    expect(await rodarSegundoPlano()).toContain("aviso-entrega-videomaker")
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).statusInterno).toBe("captacao_agendada")
    expect((await sinos(id)).map((s) => s.usuarioId)).toEqual([gente.debora.id])
    expect((await sinos(id))[0].mensagem).toContain("Falta o vídeo pronto")
    let zap = await whatsapps(id)
    expect(zap.map((z) => z.para)).toEqual([gente.debora.id])
    expect(zap[0].texto).toContain("Brutos:\nhttps://drive.example/ficha-b")
    expect(emails.chamadas.map((e) => e.para)).toEqual([[gente.debora.email]])

    expect((await salvar(id, { linkFinal: "https://drive.example/ficha-pronto" })).status).toBe(200)
    await rodarSegundoPlano()
    zap = await whatsapps(id)
    expect(zap).toHaveLength(2)
    expect(zap.some((z) => z.texto.includes("Vídeo pronto:\nhttps://drive.example/ficha-pronto"))).toBe(true)
    expect(emails.chamadas[1].html).toContain("Material completo")
    expect(await sinos(id)).toHaveLength(2)

    // Regravar o mesmo link não é entrega nova.
    expect((await salvar(id, { linkFinal: "https://drive.example/ficha-pronto" })).status).toBe(200)
    expect(await rodarSegundoPlano()).not.toContain("aviso-entrega-videomaker")
    expect(await sinos(id)).toHaveLength(2)
  })

  it("a equipe salva o link na ficha: ninguém é avisado", async () => {
    const { id } = await gravacao("equipe")
    await db.demanda.update({ where: { id }, data: { tipoGravacao: "entrega_equipamento" } })
    estado.sessao = { user: { id: gente.admin.id, organizacaoId: org, tipo: "admin", papel: "admin", name: "Gestão" } }
    expect((await salvar(id, { linkBrutos: "https://drive.example/equipe" })).status).toBe(200)
    expect(await rodarSegundoPlano()).not.toContain("aviso-entrega-videomaker")
    expect(await sinos(id)).toEqual([])
    expect(await whatsapps(id)).toEqual([])
    expect(emails.chamadas).toEqual([])
  })
})

describe("nota fiscal pelo link", () => {
  it("a operação recebe o e-mail com o link protegido da nota; o sino é o de sempre, um só", async () => {
    const { id } = await gravacao("equipe")
    await db.demanda.update({ where: { id }, data: { linkBrutos: "https://drive.example/b", statusInterno: "brutos_enviados" } })
    const nf = await db.notaFiscalUpload.create({ data: { demandaId: id, videomakerId: vm } })
    const form = new FormData()
    form.set("arquivo", new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], "nota.pdf", { type: "application/pdf" }))
    const r = await uploadNF(new NextRequest("http://localhost/api/nf-upload/x", { method: "POST", body: form }), { params: Promise.resolve({ token: nf.token }) })
    expect(r.status).toBe(200)

    expect(await rodarSegundoPlano()).toEqual(["aviso-gravacao", "aviso-nota-videomaker"])
    const url = (await db.notaFiscalUpload.findUniqueOrThrow({ where: { id: nf.id } })).url!
    const link = `https://nuflow.space${url}?token=${encodeURIComponent(nf.token)}`
    expect(url.startsWith(`/api/midia/org/${org}/nf/`)).toBe(true)

    expect(emails.chamadas).toHaveLength(1)
    expect(emails.chamadas[0].para).toEqual([gente.debora.email])
    expect(emails.chamadas[0].html).toContain(`href="${link.replace(/&/g, "&amp;")}"`)
    expect(emails.chamadas[0].html).not.toContain("supabase")

    const zap = await whatsapps(id)
    expect(zap.map((z) => z.para)).toEqual([gente.debora.id])
    expect(zap[0].texto).toContain(`Nota fiscal:\n${link}`)

    const alertas = await db.alertaIA.findMany({ where: { organizacaoId: org, demandaId: id }, select: { tipoAlerta: true } })
    expect(alertas.map((a) => a.tipoAlerta)).toEqual(["nf_recebida"])
  })
})
