#!/usr/bin/env node
// Guarda contra rodar comando de ESCRITA no banco de produção sem querer.
//
// Por que existe: em 14/08/2026 duas migrations entraram em produção porque
// alguém rodou `prisma migrate deploy` achando que ia para o banco local. O
// prisma.config.ts carrega `.env.local` PRIMEIRO (padrão do Next.js) e só depois
// `.env` — então o comando aponta para produção por padrão, e nada avisa.
//
// Foram operações aditivas e ninguém perdeu dado, mas o próximo comando pode não
// ser. `migrate reset` apaga o banco inteiro com a mesma facilidade.
//
// Uso (via package.json):
//   node scripts/guarda-banco.mjs && prisma migrate deploy
//
// Para liberar conscientemente:
//   PERMITIR_BANCO_PRODUCAO=sim npm run db:deploy

import { config } from "dotenv"

// Mesma ordem que o prisma.config.ts usa — a guarda precisa enxergar o mesmo
// banco que o comando vai atingir, senão protege a coisa errada.
config({ path: ".env.local" })
config({ path: ".env" })

const url = process.env.DIRECT_URL || process.env.DATABASE_URL || ""

if (!url) {
  console.error("\n❌ Sem DIRECT_URL/DATABASE_URL. Nada a fazer.\n")
  process.exit(1)
}

// Sinais de banco gerenciado/remoto. Localhost e o servidor de dev do Prisma
// passam direto — é onde se deve experimentar.
const PISTAS_PRODUCAO = [
  "supabase.com", "supabase.co", "neon.tech", "amazonaws.com",
  "railway.app", "render.com", "planetscale", "azure.com", "googleapis.com",
]

let host = "?"
try {
  host = new URL(url).host
} catch {
  // prisma+postgres://... do servidor local de dev não parseia como URL comum.
  host = url.slice(0, 40)
}

const ehLocal = /localhost|127\.0\.0\.1|prisma\+postgres/.test(url)
const ehProducao = !ehLocal && PISTAS_PRODUCAO.some((p) => url.includes(p))

if (!ehProducao) {
  console.log(`✅ Banco local (${host}) — pode seguir.`)
  process.exit(0)
}

if (process.env.PERMITIR_BANCO_PRODUCAO === "sim") {
  console.log(`\n⚠️  PRODUÇÃO liberada explicitamente: ${host}`)
  console.log("   Prosseguindo porque PERMITIR_BANCO_PRODUCAO=sim.\n")
  process.exit(0)
}

console.error(`
╔════════════════════════════════════════════════════════════════════╗
║  🛑 ESTE COMANDO IA ESCREVER NO BANCO DE PRODUÇÃO                  ║
╚════════════════════════════════════════════════════════════════════╝

   Destino: ${host}

   O prisma.config.ts carrega .env.local (produção) antes do .env —
   então comando de banco aponta para produção por padrão.

   Se é isso mesmo que você quer, combine a janela e rode:

     PERMITIR_BANCO_PRODUCAO=sim npm run <comando>

   Para trabalhar no banco local, use o DATABASE_URL do .env.
`)
process.exit(1)
