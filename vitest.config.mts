import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

// Dois níveis de teste, com custos e pré-requisitos diferentes:
//   tests/unit        — lógica pura, roda em qualquer lugar, sem banco.
//   tests/integration — precisa de Postgres (DATABASE_URL_TEST); roda no CI.
// `npm test` executa só os unitários, para não falhar na máquina de quem não tem
// Postgres local; `npm run test:integration` roda os demais.
export default defineConfig({
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.spec.ts"],
    globals: false,
    env: {
      // Os módulos sob teste importam src/lib/prisma, que constrói o adapter na
      // carga. Nenhum teste unitário abre conexão — a URL só precisa existir.
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://teste:teste@localhost:5432/teste",
      DIRECT_URL: process.env.DIRECT_URL ?? "postgresql://teste:teste@localhost:5432/teste",
    },
  },
})
