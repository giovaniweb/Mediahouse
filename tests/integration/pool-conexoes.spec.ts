import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Client } from "pg"
import { prismaBase } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { prismaAdmin } from "@/lib/prisma-admin"
import { LIMITE_POOL, TEMPOS_POOL, poolDoBanco } from "@/lib/banco-pool"

// 03/11/2026: um deploy no expediente esgotou os 200 clientes do pooler
// (EMAXCONN) por quatro minutos. Aqui, banco real: cada papel no seu Pool, cada
// Pool no seu teto, transações que seguram conexão sem travar as outras, e as
// conexões ociosas fechando sozinhas.
const medidor = new Client({ connectionString: process.env.DATABASE_URL })
const conexoesNoBanco = async () => {
  const { rows: [r] } = await medidor.query<{ n: number }>(
    "SELECT count(*)::int n FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()",
  )
  return r.n
}
async function comPico<T>(trabalho: () => Promise<T>) {
  const pools = { app: poolDoBanco("app"), auth: poolDoBanco("auth") }
  const pico = { banco: 0, app: 0, auth: 0 }
  let medindo = true
  const amostras = (async () => {
    while (medindo) {
      pico.banco = Math.max(pico.banco, await conexoesNoBanco())
      pico.app = Math.max(pico.app, pools.app.totalCount)
      pico.auth = Math.max(pico.auth, pools.auth.totalCount)
      await new Promise(r => setTimeout(r, 5))
    }
  })()
  try { return { resultado: await trabalho(), pico } } finally { medindo = false; await amostras }
}

beforeAll(() => medidor.connect())
afterAll(() => medidor.end())

describe("Pools no banco real", () => {
  it("cada papel tem o seu Pool, mesmo com a mesma URL", () => {
    const pools = new Set((["app", "auth", "admin"] as const).map(t => poolDoBanco(t)))
    expect(pools.size).toBe(3)
  })

  it("30 transações simultâneas de 400 ms, metade consultando o auth por dentro: nenhuma trava nem estoura o maxWait", async () => {
    const { resultado, pico } = await comPico(() => Promise.allSettled(Array.from({ length: 30 }, (_, i) =>
      prismaBase.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_sleep(0.4)::text`
        if (i % 2) await prismaAuth.usuario.count()
        return tx.organizacao.count()
      }),
    )))
    expect(resultado.filter(r => r.status === "rejected")).toEqual([])
    expect(pico.app).toBe(LIMITE_POOL.app)
    expect(pico.auth).toBeGreaterThan(0)
    expect(pico.auth).toBeLessThanOrEqual(LIMITE_POOL.auth)
    expect(pico.banco).toBeLessThanOrEqual(LIMITE_POOL.app + LIMITE_POOL.auth)
  }, 15_000)

  it("app, auth e admin ao mesmo tempo não passam da soma dos tetos", async () => {
    const clientes = [prismaBase, prismaAuth, prismaAdmin]
    const { pico } = await comPico(() => Promise.all(Array.from({ length: 60 }, (_, i) => clientes[i % 3].$queryRaw`SELECT pg_sleep(0.05)::text`)))
    expect(pico.banco).toBeLessThanOrEqual(LIMITE_POOL.app + LIMITE_POOL.auth + LIMITE_POOL.admin)
  })

  // O padrão que o `auditar:transacoes` barra: cada transação segura a sua
  // conexão e pede outra do mesmo Pool. Com o Pool cheio delas, ninguém anda até
  // vencer um relógio — o da transação ou o da espera por conexão do Pool, o que
  // vier primeiro. Trava com qualquer teto (com o Pool antigo de 10 também).
  //
  // Depois do relógio o travamento se desfaz em cascata: a primeira a falhar
  // devolve a conexão, e a vizinha cujo relógio ainda não venceu pode terminar.
  // QUANTAS falham depende de milissegundos entre os relógios — o CI do #131
  // pegou uma vizinha terminando (05/11). Não se conta falha. Prova-se o que não
  // depende de sorte: ninguém termina antes do relógio, há falha e ela é a desse
  // relógio, tudo termina logo depois dele e o Pool volta a atender.
  it.each([
    { quem: "o timeout da transação", timeout: 5_000, relogio: 5_000, erro: "Transaction API error" },
    { quem: "a espera máxima do Pool", timeout: 20_000, relogio: TEMPOS_POOL.connectionTimeoutMillis, erro: "timeout exceeded when trying to connect" },
  ])("transação que pede uma segunda conexão do próprio cliente: $quem desfaz o travamento e o Pool se recupera", async ({ timeout, relogio, erro }) => {
    // Barreira: todas seguram a sua conexão antes de pedir a segunda, senão a
    // primeira a chegar ainda acha conexão livre e não há travamento.
    let dentro = 0
    let soltar = () => {}
    const todasDentro = new Promise<void>(r => { soltar = r })
    const inicio = performance.now()
    const fim = await Promise.all(Array.from({ length: LIMITE_POOL.app }, () =>
      prismaBase.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1`
        if (++dentro === LIMITE_POOL.app) soltar()
        await todasDentro
        return prismaBase.usuario.count()
      }, { timeout }).then(
        () => ({ em: performance.now() - inicio, erro: null }),
        (e: Error) => ({ em: performance.now() - inicio, erro: e.message }),
      ),
    ))
    const tempos = fim.map(f => f.em)
    const falhas = fim.flatMap(f => (f.erro ? [f.erro] : []))
    expect(Math.min(...tempos)).toBeGreaterThanOrEqual(relogio - 50)
    expect(falhas.length).toBeGreaterThan(0)
    for (const f of falhas) expect(f).toContain(erro)
    expect(Math.max(...tempos)).toBeLessThan(relogio + 2_000)
    await expect(prismaBase.organizacao.count()).resolves.toBeTypeOf("number")
  }, 30_000)

  it("conexão ociosa fecha sozinha depois de 5 s", async () => {
    await Promise.all([prismaBase.$queryRaw`SELECT 1`, prismaAuth.$queryRaw`SELECT 1`, prismaAdmin.$queryRaw`SELECT 1`])
    expect(await conexoesNoBanco()).toBeGreaterThan(0)
    await new Promise(r => setTimeout(r, TEMPOS_POOL.idleTimeoutMillis + 500))
    for (const t of ["app", "auth", "admin"] as const) expect(poolDoBanco(t).totalCount).toBe(0)
    expect(await conexoesNoBanco()).toBe(0)
  }, 15_000)
})
