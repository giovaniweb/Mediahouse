import { spawnSync } from "node:child_process"
import { validarBancoTeste } from "./lib/banco-teste.mjs"

const url = validarBancoTeste(process.env.DATABASE_URL_TEST)
const modo = process.argv[2] || "test"
const comandos = {
  test: ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.mts"],
  migrate: ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  rls: ["scripts/verificar-rls.mjs"],
}
if (!comandos[modo]) throw new Error("Modo inválido: test, migrate ou rls")
// Não herdar tokens, chaves de provedores, overrides de RLS ou destino de produção.
const env = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: "test", DATABASE_URL_TEST: url, DATABASE_URL: url,
  DIRECT_URL: url, AUTH_DATABASE_URL: url,
  AUTH_SECRET: "segredo-sintetico-exclusivo-dos-testes-locais",
}
const resultado = spawnSync(process.execPath, comandos[modo], { env, stdio: "inherit" })
if (resultado.error) throw resultado.error
process.exit(resultado.status ?? 1)
