import { config } from "dotenv"

// Carrega .env.local primeiro (padrão Next.js), depois .env como fallback
config({ path: ".env.local" })
config({ path: ".env" })

import { defineConfig } from "prisma/config"

// O CLI do Prisma (migrate) precisa de conexão DIRETA. DATABASE_URL aponta para o
// pooler em modo transação (pgbouncer=true, porta 6543), onde migrations não
// funcionam — por isso não existe fallback aqui: usar a URL errada seria pior do
// que falhar. O build da Vercel roda `prisma migrate deploy`, então esta variável
// precisa existir no ambiente de deploy.
if (!process.env.DIRECT_URL) {
  throw new Error(
    "DIRECT_URL não está definida.\n" +
      "É a conexão direta com o Postgres (Supabase: porta 5432, sem pgbouncer), usada por " +
      "`prisma migrate`. Defina-a no ambiente — inclusive nas variáveis do projeto na Vercel, " +
      "porque o buildCommand executa `prisma migrate deploy`."
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
