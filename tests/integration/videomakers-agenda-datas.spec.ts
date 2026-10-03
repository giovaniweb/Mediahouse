import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Hotfix de 02/10/2026, quatro regras de servidor achadas na migração do visual:
//   1. candidato pendente de uma empresa aparecia e era aprovado por outra;
//   2. DELETE do videomaker apagava o perfil da rede inteira;
//   3. a agenda filtrava por contenção e sumia com compromisso que atravessa a janela;
//   4. o Histórico cortava o dia em UTC, não em Brasília.
const { estado } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel?: string } }, cookie: undefined as string | undefined },
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.cookie ? { value: estado.cookie } : undefined) }) }))
// Aprovar cria conta e manda credencial por WhatsApp: nada disso sai do teste.
vi.mock("@/lib/user-helpers", () => ({
  criarUsuarioParaProfissional: vi.fn(async () => ({ jáExistia: true, senha: null, usuario: { email: null } })),
  notificarCredenciaisWhatsapp: vi.fn(async () => false),
}))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as listarVideomakers } from "@/app/api/videomakers/route"
import { POST as aprovar } from "@/app/api/videomakers/[id]/aprovar/route"
import { PUT as editarVideomaker, DELETE as excluirVideomaker } from "@/app/api/videomakers/[id]/route"
import { GET as agendaGET } from "@/app/api/agenda/route"
import { GET as demandasGET } from "@/app/api/demandas/route"

const prefix = `vm-${randomUUID()}`
const orgA = `${prefix}-a`, orgB = `${prefix}-b`
const adminA = `${prefix}-adm-a`, adminB = `${prefix}-adm-b`
const candidatoB = `${prefix}-cand-b`, compartilhado = `${prefix}-comp`, soDeA = `${prefix}-so-a`

const como = (usuario: string, org: string) => {
  estado.sessao = { user: { id: usuario, organizacaoId: org, tipo: "admin", papel: "admin" } }
  estado.cookie = org
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://localhost${url}`, init)

beforeAll(async () => {
  await db.organizacao.createMany({ data: [orgA, orgB].map((id) => ({ id, nome: id, slug: id })) })
  await db.usuario.createMany({ data: [adminA, adminB].map((id) => ({ id, nome: id, tipo: "admin" as const, senhaHash: "sem-login-real" })) })
  await db.usuarioOrganizacao.createMany({ data: [
    { usuarioId: adminA, organizacaoId: orgA, papel: "admin", areas: [] },
    { usuarioId: adminB, organizacaoId: orgB, papel: "admin", areas: [] },
  ] })
  await db.videomaker.createMany({ data: [
    { id: candidatoB, nome: "Candidato da B", status: "pendente" },
    { id: compartilhado, nome: "Trabalha com A e B", status: "ativo" },
    { id: soDeA, nome: "Só da A", status: "ativo" },
  ] })
  await db.videomakerOrganizacao.createMany({ data: [
    { organizacaoId: orgB, videomakerId: candidatoB, status: "pendente" },
    { organizacaoId: orgA, videomakerId: compartilhado, status: "ativo" },
    { organizacaoId: orgB, videomakerId: compartilhado, status: "ativo" },
    { organizacaoId: orgA, videomakerId: soDeA, status: "ativo" },
  ] })
})
afterAll(async () => {
  await db.demanda.deleteMany({ where: { organizacaoId: { in: [orgA, orgB] } } })
  await db.evento.deleteMany({ where: { organizacaoId: { in: [orgA, orgB] } } })
  await db.videomaker.deleteMany({ where: { id: { in: [candidatoB, compartilhado, soDeA] } } })
  await db.organizacao.deleteMany({ where: { id: { in: [orgA, orgB] } } })
  await db.usuario.deleteMany({ where: { id: { in: [adminA, adminB] } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
beforeEach(() => como(adminA, orgA))

describe("candidato pendente pertence à empresa que o recebeu", () => {
  it("a lista de pendentes não mostra o candidato de outra empresa", async () => {
    const idsA = (await (await listarVideomakers(req("/api/videomakers?status=pendente"))).json()).videomakers.map((v: { id: string }) => v.id)
    expect(idsA).not.toContain(candidatoB)
    const todosA = (await (await listarVideomakers(req("/api/videomakers"))).json()).videomakers.map((v: { id: string }) => v.id)
    expect(todosA).not.toContain(candidatoB)
    expect(todosA).toContain(compartilhado)

    como(adminB, orgB)
    const idsB = (await (await listarVideomakers(req("/api/videomakers?status=pendente"))).json()).videomakers.map((v: { id: string }) => v.id)
    expect(idsB).toContain(candidatoB)
  })

  it("gestor de outra empresa não aprova; a dona aprova perfil e vínculo juntos, uma vez só", async () => {
    expect((await aprovar(req("/x", { method: "POST" }), params(candidatoB))).status).toBe(404)
    expect((await db.videomaker.findUniqueOrThrow({ where: { id: candidatoB } })).status).toBe("pendente")

    como(adminB, orgB)
    expect((await aprovar(req("/x", { method: "POST" }), params(candidatoB))).status).toBe(200)
    expect((await db.videomaker.findUniqueOrThrow({ where: { id: candidatoB } })).status).toBe("ativo")
    const vinculo = await db.videomakerOrganizacao.findUniqueOrThrow({ where: { organizacaoId_videomakerId: { organizacaoId: orgB, videomakerId: candidatoB } } })
    expect(vinculo.status).toBe("ativo")
    expect((await aprovar(req("/x", { method: "POST" }), params(candidatoB))).status).toBe(404)
  })
})

describe("excluir não apaga o profissional de outras empresas", () => {
  it("perfil usado por outra empresa recusa com 409 e nada é apagado", async () => {
    const res = await excluirVideomaker(req("/x", { method: "DELETE" }), params(compartilhado))
    expect(res.status).toBe(409)
    expect(await db.videomaker.count({ where: { id: compartilhado } })).toBe(1)
    expect(await db.videomakerOrganizacao.count({ where: { videomakerId: compartilhado } })).toBe(2)
  })

  it("vínculo explícito basta para a própria empresa editar o candidato", async () => {
    const res = await editarVideomaker(req("/x", { method: "PUT", body: JSON.stringify({ observacoes: "conferido" }) }), params(soDeA))
    expect(res.status).toBe(200)
  })

  it("perfil só desta empresa é apagado", async () => {
    expect((await excluirVideomaker(req("/x", { method: "DELETE" }), params(soDeA))).status).toBe(200)
    expect(await db.videomaker.count({ where: { id: soDeA } })).toBe(0)
  })
})

describe("agenda por interseção com o período", () => {
  it("devolve o que começa antes, o que atravessa e o que está dentro; deixa de fora o que não toca", async () => {
    const ev = (titulo: string, inicio: string, fim: string) => db.evento.create({ data: { organizacaoId: orgA, titulo: `${prefix}-${titulo}`, inicio: new Date(inicio), fim: new Date(fim) } })
    await ev("antes", "2026-09-27T12:00:00Z", "2026-09-29T12:00:00Z")
    await ev("atravessa", "2026-09-25T12:00:00Z", "2026-10-10T12:00:00Z")
    await ev("dentro", "2026-09-30T12:00:00Z", "2026-09-30T13:00:00Z")
    await ev("fora", "2026-10-06T12:00:00Z", "2026-10-06T13:00:00Z")
    const res = await agendaGET(req("/api/agenda?inicio=2026-09-28T03:00:00.000Z&fim=2026-10-05T02:59:59.999Z"))
    expect(res.status).toBe(200)
    const titulos = ((await res.json()) as { titulo: string }[] | { eventos: { titulo: string }[] })
    const lista = Array.isArray(titulos) ? titulos : titulos.eventos
    const nomes = lista.map((e) => e.titulo.replace(`${prefix}-`, "")).sort()
    expect(nomes).toEqual(["antes", "atravessa", "dentro"])
  })

  it("período pela metade, inválido ou invertido é 400", async () => {
    expect((await agendaGET(req("/api/agenda?inicio=2026-09-28T00:00:00Z"))).status).toBe(400)
    expect((await agendaGET(req("/api/agenda?inicio=amanha&fim=depois"))).status).toBe(400)
    expect((await agendaGET(req("/api/agenda?inicio=2026-10-05T00:00:00Z&fim=2026-09-28T00:00:00Z"))).status).toBe(400)
  })
})

describe("Histórico usa o dia de Brasília", () => {
  it("'até 02/10' inclui 23h30 de Brasília e exclui 00h30 do dia 3", async () => {
    const dem = (sufixo: string, finalizadaEm: string) => db.demanda.create({ data: {
      organizacaoId: orgA, solicitanteId: adminA, codigo: `${prefix}-${sufixo}`, titulo: sufixo, descricao: "Teste",
      departamento: "growth", tipoVideo: "reels", cidade: "Teste", statusVisivel: "finalizado", finalizadaEm: new Date(finalizadaEm),
    } })
    await dem("dia2-noite", "2026-10-03T02:30:00Z") // 02/10 23h30 em Brasília
    await dem("dia3-madrugada", "2026-10-03T03:30:00Z") // 03/10 00h30 em Brasília
    await dem("dia1-noite", "2026-10-02T02:30:00Z") // 01/10 23h30 em Brasília
    const res = await demandasGET(req("/api/demandas?de=2026-10-02&ate=2026-10-02&statusVisivel=finalizado"))
    expect(res.status).toBe(200)
    const corpo = await res.json()
    const lista = (Array.isArray(corpo) ? corpo : corpo.demandas) as { codigo: string }[]
    const codigos = lista.map((d) => d.codigo).filter((c) => c.startsWith(prefix)).map((c) => c.replace(`${prefix}-`, ""))
    expect(codigos).toEqual(["dia2-noite"])
  })

  it("data fora do formato é 400", async () => {
    expect((await demandasGET(req("/api/demandas?de=02/10/2026"))).status).toBe(400)
  })
})
