import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Videomakers da rede por empresa (módulo "rede", 13/11/2026). Duas empresas,
// pelas rotas de verdade: a COM rede (como a Contourline) vê e escala quem não
// é dela; a SEM rede (como a GH Produção) só os próprios, em toda rota, no
// servidor. Quem já está num card da SEM rede continua aparecendo nele.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId?: string; tipo: string; papel?: string; name?: string } } },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))
vi.mock("@/lib/email", () => ({ sendEmailNotificacao: async () => ({ ok: true }) }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as listaVideomakers } from "@/app/api/videomakers/route"
import { GET as perfil } from "@/app/api/videomakers/[id]/route"
import { GET as desempenho } from "@/app/api/videomakers/[id]/performance/route"
import { POST as avaliar } from "@/app/api/videomakers/[id]/avaliar/route"
import { GET as equipeDisponivel } from "@/app/api/equipe-disponivel/route"
import { GET as usuarios } from "@/app/api/usuarios/route"
import { POST as criarDemanda } from "@/app/api/demandas/route"
import { PUT as editarDemanda, GET as abrirDemanda } from "@/app/api/demandas/[id]/route"
import { POST as equipeCobertura } from "@/app/api/coberturas/[id]/equipe/route"
import { POST as criarEmpresa } from "@/app/api/admin/organizacoes/route"
import { GET as modulosDaEmpresa, PATCH as mudarModulo } from "@/app/api/admin/organizacoes/[id]/modulos/route"
import { empresaVeRede } from "@/lib/videomakers-da-rede"

const p = `rede-${randomUUID().slice(0, 8)}`
const org = { com: `${p}-com`, sem: `${p}-sem`, padrao: `${p}-padrao` }
const admin = { com: `${p}-adm-com`, sem: `${p}-adm-sem` }
const superAdmin = `${p}-super`
// proprio: da empresa SEM rede; global: da rede (vínculo só com a COM);
// noCard: da rede, mas já estava num card da SEM antes da chave existir;
// editaRede: da rede, edita (aparece no slot de edição).
const vm = { proprio: `${p}-vm-proprio`, global: `${p}-vm-global`, noCard: `${p}-vm-nocard`, editaRede: `${p}-vm-edita` }
let cardDaSem = ""
let coberturaDaSem = ""
let empresaNova = ""
let empresaPaga = ""

function como(qual: "com" | "sem") {
  estado.sessao = { user: { id: admin[qual], organizacaoId: org[qual], tipo: "admin", papel: "admin", name: admin[qual] } }
}
const get = (url: string) => new NextRequest(`http://localhost${url}`)
const json = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function idsDaLista(): Promise<string[]> {
  const res = await listaVideomakers(get("/api/videomakers"))
  expect(res.status).toBe(200)
  return ((await res.json()).videomakers as { id: string }[]).map((v) => v.id)
}
async function opcoes(papel: "captacao" | "edicao"): Promise<string[]> {
  const res = await equipeDisponivel(get(`/api/equipe-disponivel?papel=${papel}`))
  expect(res.status).toBe(200)
  return ((await res.json()).opcoes as { value: string }[]).map((o) => o.value)
}
function corpoDoJob(extra: Record<string, unknown> = {}) {
  return {
    titulo: "Gravação na clínica", descricao: "Gravar depoimento da cliente.",
    departamento: "eventos", tipoVideo: "cobertura_evento", cidade: "Curitiba",
    localEvento: "Clínica Teste", cobertura: true, prioridade: "normal",
    dataLimite: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    aprovarAoCriar: true, ...extra,
  }
}

beforeAll(async () => {
  await db.organizacao.createMany({ data: [
    { id: org.com, nome: `${p} com`, slug: org.com },
    { id: org.sem, nome: `${p} sem`, slug: org.sem },
    { id: org.padrao, nome: `${p} padrao`, slug: org.padrao },
  ] })
  await db.moduloOrganizacao.createMany({ data: [
    { organizacaoId: org.com, modulo: "rede", ativo: true },
    { organizacaoId: org.sem, modulo: "rede", ativo: false },
  ] })
  await db.usuario.create({ data: { id: superAdmin, nome: "Super", email: `${p}-super@gh.test`, tipo: "admin", senhaHash: "sem-login", superAdmin: true } })
  for (const q of ["com", "sem"] as const) {
    await db.usuario.create({ data: { id: admin[q], nome: admin[q], tipo: "admin", senhaHash: "sem-login", telefone: "5541998765432" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: admin[q], organizacaoId: org[q], papel: "admin", areas: ["audiovisual"] } })
  }
  await db.videomaker.createMany({ data: [
    { id: vm.proprio, nome: `${p} Próprio`, cidade: "Goiânia" },
    { id: vm.global, nome: `${p} Global`, cidade: "Curitiba" },
    { id: vm.noCard, nome: `${p} No Card`, cidade: "Curitiba" },
    { id: vm.editaRede, nome: `${p} Edita`, cidade: "Curitiba", podeEditar: true },
  ] })
  await db.videomakerOrganizacao.createMany({ data: [
    { organizacaoId: org.sem, videomakerId: vm.proprio },
    { organizacaoId: org.com, videomakerId: vm.global },
  ] })
  // Card antigo da SEM com um videomaker da rede, sem vínculo (de antes da chave).
  const card = await db.demanda.create({ data: {
    organizacaoId: org.sem, codigo: `${p}-1`, titulo: "Card antigo", descricao: "Já tinha um da rede.",
    departamento: "eventos", tipoVideo: "cobertura_evento", videomakerId: vm.noCard, cidade: "Curitiba", solicitanteId: admin.sem,
  } })
  cardDaSem = card.id
  const cobertura = await db.eventoCobertura.create({ data: { organizacaoId: org.sem, titulo: `${p} cobertura`, slug: `${p}-cob`, dataInicio: new Date(), dataFim: new Date(), createdById: admin.sem } })
  coberturaDaSem = cobertura.id
})

beforeEach(() => como("sem"))

afterAll(async () => {
  const orgs = [...Object.values(org), empresaNova, empresaPaga].filter(Boolean)
  const ids = (await db.demanda.findMany({ where: { organizacaoId: { in: orgs } }, select: { id: true } })).map((d) => d.id)
  await db.alertaIA.deleteMany({ where: { organizacaoId: { in: orgs } } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.checklistItem.deleteMany({ where: { demandaId: { in: ids } } })
  await db.demandaResponsavel.deleteMany({ where: { demandaId: { in: ids } } })
  await db.conviteVideomaker.deleteMany({ where: { demandaId: { in: ids } } })
  await db.avaliacaoVideomaker.deleteMany({ where: { videomakerId: { in: Object.values(vm) } } })
  await db.eventoCoberturaEquipe.deleteMany({ where: { coberturaId: coberturaDaSem } })
  await db.eventoCobertura.deleteMany({ where: { organizacaoId: { in: orgs } } })
  await db.demanda.deleteMany({ where: { organizacaoId: { in: orgs } } })
  await db.videomakerOrganizacao.deleteMany({ where: { videomakerId: { in: Object.values(vm) } } })
  await db.editorOrganizacao.deleteMany({ where: { organizacaoId: { in: orgs } } })
  await db.editor.deleteMany({ where: { nome: `${p} Edita` } })
  await db.videomaker.deleteMany({ where: { id: { in: Object.values(vm) } } })
  await db.organizacao.deleteMany({ where: { id: { in: orgs } } })
  await db.usuario.deleteMany({ where: { OR: [{ id: { in: [...Object.values(admin), superAdmin] } }, { email: `${p}-nova@gh.test` }] } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("a chave", () => {
  it("lê o módulo de cada empresa; sem linha, o padrão é desligado", async () => {
    expect(await empresaVeRede(org.com)).toBe(true)
    expect(await empresaVeRede(org.sem)).toBe(false)
    expect(await empresaVeRede(org.padrao)).toBe(false)
  })
})

describe("lista de videomakers (/api/videomakers)", () => {
  it("com a rede: vê os da rede", async () => {
    como("com")
    const ids = await idsDaLista()
    expect(ids).toEqual(expect.arrayContaining([vm.global, vm.proprio, vm.noCard]))
  })
  it("sem a rede: só os da empresa", async () => {
    const ids = await idsDaLista()
    expect(ids).toContain(vm.proprio)
    expect(ids).not.toContain(vm.global)
    expect(ids).not.toContain(vm.noCard)
    expect(ids).not.toContain(vm.editaRede)
  })
})

describe("busca de quem grava e de quem edita (/api/equipe-disponivel)", () => {
  it("com a rede: o da rede aparece nos dois papéis", async () => {
    como("com")
    expect(await opcoes("captacao")).toContain(`vm:${vm.noCard}`)
    expect(await opcoes("edicao")).toContain(`vm:${vm.editaRede}`)
  })
  it("sem a rede: só os da empresa, nos dois papéis", async () => {
    const captacao = await opcoes("captacao")
    expect(captacao).toContain(`vm:${vm.proprio}`)
    expect(captacao).not.toContain(`vm:${vm.global}`)
    expect(captacao).not.toContain(`vm:${vm.noCard}`)
    expect(await opcoes("edicao")).not.toContain(`vm:${vm.editaRede}`)
  })
})

describe("lista da equipe em Usuários (/api/usuarios)", () => {
  it("com a rede: traz os da rede; sem a rede: só os da empresa", async () => {
    como("com")
    let corpo = await (await usuarios(get("/api/usuarios"))).json()
    expect((corpo.videomakers as { id: string }[]).map((v) => v.id)).toContain(vm.noCard)
    como("sem")
    corpo = await (await usuarios(get("/api/usuarios"))).json()
    const ids = (corpo.videomakers as { id: string }[]).map((v) => v.id)
    expect(ids).toContain(vm.proprio)
    expect(ids).not.toContain(vm.global)
  })
})

describe("perfil, desempenho e avaliação do videomaker", () => {
  it("com a rede: abre o perfil de quem não é da empresa", async () => {
    como("com")
    expect((await perfil(get(`/api/videomakers/${vm.noCard}`), params(vm.noCard))).status).toBe(200)
    expect((await desempenho(get(`/api/videomakers/${vm.noCard}/performance`), params(vm.noCard))).status).toBe(200)
  })
  it("sem a rede: o da rede não abre, nem avalia", async () => {
    expect((await perfil(get(`/api/videomakers/${vm.global}`), params(vm.global))).status).toBe(404)
    expect((await desempenho(get(`/api/videomakers/${vm.global}/performance`), params(vm.global))).status).toBe(404)
    const nota = await avaliar(json(`/api/videomakers/${vm.global}/avaliar`, "POST", { nota: 5 }), params(vm.global))
    expect(nota.status).toBe(404)
    expect(await db.avaliacaoVideomaker.count({ where: { videomakerId: vm.global } })).toBe(0)
  })
  it("sem a rede: o próprio abre; e quem já está num card daqui também", async () => {
    expect((await perfil(get(`/api/videomakers/${vm.proprio}`), params(vm.proprio))).status).toBe(200)
    expect((await perfil(get(`/api/videomakers/${vm.noCard}`), params(vm.noCard))).status).toBe(200)
  })
})

describe("escalar no card (PUT /api/demandas/[id])", () => {
  it("sem a rede: o card antigo continua mostrando quem é", async () => {
    const res = await abrirDemanda(get(`/api/demandas/${cardDaSem}`), params(cardDaSem))
    expect(res.status).toBe(200)
    const { demanda } = await res.json()
    expect(demanda.videomaker).toMatchObject({ id: vm.noCard, nome: `${p} No Card` })
  })
  it("sem a rede: salvar o card com o mesmo videomaker da rede não o derruba", async () => {
    const res = await editarDemanda(json(`/api/demandas/${cardDaSem}`, "PUT", { videomakerId: `vm:${vm.noCard}` }), params(cardDaSem))
    expect(res.status).toBe(200)
    expect((await db.demanda.findUniqueOrThrow({ where: { id: cardDaSem } })).videomakerId).toBe(vm.noCard)
  })
  it("sem a rede: trocar por outro da rede é recusado (token e id cru), e não cria vínculo", async () => {
    for (const valor of [`vm:${vm.global}`, vm.global]) {
      const res = await editarDemanda(json(`/api/demandas/${cardDaSem}`, "PUT", { videomakerId: valor }), params(cardDaSem))
      expect(res.status).toBe(400)
      expect(JSON.stringify(await res.json())).toContain("não é da sua empresa")
    }
    const editor = await editarDemanda(json(`/api/demandas/${cardDaSem}`, "PUT", { editorId: `vm:${vm.editaRede}` }), params(cardDaSem))
    expect(editor.status).toBe(400)
    expect((await db.demanda.findUniqueOrThrow({ where: { id: cardDaSem } })).videomakerId).toBe(vm.noCard)
    expect(await db.videomakerOrganizacao.count({ where: { organizacaoId: org.sem, videomakerId: { in: [vm.global, vm.editaRede] } } })).toBe(0)
  })
  it("sem a rede: trocar pelo próprio funciona", async () => {
    const res = await editarDemanda(json(`/api/demandas/${cardDaSem}`, "PUT", { videomakerId: `vm:${vm.proprio}` }), params(cardDaSem))
    expect(res.status).toBe(200)
    expect((await db.demanda.findUniqueOrThrow({ where: { id: cardDaSem } })).videomakerId).toBe(vm.proprio)
  })
  it("com a rede: escala o da rede, que ganha o vínculo (como antes)", async () => {
    como("com")
    const criado = await criarDemanda(json("/api/demandas", "POST", corpoDoJob()))
    expect(criado.status).toBe(201)
    const { id } = await criado.json()
    const res = await editarDemanda(json(`/api/demandas/${id}`, "PUT", { videomakerId: `vm:${vm.noCard}` }), params(id))
    expect(res.status).toBe(200)
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).videomakerId).toBe(vm.noCard)
    expect(await db.videomakerOrganizacao.count({ where: { organizacaoId: org.com, videomakerId: vm.noCard } })).toBe(1)
  })
})

describe("criar card já com videomaker (POST /api/demandas)", () => {
  it("sem a rede: recusa o da rede; aceita o próprio", async () => {
    const recusado = await criarDemanda(json("/api/demandas", "POST", corpoDoJob({ videomakerId: `vm:${vm.global}` })))
    expect(recusado.status).toBe(400)
    const aceito = await criarDemanda(json("/api/demandas", "POST", corpoDoJob({ videomakerId: `vm:${vm.proprio}` })))
    expect(aceito.status).toBe(201)
    expect((await aceito.json()).videomakerId).toBe(vm.proprio)
  })
  it("com a rede: aceita o da rede", async () => {
    como("com")
    const res = await criarDemanda(json("/api/demandas", "POST", corpoDoJob({ videomakerId: `vm:${vm.editaRede}` })))
    expect(res.status).toBe(201)
  })
})

describe("equipe da cobertura (POST /api/coberturas/[id]/equipe)", () => {
  it("sem a rede: recusa o da rede; aceita o próprio", async () => {
    const recusado = await equipeCobertura(json(`/api/coberturas/${coberturaDaSem}/equipe`, "POST", { token: `vm:${vm.global}` }), params(coberturaDaSem))
    expect(recusado.status).toBe(403)
    const aceito = await equipeCobertura(json(`/api/coberturas/${coberturaDaSem}/equipe`, "POST", { token: `vm:${vm.proprio}` }), params(coberturaDaSem))
    expect(aceito.status).toBeLessThan(300)
  })
})

describe("tela de empresas do super-admin", () => {
  it("empresa nova nasce sem a rede; marcar na criação liga", async () => {
    estado.sessao = { user: { id: superAdmin, tipo: "admin" } }
    const res = await criarEmpresa(json("/api/admin/organizacoes", "POST", { nome: `Nova ${p}`, adminNome: "Admin Nova", adminEmail: `${p}-nova@gh.test` }))
    expect(res.status).toBe(201)
    empresaNova = (await res.json()).organizacao.id
    expect(await empresaVeRede(empresaNova)).toBe(false)
    const lida = await (await modulosDaEmpresa(get(`/api/admin/organizacoes/${empresaNova}/modulos`), params(empresaNova))).json()
    expect(lida.modulos.find((m: { chave: string }) => m.chave === "rede")).toMatchObject({ ativo: false, origem: "escolhido", disponivelNaPlataforma: true })

    const marcada = await criarEmpresa(json("/api/admin/organizacoes", "POST", { nome: `Paga ${p}`, adminUsuarioId: superAdmin, veRede: true }))
    expect(marcada.status).toBe(201)
    empresaPaga = (await marcada.json()).organizacao.id
    expect(await empresaVeRede(empresaPaga)).toBe(true)
  })
  it("o super-admin liga e desliga a rede na edição; a empresa comum não consegue", async () => {
    estado.sessao = { user: { id: superAdmin, tipo: "admin" } }
    const ligar = await mudarModulo(json(`/api/admin/organizacoes/${org.sem}/modulos`, "PATCH", { modulo: "rede", ativo: true }), params(org.sem))
    expect(ligar.status).toBe(200)
    como("sem")
    expect(await idsDaLista()).toContain(vm.global)
    estado.sessao = { user: { id: superAdmin, tipo: "admin" } }
    await mudarModulo(json(`/api/admin/organizacoes/${org.sem}/modulos`, "PATCH", { modulo: "rede", ativo: false }), params(org.sem))
    como("sem")
    expect(await idsDaLista()).not.toContain(vm.global)
    const negado = await mudarModulo(json(`/api/admin/organizacoes/${org.sem}/modulos`, "PATCH", { modulo: "rede", ativo: true }), params(org.sem))
    expect(negado.status).toBe(403)
  })
})
