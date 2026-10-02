import { defineConfig } from "vitest/config"
import { resolve } from "node:path"
import { validarBancoTeste } from "./scripts/lib/banco-teste.mjs"

const url = validarBancoTeste(process.env.DATABASE_URL_TEST)
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.spec.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    env: { DATABASE_URL: url, DIRECT_URL: url, AUTH_DATABASE_URL: url },
  },
})
