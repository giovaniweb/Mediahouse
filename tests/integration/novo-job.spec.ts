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
import { GET as equipeDisponivel } from "@/app/api/equipe-disponivel/route"
import { GET as pessoasDaEmpresa } from "@/app/api/growth/responsaveis/route"
import { foiAprovada } from "@/lib/job-fase"
import { corpoDoNovoJob } from "@/lib/gravacao"
import { hojeEmSaoPaulo, somarDias } from "@/lib/datas"

const p = `novo-job-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const pessoas = { admin: `${p}-admin`, lider: `${p}-lider`, solicitante: `${p}-sol` }
const freela = `${p}-freela`
// Externo e interno desta empresa, um bloqueado aqui e um da rede sem vínculo.
const vms = { externo: `${p}-vm-ext`, interno: `${p}-vm-int`, bloqueado: `${p}-vm-blq`, rede: `${p}-vm-rede` }
const produto = `${p}-produto`

function sessao(id: string, papel: string) {
  estado.sessao = { user: { id, organizacaoId: org, tipo: papel, papel, name: id } }
}

// O corpo antigo (NovaDemandaModal), mantido: o caminho da API é o mesmo.
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
    await db.usuario.create({ data: { id, nome: id, tipo: papel === "admin" ? "admin" : "solicitante", senhaHash: "sem-login", telefone: "5541998765432" } })
    await db.usuarioOrganizacao.create({ data: {
      usuarioId: id, organizacaoId: org, areas: ["audiovisual"],
      papel: papel === "admin" ? "admin" : "solicitante", liderAudiovisual: papel === "lider",
    } })
  }
  // Freelancer logado na empresa: categoria externo.
  await db.usuario.create({ data: { id: freela, nome: freela, tipo: "videomaker", senhaHash: "sem-login" } })
  await db.usuarioOrganizacao.create({ data: { usuarioId: freela, organizacaoId: org, papel: "videomaker", categoria: "externo" } })
  for (const id of Object.values(vms)) await db.videomaker.create({ data: { id, nome: id } })
  await db.videomakerOrganizacao.createMany({ data: [
    { organizacaoId: org, videomakerId: vms.externo, tipoContrato: "externo" },
    { organizacaoId: org, videomakerId: vms.interno, tipoContrato: "interno" },
    { organizacaoId: org, videomakerId: vms.bloqueado, tipoContrato: "externo", emListaNegra: true },
  ] })
  await db.produto.create({ data: { id: produto, organizacaoId: org, nome: "Equipamento Teste" } })
})

beforeEach(() => { agendados.length = 0 })

afterAll(async () => {
  const ids = (await db.demanda.findMany({ where: { organizacaoId: org }, select: { id: true } })).map((d) => d.id)
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.checklistItem.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demandaProduto.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demandaResponsavel.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.produto.deleteMany({ where: { organizacaoId: org } })
  await db.videomakerOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: { in: Object.values(vms) } } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: [...Object.values(pessoas), freela] } } })
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
    // Gravação externa: quem é avisado é a operação (lib/avisos-gravacao.ts), não o líder.
    expect(agendados).toContain("aviso-gravacao")
    expect(agendados).not.toContain("nova-demanda-lideres")
    const h = await db.historicoStatus.findFirstOrThrow({ where: { demandaId: d.id } })
    expect(h.observacao).toBe("Demanda criada e aprovada por quem pediu")
    // Nasce com o link de acompanhamento de quem pediu (o do Compartilhar).
    const link = await db.demanda.findUniqueOrThrow({ where: { id: d.id }, select: { publicToken: true, publicTokenAtivo: true } })
    expect(link.publicToken).toMatch(/^[\w-]{24}$/)
    expect(link.publicTokenAtivo).toBe(true)
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

describe("+ Novo Job pelo formulário de gravação", () => {
  const daqui = (dias: number) => somarDias(hojeEmSaoPaulo(), dias)
  const gravacao = (extra: Partial<Parameters<typeof corpoDoNovoJob>[0]> = {}) => corpoDoNovoJob({
    tipo: "entrega_equipamento", cliente: "Clínica Teste", clienteTelefone: "", endereco: "Rua A, 10, Centro, Curitiba - PR",
    data: daqui(10), hora: "14:00", temBrinde: false, brinde: "", levar: "", observacao: "", videomaker: "", acompanhante: null,
    linkBrutos: "", produtoIds: [], ...extra,
  })

  it("grava cliente, local, datas, quem grava, quem acompanha, brutos e produtos", async () => {
    sessao(pessoas.admin, "admin")
    const d = await criar(gravacao({
      videomaker: `vm:${vms.externo}`,
      acompanhante: { id: pessoas.lider, nome: pessoas.lider, telefone: "5541998765432" },
      referencia: "https://instagram.com/p/1",
      linkBrutos: "https://drive.google.com/brutos",
      produtoIds: [produto],
    }))
    const salvo = await db.demanda.findUniqueOrThrow({
      where: { id: d.id },
      include: { responsaveis: true, produtos: true },
    })
    expect(salvo).toMatchObject({
      area: "audiovisual",
      departamento: "eventos",
      tipoVideo: "cobertura_evento",
      cobertura: true,
      cidade: "Curitiba",
      prioridade: "normal",
      clienteFinalNome: "Clínica Teste",
      localEvento: "Rua A, 10, Centro, Curitiba - PR",
      localGravacao: "Rua A, 10, Centro, Curitiba - PR",
      videomakerId: vms.externo,
      linkBrutos: "https://drive.google.com/brutos",
      referencia: "https://instagram.com/p/1",
      statusInterno: "aguardando_triagem",
    })
    expect(salvo.titulo).toMatch(/^Gravação · Clínica Teste · \d{2}\/\d{2}$/)
    expect(salvo.dataCaptacao?.toISOString()).toBe(new Date(`${daqui(10)}T14:00:00-03:00`).toISOString())
    expect(salvo.dataEvento?.toISOString()).toBe(salvo.dataCaptacao?.toISOString())
    expect(salvo.dataLimite?.toISOString()).toBe(`${daqui(10)}T00:00:00.000Z`)
    expect(salvo.responsaveis.map((r) => r.usuarioId)).toEqual([pessoas.lider])
    expect(salvo.produtos.map((x) => x.produtoId)).toEqual([produto])
    expect(salvo.descricao).toContain("Quem acompanha: " + pessoas.lider + " · WhatsApp (41) 99876-5432")
    // Videomaker externo: o card mora em Jobs.
    expect(await noQuadroDeJobs(d.id)).toBe(true)
  })

  it("sem videomaker entra para escalar depois; gravação em 2 dias é Alta", async () => {
    sessao(pessoas.admin, "admin")
    const d = await criar(gravacao({ data: daqui(2) }))
    const salvo = await db.demanda.findUniqueOrThrow({ where: { id: d.id } })
    expect(salvo).toMatchObject({ videomakerId: null, prioridade: "alta" })
    expect(await noQuadroDeJobs(d.id)).toBe(true)
  })

  it("Quem grava: só os externos desta empresa", async () => {
    sessao(pessoas.admin, "admin")
    const res = await equipeDisponivel(new NextRequest("http://localhost/api/equipe-disponivel?papel=captacao&externos=1"))
    const { opcoes } = await res.json() as { opcoes: { value: string }[] }
    const nossos = opcoes.map((o) => o.value).filter((v) => v.includes(p))
    expect(nossos).toEqual([`vm:${vms.externo}`])
  })

  it("Quem acompanha: WhatsApp só para quem é da casa", async () => {
    sessao(pessoas.admin, "admin")
    let res = await pessoasDaEmpresa(new NextRequest("http://localhost/api/growth/responsaveis?area=todas"))
    let { responsaveis } = await res.json() as { responsaveis: { id: string; telefone?: string }[] }
    expect(responsaveis.find((r) => r.id === pessoas.lider)?.telefone).toBe("5541998765432")

    sessao(freela, "videomaker")
    res = await pessoasDaEmpresa(new NextRequest("http://localhost/api/growth/responsaveis?area=todas"))
    ;({ responsaveis } = await res.json() as { responsaveis: { id: string; telefone?: string }[] })
    expect(responsaveis.find((r) => r.id === pessoas.lider)).toBeDefined()
    expect(responsaveis.every((r) => !("telefone" in r))).toBe(true)
  })
})
