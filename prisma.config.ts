import { config } from "dotenv"

// Carrega .env.local primeiro (padrão Next.js), depois .env como fallback
config({ path: ".env.local" })
config({ path: ".env" })

import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL!, // URL direta para CLI (migrate/db push)
  },
})
