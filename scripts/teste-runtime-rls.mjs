// Bootstrap administrativo apenas de fixtures/roles no banco descartável.
// As provas Prisma conectam por LOGIN próprio, sem SET ROLE e sem bypass.
import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import pg from "pg"
import { validarBancoTeste } from "./lib/banco-teste.mjs"
const url = validarBancoTeste(process.env.DATABASE_URL_TEST)
const db = new pg.Client({ connectionString: url })
const sufixo = randomBytes(6).toString("hex")
const app = `teste_app_${sufixo}`, auth = `teste_auth_${sufixo}`
const senha = randomBytes(24).toString("hex")
const conexao = role => { const u = new URL(url); u.username = role; u.password = senha; return u.toString() }
try {
  await db.connect()
  for (const [role, grupo] of [[app,"app_user"],[auth,"app_auth"]]) {
    await db.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${senha}'`)
    await db.query(`GRANT "${grupo}" TO "${role}"`)
  }
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "test",
    DATABASE_URL_TEST: url, DATABASE_URL: conexao(app), AUTH_DATABASE_URL: conexao(auth), DIRECT_URL: url, RLS_ATIVO: "sim",
    AUTH_SECRET: "segredo-sintetico-runtime-local" }
  const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.runtime.config.mts"], { env, stdio: "inherit" })
  const codigo = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve) })
  process.exitCode = codigo ?? 1
  if (codigo === 0) {
    const prova = spawn(process.execPath, ["scripts/verificar-runtime-rls.mjs"], { env, stdio: "inherit" })
    process.exitCode = await new Promise((resolve, reject) => { prova.on("error", reject); prova.on("exit", c => resolve(c ?? 1)) })
  }
} finally {
  for (const role of [app,auth]) await db.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => { process.exitCode = 1 })
  await db.end()
}
