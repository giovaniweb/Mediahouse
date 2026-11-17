import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import pg from "pg"

// Mais de uma cidade por videomaker e nada de cadastro repetido pelo telefone
// (16/11/2026). O caso real: o Kevew Felix tinha três cadastros na Contourline
// com o mesmo número, um por cidade, e nenhum aviso de WhatsApp chegava a ele.
// Rotas reais e banco real; só a sessão é simulada.
const { sessao } = vi.hoisted(() => ({ sessao: { user: null as null | { id: string; organizacaoId?: string; tipo: string; papel?: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.user ? { user: sessao.user } : null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))

import { prismaBase as db } from "@/lib/prisma"
import { identidadeWhatsApp } from "@/lib/whatsapp-identidade"
import { POST as cadastrarPublico } from "@/app/api/publico/videomaker/route"
import { GET as listar, POST as cadastrar } from "@/app/api/videomakers/route"
import { PUT as editar } from "@/app/api/videomakers/[id]/route"
import { GET as buscaRede } from "@/app/api/rede/videomakers/route"
import { GET as equipe } from "@/app/api/equipe-disponivel/route"
import { juntarVideomakers, listarGrupos } from "../../scripts/lib/juntar-videomakers.mjs"

const p = `cid-${randomUUID().slice(0, 8)}`
const A = `${p}-a`, B = `${p}-b`, P = `${p}-parceira`
const gestor = `${p}-gestor`, gestorB = `${p}-gestor-b`
const vm = { base: `${p}-vm-base`, outro: `${p}-vm-outro` }
const TEL = "22998360001", TEL_OUTRO = "22998360002"

const como = (id: string, organizacaoId: string) => { sessao.user = { id, organizacaoId, tipo: "admin", papel: "admin" } }
let ip = 0
const req = (url: string, method = "GET", corpo?: unknown) => new NextRequest(`http://localhost${url}`, {
  method, ...(corpo ? { body: JSON.stringify(corpo), headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${++ip}.1` } } : {}),
})
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const formulario = (extra: Record<string, unknown> = {}) => ({
  nome: "Kevew Felix", cpfCnpj: `${Date.now()}${ip}`.slice(-11), email: `kevew-${randomUUID().slice(0, 6)}@teste.invalid`,
  telefone: "(22) 99836-0001", cidade: "Guarapari", estado: "ES", aceiteTermos: true, ...extra,
})

beforeAll(async () => {
  await db.organizacao.createMany({ data: [{ id: A, nome: `${p} Contour`, slug: A }, { id: B, nome: `${p} Beta`, slug: B }] })
  await db.moduloOrganizacao.create({ data: { organizacaoId: B, modulo: "rede", ativo: true } })
  await db.usuario.createMany({ data: [gestor, gestorB].map(id => ({ id, nome: id, tipo: "admin", senhaHash: "sintetico" })) })
  await db.usuarioOrganizacao.createMany({ data: [{ usuarioId: gestor, organizacaoId: A, papel: "admin", areas: [] }, { usuarioId: gestorB, organizacaoId: B, papel: "admin", areas: [] }] })
  await db.videomaker.create({ data: { id: vm.base, nome: "Kevew Felix", cidade: "Itaperuna", estado: "RJ", telefone: TEL, redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
  await db.videomaker.create({ data: { id: vm.outro, nome: "Outra Pessoa", cidade: "Campos", estado: "RJ", telefone: TEL_OUTRO, redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
  await db.videomakerOrganizacao.createMany({ data: [{ organizacaoId: A, videomakerId: vm.base, status: "ativo" }, { organizacaoId: A, videomakerId: vm.outro, status: "ativo" }] })
})

beforeEach(() => { sessao.user = null })

afterAll(async () => {
  await db.conviteVideomaker.deleteMany({ where: { demanda: { organizacaoId: A } } })
  await db.demanda.deleteMany({ where: { organizacaoId: A } })
  await db.parceriaOrganizacao.deleteMany({ where: { organizacaoConvidanteId: A } })
  await db.videomaker.deleteMany({ where: { vinculos: { some: { organizacaoId: { in: [A, B, P] } } } } })
  await db.videomaker.deleteMany({ where: { id: { startsWith: p } } })
  await db.organizacao.deleteMany({ where: { id: { in: [A, B, P] } } })
  await db.usuario.deleteMany({ where: { id: { startsWith: p } } })
  await db.$disconnect()
})

const doTelefone = async (tel: string) => (await db.videomaker.findMany({ where: { vinculos: { some: { organizacaoId: A } } }, select: { id: true, telefone: true } }))
  .filter(v => v.telefone?.replace(/\D/g, "").endsWith(tel.slice(-8)))

describe("cadastro público", () => {
  it("o mesmo telefone não vira outro cadastro: avisa e não diz de quem é", async () => {
    const r = await cadastrarPublico(req(`/api/publico/videomaker?org=${A}`, "POST", formulario()))
    expect(r.status).toBe(409)
    const corpo = await r.json()
    expect(corpo.duplicado).toBe(true)
    expect(JSON.stringify(corpo)).not.toContain("Itaperuna")
    expect(await doTelefone(TEL)).toHaveLength(1)
  })

  it("com 'acrescentar', o cadastro que existe NÃO muda: a gestão recebe o pedido no sino", async () => {
    const antes = await db.videomaker.findUniqueOrThrow({ where: { id: vm.base } })
    const r = await cadastrarPublico(req(`/api/publico/videomaker?org=${A}`, "POST", formulario({ acrescentarCidade: true, cidadesAtendidas: ["Vitória", "itaperuna"] })))
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo).toMatchObject({ ok: true, pedidoEnviado: true })
    expect(JSON.stringify(corpo)).not.toContain("Guarapari")
    expect(await doTelefone(TEL)).toHaveLength(1)
    const depois = await db.videomaker.findUniqueOrThrow({ where: { id: vm.base } })
    expect(depois.cidadesAtendidas).toEqual(antes.cidadesAtendidas)
    expect(depois.cidade).toBe(antes.cidade)
    expect(depois.updatedAt).toEqual(antes.updatedAt)
    const alertas = await db.alertaIA.findMany({ where: { organizacaoId: A, tipoAlerta: "videomaker_cidade_sugerida" } })
    expect(alertas).toHaveLength(1)
    // Só a cidade que o cadastro ainda não tem; Itaperuna (a base) não entra.
    expect(alertas[0].mensagem).toContain("Guarapari, Vitória")
    expect(alertas[0].mensagem).not.toContain("Itaperuna")
  })

  it("'acrescentar' sem cidade nova não gera aviso e responde igual", async () => {
    const r = await cadastrarPublico(req(`/api/publico/videomaker?org=${A}`, "POST", formulario({ acrescentarCidade: true, cidade: "itaperuna", estado: "RJ", cidadesAtendidas: [] })))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, pedidoEnviado: true })
    expect(await db.alertaIA.count({ where: { organizacaoId: A, tipoAlerta: "videomaker_cidade_sugerida" } })).toBe(1)
  })

  it("telefone novo cria o cadastro com a base e as cidades atendidas", async () => {
    const r = await cadastrarPublico(req(`/api/publico/videomaker?org=${A}`, "POST", formulario({ telefone: "11977770001", cidade: "São Paulo", estado: "SP", cidadesAtendidas: ["Campinas", "São Paulo", "Ribeirão Preto"] })))
    expect(r.status).toBe(201)
    const { id } = await r.json()
    expect((await db.videomaker.findUniqueOrThrow({ where: { id } })).cidadesAtendidas).toEqual(["Campinas", "Ribeirão Preto"])
  })

  it("o mesmo telefone em OUTRA empresa é outro cadastro (a regra é por empresa)", async () => {
    const r = await cadastrarPublico(req(`/api/publico/videomaker?org=${B}`, "POST", formulario({ telefone: TEL_OUTRO })))
    expect(r.status).toBe(201)
  })
})

describe("cadastro e ficha pela gestão", () => {
  it("o mesmo telefone devolve quem é; com acrescentarCidadeEm a cidade vai para a ficha", async () => {
    como(gestor, A)
    const corpo = { nome: "Outra Pessoa de novo", telefone: "+55 22 99836-0002", cidade: "Macaé", cidadesAtendidas: ["Rio das Ostras"] }
    const r = await cadastrar(req("/api/videomakers", "POST", corpo))
    expect(r.status).toBe(409)
    expect((await r.json()).duplicado).toMatchObject({ id: vm.outro, nome: "Outra Pessoa" })

    const r2 = await cadastrar(req("/api/videomakers", "POST", { ...corpo, acrescentarCidadeEm: vm.outro }))
    expect(r2.status).toBe(200)
    expect(await r2.json()).toMatchObject({ acrescentado: true, cidadesAtendidas: ["Macaé", "Rio das Ostras"] })
    expect(await doTelefone(TEL_OUTRO)).toHaveLength(1)
  })

  it("acrescentarCidadeEm de alguém que não tem o telefone não serve de atalho", async () => {
    como(gestor, A)
    const r = await cadastrar(req("/api/videomakers", "POST", { nome: "X", telefone: TEL_OUTRO, cidade: "Niterói", acrescentarCidadeEm: vm.base }))
    expect(r.status).toBe(409)
    expect((await db.videomaker.findUniqueOrThrow({ where: { id: vm.base } })).cidadesAtendidas).not.toContain("Niterói")
  })

  it("acrescentarCidadeEm sem ser gestor é recusado e não muda a ficha", async () => {
    sessao.user = { id: gestor, organizacaoId: A, tipo: "solicitante", papel: "solicitante" }
    const r = await cadastrar(req("/api/videomakers", "POST", { nome: "Y", telefone: "+55 22 99836-0002", cidade: "Búzios", acrescentarCidadeEm: vm.outro }))
    expect(r.status).toBe(403)
    expect((await db.videomaker.findUniqueOrThrow({ where: { id: vm.outro } })).cidadesAtendidas).not.toContain("Búzios")
  })

  it("Editar grava as cidades atendidas e recusa o telefone de outro videomaker", async () => {
    como(gestor, A)
    const ok = await editar(req(`/api/videomakers/${vm.base}`, "PUT", { cidadesAtendidas: ["Guarapari", "Vitória", "Campos"] }), params(vm.base))
    expect(ok.status).toBe(200)
    expect((await db.videomaker.findUniqueOrThrow({ where: { id: vm.base } })).cidadesAtendidas).toEqual(["Guarapari", "Vitória", "Campos"])
    // Edição parcial (só a lista negra) não apaga a lista.
    await editar(req(`/api/videomakers/${vm.base}`, "PUT", { podeEditar: true }), params(vm.base))
    expect((await db.videomaker.findUniqueOrThrow({ where: { id: vm.base } })).cidadesAtendidas).toHaveLength(3)

    const dup = await editar(req(`/api/videomakers/${vm.base}`, "PUT", { telefone: TEL_OUTRO }), params(vm.base))
    expect(dup.status).toBe(409)
    // O próprio número de novo passa.
    expect((await editar(req(`/api/videomakers/${vm.base}`, "PUT", { telefone: TEL }), params(vm.base))).status).toBe(200)
  })

  it("lista e escala mostram as cidades atendidas (a busca da escala procura nelas)", async () => {
    como(gestor, A)
    const lista = await (await listar(req("/api/videomakers"))).json()
    expect(lista.videomakers.find((v: { id: string }) => v.id === vm.base).cidadesAtendidas).toContain("Guarapari")
    const opcoes = (await (await equipe(req("/api/equipe-disponivel?papel=captacao&externos=1"))).json()).opcoes
    expect(opcoes.find((o: { value: string }) => o.value === `vm:${vm.base}`).subtitle).toBe("Itaperuna · atende Guarapari, Vitória, Campos")
  })
})

describe("busca na rede", () => {
  it("filtrar por uma cidade atendida acha quem mora em outra", async () => {
    como(gestorB, B)
    const r = await (await buscaRede(req("/api/rede/videomakers?cidade=Vit%C3%B3ria"))).json()
    expect(r.videomakers.map((v: { id: string }) => v.id)).toContain(vm.base)
    expect(r.filtros.cidades).toContain("Vitória")
    // Com a UF da cidade escolhida, quem mora em outro estado e atende também aparece.
    const comUf = await (await buscaRede(req("/api/rede/videomakers?cidade=Vit%C3%B3ria&uf=ES"))).json()
    expect(comUf.videomakers.map((v: { id: string }) => v.id)).toContain(vm.base)
    const outra = await (await buscaRede(req("/api/rede/videomakers?cidade=Curitiba"))).json()
    expect(outra.videomakers.map((v: { id: string }) => v.id)).not.toContain(vm.base)
  })
})

describe("scripts/juntar-videomakers-duplicados.mjs", () => {
  const dup = { velho: `${p}-dup-velho`, guara: `${p}-dup-guara`, fica: `${p}-dup-fica` }
  const contas = { velho: `${p}-u-velho`, guara: `${p}-u-guara`, fica: `${p}-u-fica` }
  const TEL_DUP = "22998369999"
  const demanda = `${p}-dem`
  const rede = { velho: `${p}-rede-velho`, guara: `${p}-rede-guara`, recusado: `${p}-rede-recusado` }
  let c: pg.Client

  beforeAll(async () => {
    c = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await c.connect()
    // Os três cadastros do Kevew, como estavam em produção.
    for (const [k, cidade, criado] of [["velho", "Itaperuna", "2026-03-19"], ["guara", "Guarapari ", "2026-05-25"], ["fica", "ITAPERUNA, RJ", "2026-06-22"]] as const) {
      await db.usuario.create({ data: { id: contas[k], nome: `Kevew ${k}`, email: `${contas[k]}@teste.invalid`, telefone: TEL_DUP, tipo: "videomaker", senhaHash: `hash-${k}` } })
      await db.usuarioOrganizacao.create({ data: { usuarioId: contas[k], organizacaoId: A, papel: "videomaker", areas: [] } })
      await db.videomaker.create({ data: { id: dup[k], nome: `Kevew ${k}`, cidade, estado: "RJ", telefone: TEL_DUP, usuarioId: contas[k], createdAt: new Date(criado),
        redesSociais: [], areasAtuacao: k === "guara" ? ["Casamento"] : [], habilidades: [], equipamentos: [] } })
      await db.videomakerOrganizacao.create({ data: { organizacaoId: A, videomakerId: dup[k], status: k === "guara" ? "preferencial" : "ativo", valorDiaria: k === "velho" ? 450 : null } })
    }
    // A conta do "guara" também está na empresa B: lá ela continua.
    await db.usuarioOrganizacao.create({ data: { usuarioId: contas.guara, organizacaoId: B, papel: "videomaker", areas: [] } })
    await db.videomakerDadosFiscais.create({ data: { organizacaoId: A, videomakerId: dup.velho, cpfCnpj: "11122233344" } })
    await db.demanda.create({ data: { id: demanda, organizacaoId: A, codigo: demanda, titulo: "Job", descricao: "t", departamento: "growth", tipoVideo: "reels", cidade: "x", solicitanteId: contas.velho, videomakerId: dup.fica } })
    for (const k of ["velho", "guara", "fica"] as const) {
      await db.conviteVideomaker.create({ data: { demandaId: demanda, videomakerId: dup[k], status: "aceito", respondidoEm: new Date(), expiresAt: new Date(Date.now() + 3600_000), tarifaDiaria: 300 } })
    }
    await db.avaliacaoVideomaker.create({ data: { videomakerId: dup.guara, nota: 5, organizacaoId: A, avaliadorId: gestor } })
    // Revisão do PR #160: dois JUNTADOS com convite da rede pendente da mesma
    // empresa (B) e o mantido sem nenhum. Passar os dois quebrava o índice
    // convites_rede_pendente_unico. Fica o mais recente; o recusado só passa.
    await db.conviteRede.create({ data: { id: rede.velho, organizacaoId: B, videomakerId: dup.velho, createdAt: new Date("2026-11-01") } })
    await db.conviteRede.create({ data: { id: rede.guara, organizacaoId: B, videomakerId: dup.guara, createdAt: new Date("2026-11-10") } })
    await db.conviteRede.create({ data: { id: rede.recusado, organizacaoId: B, videomakerId: dup.velho, status: "recusado", createdAt: new Date("2026-10-01") } })
  })
  afterAll(async () => { await c.end() })

  it("a leitura acha o grupo e sugere o que tem mais histórico", async () => {
    const grupos = (await listarGrupos(c)).filter((g: { organizacaoId: string }) => g.organizacaoId === A)
    const g = grupos.find((x: { telefone: string }) => x.telefone === `55${TEL_DUP}`)
    expect(g.cadastros.map((v: { id: string }) => v.id)).toEqual([dup.velho, dup.guara, dup.fica])
    // fica: demanda + convite; guara: convite + avaliação → empate em 2, o mais antigo (guara).
    expect(g.sugestao).toBe(dup.guara)
  })

  it("antes de juntar, a identificação do WhatsApp não acha ninguém (o bug)", async () => {
    const id = await identidadeWhatsApp(A, `55${TEL_DUP}`, db)
    expect(id.videomaker).toBeNull()
    expect(id.usuario).toBeNull()
  })

  it("recusa telefone diferente sem --forcar e não muda nada", async () => {
    await expect(juntarVideomakers(c, { manterId: dup.fica, juntarIds: [vm.outro] })).rejects.toThrow(/Telefone diferente/)
    expect(await db.videomaker.count({ where: { id: { in: Object.values(dup) } } })).toBe(3)
  })

  it("junta tudo numa transação: histórico, cidades, vínculo, fiscais, contas e auditoria", async () => {
    let copia: { juntados: { id: string }[], convitesRedeCancelados: { id: string }[] } | null = null
    const r = await juntarVideomakers(c, { manterId: dup.fica, juntarIds: [dup.velho, dup.guara], antesDeConfirmar: (x: typeof copia) => { copia = x } })
    expect(copia!.juntados.map(j => j.id)).toEqual([dup.velho, dup.guara])

    expect(await db.videomaker.count({ where: { id: { in: [dup.velho, dup.guara] } } })).toBe(0)
    const fica = await db.videomaker.findUniqueOrThrow({ where: { id: dup.fica }, include: { convites: true, avaliacoes: true, vinculos: true, dadosFiscais: true } })
    expect(fica.cidade).toBe("ITAPERUNA, RJ")
    expect(fica.cidadesAtendidas).toEqual(["Guarapari"])
    expect(fica.areasAtuacao).toEqual(["Casamento"])
    expect(fica.convites).toHaveLength(3)
    expect(fica.convites.every(cv => Number(cv.tarifaDiaria) === 300)).toBe(true)
    expect(fica.avaliacoes).toHaveLength(1)
    expect(fica.dadosFiscais.map(f => f.cpfCnpj)).toEqual(["11122233344"])
    // Um vínculo só, com a melhor situação e a diária que faltava.
    expect(fica.vinculos).toHaveLength(1)
    expect(fica.vinculos[0]).toMatchObject({ status: "preferencial", valorDiaria: 450 })
    expect(fica.usuarioId).toBe(contas.fica)

    // Contas: a que fica continua com login; a só desta empresa fica inativa e
    // sem telefone; a que também está em B só sai daqui.
    const u = Object.fromEntries((await db.usuario.findMany({ where: { id: { in: Object.values(contas) } } })).map(x => [x.id, x]))
    expect(u[contas.fica]).toMatchObject({ status: "ativo", telefone: TEL_DUP, senhaHash: "hash-fica" })
    expect(u[contas.velho]).toMatchObject({ status: "inativo", telefone: null })
    expect(u[contas.guara]).toMatchObject({ status: "ativo", telefone: TEL_DUP })
    expect(await db.usuarioOrganizacao.count({ where: { usuarioId: contas.guara } })).toBe(1)
    // O pedido que a conta desativada tinha feito passa para a que fica.
    expect((await db.demanda.findUniqueOrThrow({ where: { id: demanda } })).solicitanteId).toBe(contas.fica)

    const audit = await db.eventoAuditoria.findFirstOrThrow({ where: { organizacaoId: A, acao: "videomaker.juntar", recursoId: dup.fica } })
    expect(audit).toMatchObject({ atorTipo: "tecnico", resultado: "sucesso", correlationId: r.correlationId })
    expect(audit.depois).toMatchObject({ pulados: 1 })

    // Convites da rede: o pendente mais recente fica; o outro é cancelado e
    // vai para a cópia; o recusado passa como está.
    const convites = Object.fromEntries((await db.conviteRede.findMany({ where: { id: { in: Object.values(rede) } } })).map(x => [x.id, x]))
    expect(convites[rede.guara]).toMatchObject({ videomakerId: dup.fica, status: "pendente" })
    expect(convites[rede.velho]).toMatchObject({ videomakerId: dup.fica, status: "cancelado" })
    expect(convites[rede.recusado]).toMatchObject({ videomakerId: dup.fica, status: "recusado" })
    expect(copia!.convitesRedeCancelados.map(x => x.id)).toEqual([rede.velho])
    expect(r.contagem["convites da rede repetidos cancelados"]).toBe(1)

    // A trava do convite voltou.
    await expect(db.conviteVideomaker.updateMany({ where: { videomakerId: dup.fica }, data: { tarifaDiaria: 999 } })).rejects.toThrow(/imutável/)
  })

  it("depois de juntar, o WhatsApp acha o videomaker", async () => {
    const id = await identidadeWhatsApp(A, `55${TEL_DUP}`, db)
    expect(id.videomaker?.id).toBe(dup.fica)
    expect(id.usuario?.id).toBe(contas.fica)
  })

  it("falha no meio = nada muda (a cópia que não se grava desfaz tudo)", async () => {
    await expect(juntarVideomakers(c, { manterId: vm.base, juntarIds: [vm.outro], forcar: true, antesDeConfirmar: () => { throw new Error("disco cheio") } })).rejects.toThrow("disco cheio")
    expect(await db.videomaker.count({ where: { id: { in: [vm.base, vm.outro] } } })).toBe(2)
  })
})

// Revisão do PR #160: apagar o vínculo do juntado com "Empresa dele" revogava
// os espelhos abertos feitos por ele antes de o histórico passar ao mantido.
describe("juntar com 'Empresa dele' e card espelhado aberto", () => {
  const vmx = { fica: `${p}-ex-fica`, sai: `${p}-ex-sai`, semEmpresa: `${p}-ex-sem`, comEmpresa: `${p}-ex-com` }
  const ux = { fica: `${p}-ux-fica`, sai: `${p}-ux-sai`, semEmpresa: `${p}-ux-sem`, comEmpresa: `${p}-ux-com` }
  const card = `${p}-card-espelhado`
  let c: pg.Client

  beforeAll(async () => {
    c = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await c.connect()
    await db.organizacao.create({ data: { id: P, nome: `${p} Parceira`, slug: P } })
    await db.parceriaOrganizacao.create({ data: {
      organizacaoConvidanteId: A, organizacaoConvidadaId: P, nomeConvidante: "", nomeConvidada: "",
      status: "aceita", criadoPorId: gestor, respondidoEm: new Date(),
    } })
    const pares = [["fica", "22998371111"], ["sai", "22998371111"], ["semEmpresa", "22998372222"], ["comEmpresa", "22998372222"]] as const
    for (const [k, tel] of pares) {
      await db.usuario.create({ data: { id: ux[k], nome: k, email: `${ux[k]}@teste.invalid`, telefone: tel, tipo: "videomaker", senhaHash: "x" } })
      await db.usuarioOrganizacao.create({ data: { usuarioId: ux[k], organizacaoId: A, papel: "videomaker", areas: [] } })
      await db.usuarioOrganizacao.create({ data: { usuarioId: ux[k], organizacaoId: P, papel: "admin", areas: [] } })
      await db.videomaker.create({ data: { id: vmx[k], nome: k, cidade: "Itaperuna", telefone: tel, usuarioId: ux[k], redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
      await db.videomakerOrganizacao.create({ data: { organizacaoId: A, videomakerId: vmx[k] } })
    }
    // Os dois do primeiro par trabalham pela parceira P ("Empresa dele").
    for (const k of ["fica", "sai", "comEmpresa"] as const) {
      await db.videomakerOrganizacao.update({ where: { organizacaoId_videomakerId: { organizacaoId: A, videomakerId: vmx[k] } }, data: { organizacaoExecutoraId: P } })
    }
    // O juntado tem vínculo com a P e é quem executa o card espelhado aberto.
    await db.videomakerOrganizacao.create({ data: { organizacaoId: P, videomakerId: vmx.sai } })
    await db.demanda.create({ data: {
      id: card, codigo: card, organizacaoId: A, titulo: "Gravação", descricao: "t", departamento: "growth", tipoVideo: "reels", cidade: "x",
      solicitanteId: gestor, videomakerId: vmx.sai, statusVisivel: "producao",
    } })
    await db.demandaCompartilhamento.create({ data: {
      demandaId: card, organizacaoOrigemId: A, organizacaoDestinoId: P, nomeOrigem: "", nomeDestino: "", criadoPorId: gestor, porVideomakerId: vmx.sai,
    } })
    await db.executorEspelho.create({ data: { organizacaoId: P, demandaId: card, videomakerId: vmx.sai, escolhidoPorId: ux.sai } })
  })
  afterAll(async () => { await c.end() })

  it("o histórico passa primeiro: o espelho continua aberto e o executor fica com o mantido", async () => {
    const r = await juntarVideomakers(c, { manterId: vmx.fica, juntarIds: [vmx.sai] })
    expect(r.juntados).toEqual([vmx.sai])
    const espelho = await db.demandaCompartilhamento.findFirstOrThrow({ where: { demandaId: card } })
    expect(espelho.revogadoEm).toBeNull()
    expect(espelho.porVideomakerId).toBe(vmx.fica)
    expect(await db.executorEspelho.findFirstOrThrow({ where: { demandaId: card } })).toMatchObject({ videomakerId: vmx.fica, organizacaoId: P })
    expect((await db.demanda.findUniqueOrThrow({ where: { id: card } })).videomakerId).toBe(vmx.fica)
    const vinculos = await db.videomakerOrganizacao.findMany({ where: { videomakerId: vmx.fica }, orderBy: { organizacaoId: "asc" } })
    expect(vinculos.map(v => [v.organizacaoId, v.organizacaoExecutoraId])).toEqual([[A, P], [P, null]])
  })

  it("recusa quando o juntado tem 'Empresa dele' e o mantido não, sem mudar nada", async () => {
    await expect(juntarVideomakers(c, { manterId: vmx.semEmpresa, juntarIds: [vmx.comEmpresa] })).rejects.toThrow(/Empresa dele/)
    expect(await db.videomaker.count({ where: { id: { in: [vmx.semEmpresa, vmx.comEmpresa] } } })).toBe(2)
    expect((await db.videomakerOrganizacao.findFirstOrThrow({ where: { videomakerId: vmx.comEmpresa, organizacaoId: A } })).organizacaoExecutoraId).toBe(P)
  })
})
