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

// ── Build da Vercel: NUNCA migra. Não há variável que libere. ────────────────
//
// Em 20/08/2026 um push numa branch não mergeada aplicou um DROP COLUMN em
// produção: o push disparou um build de PREVIEW, e o buildCommand tinha
// `prisma migrate deploy` apontando para o banco real. Ninguém revisou, ninguém
// aprovou, e a operação era irreversível.
//
// A correção estrutural foi tirar a migration do buildCommand (vercel.json).
// Esta trava é a segunda linha: se alguém devolver a migration para o build um
// dia, ela não roda. Sem escape de propósito — build gera artefato, release
// muda banco, e o release mora em .github/workflows/release-migrations.yml.
if (process.env.VERCEL) {
  console.error(`
╔════════════════════════════════════════════════════════════════════╗
║  🛑 BUILD DA VERCEL NÃO MIGRA BANCO                                ║
╚════════════════════════════════════════════════════════════════════╝

   Destino que seria atingido: ${host}
   Ambiente Vercel: ${process.env.VERCEL_ENV ?? "desconhecido"}

   Migration é passo de RELEASE, não de build. Um build de preview de
   qualquer branch chega ao banco — foi assim que um DROP COLUMN entrou
   em produção sem revisão em 20/08/2026.

   Aplique por .github/workflows/release-migrations.yml, que exige
   aprovação humana. Não existe variável para liberar aqui.
`)
  process.exit(1)
}

const ehLocal = /localhost|127\.0\.0\.1|prisma\+postgres/.test(url)
const ehProducao = !ehLocal && PISTAS_PRODUCAO.some((p) => url.includes(p))

if (!ehProducao) {
  console.log(`✅ Banco local (${host}) — pode seguir.`)
  process.exit(0)
}

// ── CI tocando produção: exige o marcador do workflow de release ─────────────
//
// PERMITIR_BANCO_PRODUCAO=sim é a liberação de quem está no teclado e sabe o
// que vai rodar. Num runner não há ninguém no teclado, então ela sozinha não
// basta: o workflow de release define também RELEASE_AUTORIZADO=sim, e ele é o
// único que passa pelo gate de aprovação do GitHub Environment.
if (process.env.GITHUB_ACTIONS && process.env.RELEASE_AUTORIZADO !== "sim") {
  console.error(`
╔════════════════════════════════════════════════════════════════════╗
║  🛑 CI NÃO ESCREVE EM PRODUÇÃO SEM PASSAR PELO RELEASE             ║
╚════════════════════════════════════════════════════════════════════╝

   Destino: ${host}
   Workflow: ${process.env.GITHUB_WORKFLOW ?? "?"}

   Só o workflow de release define RELEASE_AUTORIZADO=sim, e ele fica
   parado até alguém aprovar no GitHub Environment "producao".

   Se este passo precisa mesmo escrever em produção, ele deveria estar
   em .github/workflows/release-migrations.yml — não aqui.
`)
  process.exit(1)
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
