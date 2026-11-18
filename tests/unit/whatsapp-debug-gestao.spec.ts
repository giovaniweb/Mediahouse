import { beforeEach, describe, expect, it, vi } from "vitest"

// Auditoria de 18/11/2026, item 4: qualquer membro lia as últimas 30 mensagens
// do WhatsApp e a config do webhook. Agora só admin/gestor da empresa ativa.
const { sessao, lidas } = vi.hoisted(() => ({ sessao: { atual: null as unknown }, lidas: { n: 0 } }))
vi.mock("@/lib/auth", () => ({ auth: async () => sessao.atual }))
vi.mock("@/lib/org", () => ({ getOrgId: async () => "org-1", semOrg: () => new Response(null, { status: 400 }) }))
vi.mock("@/lib/whatsapp", () => ({ getWhatsappConfig: async () => null }))
vi.mock("@/lib/prisma", () => ({ prisma: { mensagemWhatsapp: { findMany: async () => { lidas.n++; return [] } } } }))

import { GET } from "@/app/api/whatsapp/debug/route"
import { NextRequest } from "next/server"

const como = (papel: string) => { sessao.atual = { user: { id: "u", papel, tipo: "admin" } } }
const chamar = () => GET(new NextRequest("http://x/api/whatsapp/debug"))

describe("whatsapp/debug só para a gestão", () => {
  beforeEach(() => { lidas.n = 0 })
  it.each(["solicitante", "videomaker", "editor", "social"])("%s recebe 403 sem ler nada", async (papel) => {
    como(papel)
    expect((await chamar()).status).toBe(403)
    expect(lidas.n).toBe(0)
  })
  it("tipo global admin não vale sem papel de gestão na empresa ativa", async () => {
    sessao.atual = { user: { id: "u", papel: null, tipo: "admin" } }
    expect((await chamar()).status).toBe(403)
  })
  it.each(["admin", "gestor"])("%s lê", async (papel) => {
    como(papel)
    expect((await chamar()).status).toBe(200)
    expect(lidas.n).toBe(1)
  })
})
