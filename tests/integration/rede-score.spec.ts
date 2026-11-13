// Rede de profissionais (Onda 2B), contra o banco real e pelas rotas:
//   - outra empresa vê só a média e a quantidade: nem comentário, nem o nome de
//     quem avaliou, nem o contato do profissional;
//   - o contato chega com o "aceito" do convite da rede;
//   - contestar tira a nota da média; a Plataforma decide e a nota removida some;
//   - quem sai da rede some da busca e continua na lista de quem já o tem.
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import pg from "pg"
const { sessao } = vi.hoisted(() => ({ sessao: { user: null as null | { id: string; organizacaoId?: string; tipo: string; papel?: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.user ? { user: sessao.user } : null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaBase as db } from "@/lib/prisma"
import { GET as avaliacoesDoPerfil } from "@/app/api/videomakers/[id]/avaliar/route"
import { GET as perfil } from "@/app/api/videomakers/[id]/route"
import { GET as listaDaEmpresa } from "@/app/api/videomakers/route"
import { GET as buscaRede } from "@/app/api/rede/videomakers/route"
import { POST as convidar } from "@/app/api/rede/convites/route"
import { GET as minhaRede, POST as agirNaRede } from "@/app/api/me/rede/route"
import { GET as contestacoes, POST as decidir } from "@/app/api/admin/contestacoes/route"
import { GET as escala } from "@/app/api/equipe-disponivel/route"

const p = `rede-${randomUUID().slice(0, 8)}`
const A = `${p}-a`, B = `${p}-b`, C = `${p}-c`
const uA = `${p}-ua`, uB = `${p}-ub`, uC = `${p}-uc`, uVm = `${p}-uvm`, uDono = `${p}-dono`
const vm = `${p}-vm`, demandaA = `${p}-dem-a`
const NOME_A = `Empresa Alfa ${p}`

const como = (id: string, organizacaoId?: string, tipo = "admin") => { sessao.user = { id, organizacaoId, tipo, papel: tipo } }
const get = (url: string) => new NextRequest(`http://localhost${url}`)
const post = (url: string, corpo: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const json = async (r: Response) => ({ status: r.status, corpo: await r.json(), texto: "" })

const CHECKLIST_AV4 = [
  "[Checklist] Atendeu as demandas conforme o combinado? Sim",
  "[Checklist] Foi pontual e atencioso? Não",
  "[Checklist] Contrataria novamente? Não",
].join("\n") + "\n\nQR-DO-SERVICO-A"

beforeAll(async () => {
  await db.organizacao.createMany({ data: [[A, NOME_A], [B, `Empresa Beta ${p}`], [C, `Empresa Gama ${p}`]].map(([id, nome]) => ({ id, nome, slug: id })) })
  await db.usuario.createMany({ data: [uA, uB, uC, uVm, uDono].map(id => ({ id, nome: id, email: `${id}@teste.invalid`, tipo: id === uVm ? "videomaker" : "admin", senhaHash: "sintetico", superAdmin: id === uDono })) })
  await db.usuarioOrganizacao.createMany({ data: [[uA, A], [uB, B], [uC, C], [uVm, A], [uDono, A]].map(([usuarioId, organizacaoId]) => ({ usuarioId, organizacaoId, papel: usuarioId === uVm ? "videomaker" : "admin", areas: [] })) })
  await db.videomaker.create({ data: {
    id: vm, nome: `Videomaker ${p}`, cidade: "Belo Horizonte", estado: "MG", telefone: "31999990000", email: `contato-${p}@teste.invalid`,
    redesSociais: [], areasAtuacao: ["institucional"], habilidades: ["Drone"], equipamentos: [], usuarioId: uVm,
  } })
  await db.videomakerOrganizacao.create({ data: { organizacaoId: A, videomakerId: vm, status: "preferencial", valorDiaria: 800 } })
  await db.demanda.create({ data: { id: demandaA, organizacaoId: A, codigo: demandaA, titulo: "Job A", descricao: "Teste", departamento: "growth", tipoVideo: "reels", cidade: "BH", solicitanteId: uA } })
  await db.avaliacaoVideomaker.createMany({ data: [
    { id: `${p}-av1`, videomakerId: vm, nota: 5, comentario: "PRIVADO-A-1", organizacaoId: A, avaliadorId: uA },
    { id: `${p}-av2`, videomakerId: vm, nota: 5, comentario: "PRIVADO-A-2", organizacaoId: A, avaliadorId: uA },
    { id: `${p}-av3`, videomakerId: vm, nota: 1, comentario: "PRIVADO-A-RUIM", organizacaoId: A, avaliadorId: uA },
    // Por convite (Onda 1): sem dono, com o serviço da empresa A.
    // O checklist vem no começo do comentário, como a rota pública grava.
    { id: `${p}-av4`, videomakerId: vm, nota: 4, comentario: CHECKLIST_AV4, origem: "qr_publico", demandaId: demandaA },
    // Antiga, sem dono e sem serviço: o comentário não é de empresa nenhuma.
    { id: `${p}-av5`, videomakerId: vm, nota: 5, comentario: "LEGADO-SEM-DONO", origem: "qr_publico" },
  ] })
})

beforeEach(() => { sessao.user = null })

afterAll(async () => {
  await db.videomaker.deleteMany({ where: { id: vm } })
  await db.organizacao.deleteMany({ where: { id: { in: [A, B, C] } } })
  await db.usuario.deleteMany({ where: { id: { in: [uA, uB, uC, uVm, uDono] } } })
  await db.$disconnect()
})

describe("o que outra empresa vê", () => {
  it("B não vê comentário nenhum nem o nome de A; vê média e quantidade", async () => {
    como(uB, B)
    const r = await avaliacoesDoPerfil(get(`/api/videomakers/${vm}/avaliar`), params(vm))
    const texto = await r.text()
    expect(r.status).toBe(200)
    const corpo = JSON.parse(texto)
    expect(corpo.avaliacoes).toEqual([])
    expect(corpo.score).toEqual({ media: 4, avaliacoes: 5 })
    for (const segredo of ["PRIVADO-A", "QR-DO-SERVICO-A", "LEGADO-SEM-DONO", NOME_A, A]) expect(texto).not.toContain(segredo)
  })

  it("A vê os comentários dela e o do convite do serviço dela, não o antigo sem dono", async () => {
    como(uA, A)
    const { corpo } = await json(await avaliacoesDoPerfil(get(`/api/videomakers/${vm}/avaliar`), params(vm)))
    const comentarios = corpo.avaliacoes.map((a: { comentario: string }) => a.comentario).sort()
    // A empresa que avaliou vê o checklist inteiro, com o "Contrataria novamente?".
    expect(comentarios).toEqual(["PRIVADO-A-1", "PRIVADO-A-2", "PRIVADO-A-RUIM", CHECKLIST_AV4])
  })

  it("B abre o perfil sem telefone nem e-mail", async () => {
    como(uB, B)
    const { corpo } = await json(await perfil(get(`/api/videomakers/${vm}`), params(vm)))
    expect(corpo.videomaker).toMatchObject({ telefone: null, email: null, naLista: false, valorDiaria: null })
  })

  it("B não avalia quem não está na lista dela", async () => {
    como(uB, B)
    const { POST: avaliar } = await import("@/app/api/videomakers/[id]/avaliar/route")
    expect((await avaliar(post(`/api/videomakers/${vm}/avaliar`, { nota: 1, comentario: "sem nunca ter contratado" }), params(vm))).status).toBe(404)
    expect(await db.avaliacaoVideomaker.count({ where: { videomakerId: vm, organizacaoId: B } })).toBe(0)
  })

  it("a lista e a escala de B não trazem quem não está na lista dela", async () => {
    como(uB, B)
    const lista = await json(await listaDaEmpresa(get("/api/videomakers")))
    expect(lista.corpo.videomakers.map((v: { id: string }) => v.id)).not.toContain(vm)
    const opcoes = await json(await escala(get("/api/equipe-disponivel?papel=captacao")))
    expect(opcoes.corpo.opcoes.map((o: { value: string }) => o.value)).not.toContain(`vm:${vm}`)
  })

  it("a escala de A traz o score junto", async () => {
    como(uA, A)
    const { corpo } = await json(await escala(get("/api/equipe-disponivel?papel=captacao")))
    expect(corpo.opcoes.find((o: { value: string }) => o.value === `vm:${vm}`)).toMatchObject({ scoreTexto: "★ 4,0 · 5 avaliações" })
  })

  it("a busca da rede mostra cidade, áreas e score, sem contato", async () => {
    como(uB, B)
    const r = await buscaRede(get("/api/rede/videomakers?cidade=belo%20horizonte&especialidade=Drone"))
    const texto = await r.text()
    const achado = JSON.parse(texto).videomakers.find((v: { id: string }) => v.id === vm)
    expect(achado).toMatchObject({ cidade: "Belo Horizonte", estado: "MG", score: { media: 4, avaliacoes: 5 }, convitePendente: false })
    expect(Object.keys(achado)).not.toEqual(expect.arrayContaining(["telefone"]))
    for (const segredo of ["31999990000", `contato-${p}`, NOME_A]) expect(texto).not.toContain(segredo)
  })
})

describe("convite da rede", () => {
  it("B convida uma vez só; o profissional aceita e só então B vê o contato", async () => {
    como(uB, B)
    expect((await convidar(post("/api/rede/convites", { videomakerId: vm }))).status).toBe(201)
    expect((await convidar(post("/api/rede/convites", { videomakerId: vm }))).status).toBe(409)

    como(uVm, A, "videomaker")
    const minha = await json(await minhaRede())
    const convite = minha.corpo.convites.find((c: { empresa: string }) => c.empresa === `Empresa Beta ${p}`)
    expect(convite).toBeTruthy()
    expect((await agirNaRede(post("/api/me/rede", { acao: "responder", conviteId: convite.id, aceitar: true }))).status).toBe(200)
    expect((await agirNaRede(post("/api/me/rede", { acao: "responder", conviteId: convite.id, aceitar: true }))).status).toBe(409)

    como(uB, B)
    const depois = await json(await perfil(get(`/api/videomakers/${vm}`), params(vm)))
    expect(depois.corpo.videomaker).toMatchObject({ telefone: "31999990000", naLista: true })
    // Entrou na lista de B, sem levar nada do combinado de A.
    expect(depois.corpo.videomaker.valorDiaria).toBeNull()
    // E continua sem ver os comentários de A.
    expect((await json(await avaliacoesDoPerfil(get(`/api/videomakers/${vm}/avaliar`), params(vm)))).corpo.avaliacoes).toEqual([])
  })

  it("convite de um profissional para outro não serve", async () => {
    const outro = await db.conviteRede.create({ data: { organizacaoId: C, videomakerId: vm } })
    const { responderConviteRede } = await import("@/lib/rede")
    expect(await responderConviteRede(outro.id, "outro-profissional", true)).toBeNull()
    await db.conviteRede.delete({ where: { id: outro.id } })
  })
})

describe("contestação", () => {
  it("o profissional contesta; a nota sai da média até a decisão; removida, some para A", async () => {
    como(uVm, A, "videomaker")
    const ruim = `${p}-av3`
    const curto = await agirNaRede(post("/api/me/rede", { acao: "contestar", avaliacaoId: ruim, motivo: "curto" }))
    expect(curto.status).toBe(400)
    const r = await agirNaRede(post("/api/me/rede", { acao: "contestar", avaliacaoId: ruim, motivo: "Esse trabalho não aconteceu comigo" }))
    expect(r.status).toBe(200)
    expect((await agirNaRede(post("/api/me/rede", { acao: "contestar", avaliacaoId: ruim, motivo: "Repetindo enquanto está em análise" }))).status).toBe(409)

    const minha = await json(await minhaRede())
    expect(minha.corpo.score).toEqual({ media: 4.8, avaliacoes: 4 })
    const contestada = minha.corpo.avaliacoes.find((a: { id: string }) => a.id === ruim)
    expect(contestada).toMatchObject({ contestacaoStatus: "em_analise" })
    // Decisão de 13/11: o profissional não vê qual empresa deu cada nota.
    expect(contestada).not.toHaveProperty("empresa")
    expect(JSON.stringify(minha.corpo.avaliacoes)).not.toContain(NOME_A)
    // Nem as respostas do checklist: ele lê a nota e o texto livre.
    const doConvite = minha.corpo.avaliacoes.find((a: { id: string }) => a.id === `${p}-av4`)
    expect(doConvite).toMatchObject({ nota: 4, comentario: "QR-DO-SERVICO-A" })
    expect(JSON.stringify(minha.corpo.avaliacoes)).not.toMatch(/Checklist|Contrataria/)

    // A Plataforma: só o superadmin.
    como(uA, A)
    expect((await contestacoes()).status).toBe(403)
    como(uDono, A)
    const fila = await json(await contestacoes())
    const c = fila.corpo.contestacoes.find((x: { avaliacao: { comentario: string } }) => x.avaliacao?.comentario === "PRIVADO-A-RUIM")
    expect(c).toMatchObject({ status: "em_analise", profissional: `Videomaker ${p}` })
    expect((await decidir(post("/api/admin/contestacoes", { id: c.id, decisao: "removida", motivo: "Não houve trabalho registrado." }))).status).toBe(200)
    expect((await decidir(post("/api/admin/contestacoes", { id: c.id, decisao: "mantida", motivo: "Tentando decidir de novo." }))).status).toBe(409)

    como(uA, A)
    const deA = await json(await avaliacoesDoPerfil(get(`/api/videomakers/${vm}/avaliar`), params(vm)))
    expect(deA.corpo.avaliacoes.map((a: { comentario: string }) => a.comentario)).not.toContain("PRIVADO-A-RUIM")
    expect(deA.corpo.score).toEqual({ media: 4.8, avaliacoes: 4 })
    // Removida, não volta a ser contestada.
    como(uVm, A, "videomaker")
    expect((await agirNaRede(post("/api/me/rede", { acao: "contestar", avaliacaoId: ruim, motivo: "Mais uma vez, por favor" }))).status).toBe(409)
    expect((await db.videomaker.findUniqueOrThrow({ where: { id: vm } })).avaliacao).toBe(4.8)
  })
})

describe("sair da rede", () => {
  it("some da busca de C; A e B, que já o têm, continuam vendo", async () => {
    como(uVm, A, "videomaker")
    expect((await json(await agirNaRede(post("/api/me/rede", { acao: "participacao", naRede: false })))).corpo.naRede).toBe(false)

    como(uC, C)
    const busca = await json(await buscaRede(get("/api/rede/videomakers")))
    expect(busca.corpo.videomakers.map((v: { id: string }) => v.id)).not.toContain(vm)
    expect((await convidar(post("/api/rede/convites", { videomakerId: vm }))).status).toBe(404)

    for (const [u, org] of [[uA, A], [uB, B]]) {
      como(u, org)
      const lista = await json(await listaDaEmpresa(get("/api/videomakers")))
      expect(lista.corpo.videomakers.map((v: { id: string }) => v.id)).toContain(vm)
    }

    como(uVm, A, "videomaker")
    await agirNaRede(post("/api/me/rede", { acao: "participacao", naRede: true }))
    como(uC, C)
    expect((await json(await buscaRede(get("/api/rede/videomakers")))).corpo.videomakers.map((v: { id: string }) => v.id)).toContain(vm)
  })
})

describe("no banco, como a aplicação (app_user)", () => {
  it("contestação é fechada; convite da rede é por empresa; score devolve só número", async () => {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST })
    await c.connect()
    try {
      await c.query("BEGIN")
      await c.query("SET LOCAL ROLE app_user")
      await c.query(`SELECT set_config('app.org_id', $1, true)`, [B])
      const score = await c.query(`SELECT * FROM public.score_rede('videomaker', ARRAY[$1])`, [vm])
      expect(score.fields.map(f => f.name)).toEqual(["id", "media", "avaliacoes"])
      const convA = await c.query(`SELECT count(*)::int n FROM convites_rede WHERE "organizacaoId" = $1`, [A])
      expect(convA.rows[0].n).toBe(0)
      await c.query("SAVEPOINT s")
      await expect(c.query("SELECT count(*) FROM contestacoes_avaliacao")).rejects.toThrow(/permission denied/)
      await c.query("ROLLBACK TO s")
      await expect(c.query(`INSERT INTO convites_rede (id, "organizacaoId", "videomakerId", "updatedAt") VALUES ('x', $1, $2, now())`, [A, vm])).rejects.toThrow(/row-level security/)
    } finally {
      await c.query("ROLLBACK").catch(() => {})
      await c.end()
    }
  })
})
