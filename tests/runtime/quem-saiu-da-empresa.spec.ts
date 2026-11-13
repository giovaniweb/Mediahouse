// Responsável que saiu da empresa, pelo login real da aplicação (RLS ligada).
//
// "Remover da empresa" apaga o vínculo de quem também trabalha em outra empresa,
// mas os cards em que a pessoa era responsável continuam apontando para ela.
// Com RLS, a linha dela em `usuarios` deixa de ser visível nesta empresa, e o
// Prisma devolve `usuario: null` mesmo numa relação obrigatória. O quadro da
// Social lia `r.usuario.nome` e caía com 500 (achado no ensaio de novembro).
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const sessao = vi.hoisted(() => ({ atual: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.atual }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))

import { prisma, prismaBase } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { comOrg } from "@/lib/org-contexto"
import { GET as quadroSocial } from "@/app/api/social/route"

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST }) })
const p = `saiu-${randomUUID().slice(0, 8)}`
const a = `${p}-a`, b = `${p}-b`, gestor = `${p}-g`, social = `${p}-s`, saiu = `${p}-x`, linha = `${p}-l`, card = `${p}-d`

beforeAll(async () => {
  await admin.organizacao.createMany({ data: [{ id: a, nome: "Empresa", slug: a }, { id: b, nome: "Outra", slug: b }] })
  await admin.usuario.createMany({ data: [
    { id: gestor, nome: "Gestora", tipo: "admin", senhaHash: "sem-login-real" },
    { id: social, nome: "Social da linha", tipo: "social", senhaHash: "sem-login-real" },
    { id: saiu, nome: "Quem saiu", tipo: "gestor", senhaHash: "sem-login-real" },
  ] })
  await admin.usuarioOrganizacao.createMany({ data: [
    { usuarioId: gestor, organizacaoId: a, papel: "admin", areas: [] },
    { id: `${p}-vs`, usuarioId: social, organizacaoId: a, papel: "social", areas: [] },
    // "Quem saiu" agora só está na outra empresa: o vínculo com A foi removido.
    { usuarioId: saiu, organizacaoId: b, papel: "gestor", areas: [] },
  ] })
  await admin.linhaProjeto.create({ data: { id: linha, organizacaoId: a, nome: "Estética" } })
  await admin.socialLinha.create({ data: { organizacaoId: a, usuarioOrganizacaoId: `${p}-vs`, linhaProjetoId: linha } })
  await admin.demanda.create({ data: {
    id: card, codigo: card, titulo: "Pedido da social", descricao: "Arte do pedido", departamento: "growth", tipoVideo: "post",
    cidade: "Teste", organizacaoId: a, solicitanteId: social, socialId: social, linhaProjetoId: linha,
    statusVisivel: "edicao", statusInterno: "editando",
  } })
  await admin.demandaResponsavel.createMany({ data: [{ demandaId: card, usuarioId: saiu }, { demandaId: card, usuarioId: gestor }] })
  sessao.atual = { user: { id: gestor, organizacaoId: a, tipo: "admin", papel: "admin" } }
})

afterAll(async () => {
  await admin.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await admin.usuario.deleteMany({ where: { id: { in: [gestor, social, saiu] } } })
  await Promise.all([admin.$disconnect(), prismaAuth.$disconnect(), prismaBase.$disconnect()])
})

describe("responsável que saiu da empresa, com RLS", () => {
  it("o banco esconde a pessoa: a relação obrigatória volta null", async () => {
    const d = await comOrg(a, () => prisma.demanda.findUniqueOrThrow({
      where: { id: card }, select: { responsaveis: { select: { usuarioId: true, usuario: { select: { nome: true } } } } },
    }))
    expect(d.responsaveis.find((r) => r.usuarioId === saiu)?.usuario).toBeNull()
  })

  it("o quadro da Social abre e mostra quem continua na empresa", async () => {
    // A empresa vem declarada como no servidor (lá, pela sessão; aqui, fora de
    // uma requisição do Next, a sessão não é resolvida pela extensão).
    const r = await comOrg(a, () => quadroSocial())
    expect(r.status).toBe(200)
    const texto = JSON.stringify(await r.json()); console.log("QUADRO", texto.slice(0, 900))
    expect(texto).toContain(card)
    expect(texto).toContain("Gestora")
    expect(texto).not.toContain("Quem saiu")
  })
})
