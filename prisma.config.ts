import { config } from "dotenv"

// Carrega .env.local primeiro (padrão Next.js), depois .env como fallback
config({ path: ".env.local" })
config({ path: ".env" })

import { defineConfig } from "prisma/config"

// O CLI do Prisma (migrate) precisa de conexão DIRETA. DATABASE_URL aponta para o
// pooler em modo transação (pgbouncer=true, porta 6543), onde migrations não
// funcionam — por isso não existe fallback aqui: usar a URL errada seria pior do
// que falhar.
//
// O build da Vercel NÃO roda mais `prisma migrate deploy` — saiu do buildCommand
// depois do incidente de 20/08/2026. Quem aplica migration é o workflow
// .github/workflows/release-migrations.yml, em disparo manual.
if (!process.env.DIRECT_URL) {
  throw new Error(
    "DIRECT_URL não está definida.\n" +
      "É a conexão direta com o Postgres (Supabase: porta 5432, sem pgbouncer), usada por " +
      "`prisma migrate`. Defina-a no ambiente que for rodar o CLI — localmente e no " +
      "environment `producao` do GitHub Actions."
  )
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL, // conexão direta — obrigatória para migrate
  },
})
