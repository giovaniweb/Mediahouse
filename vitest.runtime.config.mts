import { defineConfig } from "vitest/config"
import { resolve } from "node:path"
import { validarBancoTeste } from "./scripts/lib/banco-teste.mjs"
const fixture = new URL(validarBancoTeste(process.env.DATABASE_URL_TEST))
for (const [key, prefix] of [["DATABASE_URL", "teste_app_"], ["AUTH_DATABASE_URL", "teste_auth_"]]) {
  const runtime = new URL(validarBancoTeste(process.env[key]))
  if (runtime.host !== fixture.host || runtime.pathname !== fixture.pathname || !runtime.username.startsWith(prefix)) {
    throw new Error("Runtime de teste deve usar login temporário no mesmo banco descartável")
  }
}
if (process.env.RLS_ATIVO !== "sim") throw new Error("Ensaio runtime exige RLS_ATIVO=sim")
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  test: { environment: "node", include: ["tests/runtime/**/*.spec.ts"], setupFiles: ["tests/integration/setup.ts"], fileParallelism: false },
})
