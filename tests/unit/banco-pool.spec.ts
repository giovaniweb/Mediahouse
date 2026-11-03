import { afterEach, describe, expect, it, vi } from "vitest"
import type { Pool } from "pg"

// O incidente de 03/11/2026 (EMAXCONN, 200 clientes no pooler) veio de Pools
// demais por instância e de conexões ociosas presas em instância congelada.
// Aqui se prova o desenho sem banco: quantos Pools nascem, com que teto, e que
// cada um é entregue ao `attachDatabasePool` uma vez só.
const { anexar } = vi.hoisted(() => ({ anexar: vi.fn() }))
vi.mock("@vercel/functions/db-connections", () => ({ attachDatabasePool: anexar }))

const globalPools = globalThis as unknown as { nuflowPools?: Map<string, Pool> }
const legado = { DATABASE_URL: "postgresql://app@pooler:6543/postgres", DIRECT_URL: "postgresql://dono@pooler:5432/postgres" }

afterEach(async () => {
  await Promise.all([...(globalPools.nuflowPools?.values() ?? [])].map(p => p.end()))
  delete globalPools.nuflowPools
  anexar.mockClear()
  vi.resetModules()
})

describe("um Pool por URL no processo", () => {
  it("app e auth dividem o Pool enquanto o RLS está desligado; admin fica no seu", async () => {
    const { poolDoBanco } = await import("@/lib/banco-pool")
    const app = poolDoBanco("app", legado)
    expect(poolDoBanco("auth", legado)).toBe(app)
    expect(poolDoBanco("admin", legado)).not.toBe(app)
    expect(globalPools.nuflowPools?.size).toBe(2)
    expect(anexar).toHaveBeenCalledTimes(2)
  })

  it("com RLS cada papel tem a sua URL e o seu Pool", async () => {
    const { poolDoBanco } = await import("@/lib/banco-pool")
    const env = { RLS_ATIVO: "sim", DATABASE_URL: "postgresql://app_user@p/x", AUTH_DATABASE_URL: "postgresql://app_auth@p/x", ADMIN_DATABASE_URL: "postgresql://admin@p/x" }
    const pools = new Set((["app", "auth", "admin"] as const).map(t => poolDoBanco(t, env)))
    expect(pools.size).toBe(3)
  })

  it("o Next avaliar o arquivo de novo não abre outro Pool", async () => {
    const primeira = await import("@/lib/banco-pool")
    const pool = primeira.poolDoBanco("app", legado)
    vi.resetModules()
    const segunda = await import("@/lib/banco-pool")
    expect(segunda).not.toBe(primeira)
    expect(segunda.poolDoBanco("app", legado)).toBe(pool)
    expect(anexar).toHaveBeenCalledTimes(1)
  })

  it("teto de 5 conexões e ociosa fechando em 5 s", async () => {
    const { poolDoBanco } = await import("@/lib/banco-pool")
    const { options } = poolDoBanco("app", legado) as Pool & { options: { max: number; idleTimeoutMillis: number } }
    expect(options.max).toBe(5)
    expect(options.idleTimeoutMillis).toBe(5_000)
  })

  it("conexão ociosa derrubada pelo pooler vira log, não queda do processo", async () => {
    const { poolDoBanco } = await import("@/lib/banco-pool")
    const pool = poolDoBanco("app", legado)
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => pool.emit("error", new Error("server closed the connection"))).not.toThrow()
    expect(log).toHaveBeenCalledWith("[banco] conexão ociosa caiu (app):", "server closed the connection")
    log.mockRestore()
  })

  it("o Prisma usa o Pool entregue em vez de abrir outro", async () => {
    const { adapterDoBanco, poolDoBanco } = await import("@/lib/banco-pool")
    const pool = poolDoBanco("app", legado)
    const adapter = await adapterDoBanco("auth", legado).connect()
    expect(adapter.underlyingDriver()).toBe(pool)
    await adapter.dispose()
  })
})
