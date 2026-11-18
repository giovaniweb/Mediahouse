import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Auditoria de 18/11/2026, item 1: o formulário público de pedido não mexe em
// cadastro de ninguém e não puxa pessoa de outra empresa pelo telefone ou
// e-mail digitado. Rota real e banco real; os avisos ficam de fora.
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: () => {} }))
vi.mock("@/lib/whatsapp", () => ({ sendWhatsappMessage: async () => null }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { POST as pedir } from "@/app/api/publico/demanda/route"

const p = `formpub-${randomUUID().slice(0, 8)}`
const A = `${p}-a`, B = `${p}-b`
// Telefones sintéticos únicos por rodada (9 últimos dígitos são os que casam).
const base = String(Date.now()).slice(-7)
const TEL_FORA = `1197${base}`, TEL_MEMBRO = `1196${base}`, TEL_NOVO = `1195${base}`
const deFora = `${p}-de-fora`, membro = `${p}-membro`

let ip = 0
async function enviar(corpo: Record<string, unknown>) {
  const res = await pedir(new NextRequest(`http://localhost/api/publico/demanda?org=${A}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${++ip}` },
    body: JSON.stringify({ titulo: "Vídeo do evento", descricao: "Preciso de um vídeo do evento de sábado.", tipoVideo: "institucional", ...corpo }),
  }))
  expect(res.status).toBe(201)
  const { codigo } = await res.json() as { codigo: string }
  return db.demanda.findFirstOrThrow({ where: { organizacaoId: A, codigo } })
}

beforeAll(async () => {
  vi.stubEnv("NEXTAUTH_SECRET", "segredo-so-do-teste")
  await db.organizacao.createMany({ data: [{ id: A, nome: `${p} A`, slug: A }, { id: B, nome: `${p} B`, slug: B }] })
  // Pessoa de OUTRA empresa, sem e-mail: era o alvo do ataque.
  await db.usuario.create({ data: { id: deFora, nome: "Pessoa de Fora", telefone: TEL_FORA, tipo: "admin", senhaHash: "sintetico" } })
  await db.usuarioOrganizacao.create({ data: { usuarioId: deFora, organizacaoId: B, papel: "admin", areas: [] } })
  // Cliente que já pede pela empresa A.
  await db.usuario.create({ data: { id: membro, nome: "Cliente Antigo", telefone: TEL_MEMBRO, email: `antigo@${p}.test`, tipo: "solicitante", senhaHash: "sintetico" } })
  await db.usuarioOrganizacao.create({ data: { usuarioId: membro, organizacaoId: A, papel: "solicitante", categoria: "solicitante", areas: [] } })
})

afterAll(async () => {
  const ids = (await db.demanda.findMany({ where: { organizacaoId: A }, select: { id: true, solicitanteId: true } }))
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids.map((d) => d.id) } } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: A } })
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: A } })
  await db.demanda.deleteMany({ where: { organizacaoId: A } })
  const criados = ids.map((d) => d.solicitanteId).filter((id): id is string => !!id && id !== membro)
  await db.usuario.deleteMany({ where: { id: { in: [...criados, deFora, membro] } } })
  await db.organizacao.deleteMany({ where: { id: { in: [A, B] } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("formulário público e identidade de quem pede", () => {
  it("telefone de alguém de outra empresa não vincula nem altera essa pessoa", async () => {
    const d = await enviar({ nomeCliente: "Atacante", email: `atacante@${p}.test`, telefone: TEL_FORA })
    expect(d.solicitanteId).not.toBe(deFora)
    // A pessoa de fora continua só na empresa B e sem e-mail.
    expect(await db.usuarioOrganizacao.findMany({ where: { usuarioId: deFora }, select: { organizacaoId: true } })).toEqual([{ organizacaoId: B }])
    expect((await db.usuario.findUniqueOrThrow({ where: { id: deFora } })).email).toBeNull()
    // O solicitante novo é só da empresa A e não leva o telefone que já tem dono
    // (o login por telefone não pode passar a achar a conta nova).
    const novo = await db.usuario.findUniqueOrThrow({ where: { id: d.solicitanteId! }, include: { organizacoes: true } })
    expect(novo.telefone).toBeNull()
    expect(novo.organizacoes.map((o) => [o.organizacaoId, o.papel])).toEqual([[A, "solicitante"]])
    // O contato digitado fica no pedido.
    expect(d.telefoneSolicitante).toBe(TEL_FORA)
    expect(d.descricao).toContain(TEL_FORA)
  })

  it("e-mail de alguém de outra empresa também não vincula", async () => {
    await db.usuario.update({ where: { id: deFora }, data: { email: `fora@${p}.test` } })
    try {
      const d = await enviar({ nomeCliente: "Atacante", email: `FORA@${p}.test`, telefone: `1194${base}` })
      expect(d.solicitanteId).not.toBe(deFora)
      expect(await db.usuarioOrganizacao.count({ where: { usuarioId: deFora, organizacaoId: A } })).toBe(0)
      expect((await db.usuario.findUniqueOrThrow({ where: { id: d.solicitanteId! } })).email).toBeNull()
    } finally {
      await db.usuario.update({ where: { id: deFora }, data: { email: null } })
    }
  })

  it("membro desta empresa é reaproveitado, sem mudar o cadastro", async () => {
    const d = await enviar({ nomeCliente: "Outro Nome", email: `outro@${p}.test`, telefone: TEL_MEMBRO })
    expect(d.solicitanteId).toBe(membro)
    expect(await db.usuario.findUniqueOrThrow({ where: { id: membro } })).toMatchObject({ nome: "Cliente Antigo", email: `antigo@${p}.test`, telefone: TEL_MEMBRO })
  })

  it("contato que ninguém usa vira solicitante novo com telefone e e-mail", async () => {
    const d = await enviar({ nomeCliente: "Cliente Novo", email: `Novo@${p}.test`, telefone: TEL_NOVO })
    const novo = await db.usuario.findUniqueOrThrow({ where: { id: d.solicitanteId! } })
    expect(novo).toMatchObject({ nome: "Cliente Novo", email: `novo@${p}.test`, telefone: TEL_NOVO, tipo: "solicitante" })
    expect(d.descricao).not.toContain("Contato informado")
    // Um segundo pedido com o mesmo telefone acha a mesma pessoa (agora é membro).
    const d2 = await enviar({ nomeCliente: "Cliente Novo", email: `novo@${p}.test`, telefone: TEL_NOVO })
    expect(d2.solicitanteId).toBe(novo.id)
  })
})
