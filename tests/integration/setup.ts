import { beforeAll, vi } from "vitest"

// Integração com banco real; serviços externos nunca são chamados nesta suíte.
vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Chamadas externas bloqueadas na integração sintética") }))

vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), after: vi.fn() }))

// Os tetos por IP (limites_publicos) ficam no banco entre arquivos e entre
// rodadas: todos os testes chegam do mesmo "IP", e a segunda rodada em menos de
// 15 minutos batia no teto do login, do "esqueci a senha" e das rotas abertas
// por token. Cada arquivo começa com a contagem zerada (os arquivos rodam em
// fila: fileParallelism false).
beforeAll(async () => {
  const { default: pg } = await import("pg")
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST })
  await c.connect()
  try { await c.query("DELETE FROM limites_publicos") } finally { await c.end() }
})
