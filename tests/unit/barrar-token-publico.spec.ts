import { beforeEach, describe, expect, it, vi } from "vitest"

// Auditoria de 18/11/2026, item 5: as rotas abertas por token na URL ganham
// teto por IP, contado no banco como os formulários públicos.
vi.mock("@/lib/prisma", () => ({ prismaBase: {} }))

describe("barrarTokenPublico", () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv("AUTH_SECRET", "segredo-sintetico")
  })
  const carregar = () => import("@/lib/limite-publico")

  it("dentro do teto segue; passou, 429 com Retry-After", async () => {
    const { barrarTokenPublico } = await carregar()
    const prisma = await import("@/lib/prisma")
    let n = 0
    Object.assign(prisma.prismaBase, { $queryRaw: async () => [{ ok: ++n <= 1 }] })
    const h = new Headers({ "x-forwarded-for": "203.0.113.9" })
    expect(await barrarTokenPublico(h, "nf-upload", "escrita")).toBeNull()
    const r = await barrarTokenPublico(h, "nf-upload", "escrita")
    expect(r?.status).toBe(429)
    expect(r?.headers.get("Retry-After")).toBe("600")
  })

  it("leitura e escrita contam separadas, por rota", async () => {
    const { barrarTokenPublico } = await carregar()
    const prisma = await import("@/lib/prisma")
    const chaves: string[] = []
    Object.assign(prisma.prismaBase, { $queryRaw: async (_s: TemplateStringsArray, chave: string, max: number) => { chaves.push(`${chave}|${max}`); return [{ ok: true }] } })
    await barrarTokenPublico(new Headers(), "aprovacao-video", "leitura")
    await barrarTokenPublico(new Headers(), "aprovacao-video", "escrita")
    expect(chaves[0]).toMatch(/^token:aprovacao-video:leitura:.+\|120$/)
    expect(chaves[1]).toMatch(/^token:aprovacao-video:escrita:.+\|30$/)
  })
})
