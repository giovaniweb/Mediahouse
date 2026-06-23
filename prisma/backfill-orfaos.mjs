// S11 — backfill cirúrgico de registros órfãos (organizacaoId = null) → Contourline.
// Dados anteriores à multiempresa pertencem à Contourline (única org original).
// NÃO mexe em memberships (não vincula o admin de teste à Contourline).
// Idempotente. Rodar:  node prisma/backfill-orfaos.mjs
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

// Modelos privados que devem sempre ter organizacaoId (órfãos = legado Contourline)
const MODELOS = [
  "demanda", "eventoCobertura", "editor", "designer", "custoVideomaker", "produto",
  "evento", "alertaIA", "ideiaVideo", "fornecedor", "eventoGestao", "relatorioIA",
  "producaoManual", "mensagemWhatsapp", "contatoWhatsApp", "configEmpresa", "configEmail",
]

async function main() {
  const contour = await prisma.organizacao.findUnique({ where: { slug: "contourline" }, select: { id: true } })
  if (!contour) { console.error("Contourline não encontrada"); process.exit(1) }

  let total = 0
  for (const modelo of MODELOS) {
    try {
      const r = await prisma[modelo].updateMany({ where: { organizacaoId: null }, data: { organizacaoId: contour.id } })
      if (r.count > 0) { console.log(`✅ ${modelo}: ${r.count} órfão(s) → Contourline`); total += r.count }
    } catch (e) {
      // modelo pode não ter organizacaoId — ignora
      if (!String(e).includes("Unknown")) console.log(`• ${modelo}: pulado (${String(e).slice(0, 60)})`)
    }
  }
  console.log(`\n🏁 Backfill concluído: ${total} registro(s) reatribuído(s) à Contourline`)
}

main()
  .catch((e) => { console.error("❌ Erro:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
