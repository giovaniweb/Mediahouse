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
// Comandos do CLI que NÃO abrem conexão com o banco: `generate` lê o schema e
// escreve o client, `format`/`validate` mexem só no arquivo. Exigir DIRECT_URL
// deles é pedir uma credencial para um trabalho que não usa credencial nenhuma —
// e era isso que derrubava todo build de preview na Vercel, cujo buildCommand é
// `prisma generate && next build`.
//
// A lista é de EXCEÇÕES, e não de obrigados, de propósito: qualquer comando que
// não esteja aqui continua exigindo a URL direta. Um comando novo do Prisma
// entra no caminho seguro sozinho, em vez de escapar do guard por omissão.
const COMANDOS_SEM_CONEXAO = ["generate", "format", "validate", "version", "--version"]
const comando = process.argv.slice(2).find((a) => !a.startsWith("-")) ?? process.argv[2] ?? ""
const precisaDeConexaoDireta = !COMANDOS_SEM_CONEXAO.includes(comando)

if (precisaDeConexaoDireta && !process.env.DIRECT_URL) {
  throw new Error(
    `DIRECT_URL não está definida (comando: ${comando || "desconhecido"}).\n` +
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
