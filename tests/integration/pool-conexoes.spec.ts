import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Client } from "pg"
import { prismaBase } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { prismaAdmin } from "@/lib/prisma-admin"
import { LIMITE_POOL, poolDoBanco } from "@/lib/banco-pool"

// 03/11/2026: um deploy no expediente esgotou os 200 clientes do pooler
// (EMAXCONN) por quatro minutos. Cada cliente Prisma abria o próprio Pool de 10.
// Aqui, banco real: os três clientes (mesma URL nesta suíte) disputam um Pool
// só, que nunca passa do teto, e as conexões ociosas fecham sozinhas.
const medidor = new Client({ connectionString: process.env.DATABASE_URL })
const conexoesDoApp = async () => {
  const { rows: [r] } = await medidor.query<{ n: number }>(
    "SELECT count(*)::int n FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()",
  )
  return r.n
}

beforeAll(() => medidor.connect())
afterAll(() => medidor.end())

describe("Pool compartilhado no banco real", () => {
  it("trinta consultas simultâneas de app, auth e admin não passam de 5 conexões", async () => {
    const pool = poolDoBanco("app")
    expect(poolDoBanco("auth")).toBe(pool)
    expect(poolDoBanco("admin")).toBe(pool)

    const clientes = [prismaBase, prismaAuth, prismaAdmin]
    let picoNoBanco = 0
    let medindo = true
    const amostras = (async () => {
      while (medindo) {
        picoNoBanco = Math.max(picoNoBanco, await conexoesDoApp())
        await new Promise(r => setTimeout(r, 10))
      }
    })()
    await Promise.all(Array.from({ length: 30 }, (_, i) => clientes[i % 3].$queryRaw`SELECT pg_sleep(0.05)::text`))
    medindo = false
    await amostras

    expect(picoNoBanco).toBeGreaterThan(1)
    expect(picoNoBanco).toBeLessThanOrEqual(LIMITE_POOL.max)
    expect(pool.totalCount).toBeLessThanOrEqual(LIMITE_POOL.max)
  })

  it("conexão ociosa fecha sozinha depois de 5 s", async () => {
    const pool = poolDoBanco("app")
    await prismaBase.$queryRaw`SELECT 1`
    expect(await conexoesDoApp()).toBeGreaterThan(0)
    await new Promise(r => setTimeout(r, LIMITE_POOL.idleTimeoutMillis + 500))
    expect(pool.totalCount).toBe(0)
    expect(await conexoesDoApp()).toBe(0)
  }, 15_000)
})
