import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }))
vi.mock("@/lib/prisma-auth", () => ({ prismaAuth: { organizacao: { findUnique: mocks.findUnique } } }))
vi.mock("@/lib/org", () => ({ SLUG_ORG_PADRAO: "padrao" }))

import { empresaDoPortal, empresaDestino } from "@/lib/portal"
import { GET } from "@/app/api/publico/empresa/route"
import { NextRequest } from "next/server"

const ativa = { nome: "Clínica B", slug: "clinica-b", logoUrl: null, ativo: true }

beforeEach(() => {
  mocks.findUnique.mockReset()
  mocks.findUnique.mockImplementation(async ({ where }: { where: { slug: string } }) =>
    where.slug === "clinica-b" ? ativa : where.slug === "desligada" ? { ...ativa, slug: "desligada", ativo: false } : where.slug === "padrao" ? { ...ativa, nome: "Padrão", slug: "padrao" } : null)
})

describe("área pública da empresa", () => {
  it("mostra só nome, slug e logo da empresa ativa", async () => {
    expect(await empresaDoPortal("clinica-b")).toEqual({ nome: "Clínica B", slug: "clinica-b", logoUrl: null })
  })

  it("empresa desligada e slug desconhecido respondem como inexistentes", async () => {
    expect(await empresaDoPortal("desligada")).toBeNull()
    expect(await empresaDoPortal("nao-existe")).toBeNull()
  })

  it("slug fora do formato nem chega ao banco", async () => {
    for (const s of ["", "  ", "A B", "a_b", "-x", "../x", "x".repeat(70)]) expect(await empresaDoPortal(s), s).toBeNull()
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  it("link sem slug mostra a empresa padrão; slug errado NÃO cai na padrão", async () => {
    expect((await empresaDestino(null))?.slug).toBe("padrao")
    expect((await empresaDestino(""))?.slug).toBe("padrao")
    expect(await empresaDestino("nao-existe")).toBeNull()
  })

  it("a rota pública devolve 404 para empresa inexistente e nada além da identidade", async () => {
    const ok = await GET(new NextRequest("http://x/api/publico/empresa?org=clinica-b"))
    expect(ok.status).toBe(200)
    expect(Object.keys((await ok.json()).empresa).sort()).toEqual(["logoUrl", "nome", "slug"])
    expect((await GET(new NextRequest("http://x/api/publico/empresa?org=desligada"))).status).toBe(404)
  })
})
