// Growth — backfill de Linhas/Projetos a partir do texto livre `linhaProjeto` já
// existente nas demandas, POR organização. Idempotente. Não apaga o texto antigo.
// Rodar:  node prisma/backfill-linhas-projeto.mjs
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const norm = (s) => s.trim().replace(/\s+/g, " ")

async function main() {
  // Demandas com texto preenchido e sem referência ainda
  const demandas = await prisma.demanda.findMany({
    where: { linhaProjeto: { not: null }, linhaProjetoId: null, organizacaoId: { not: null } },
    select: { id: true, organizacaoId: true, linhaProjeto: true },
  })
  console.log(`Demandas a processar: ${demandas.length}`)

  let linhasCriadas = 0, vinculadas = 0
  // cache por (org|nomeNorm)
  const cache = new Map()

  for (const d of demandas) {
    const nome = norm(d.linhaProjeto || "")
    if (!nome) continue
    const key = `${d.organizacaoId}|${nome.toLowerCase()}`
    let linhaId = cache.get(key)
    if (!linhaId) {
      // find-or-create por (org, nome) — case-insensitive
      const existentes = await prisma.linhaProjeto.findMany({
        where: { organizacaoId: d.organizacaoId },
        select: { id: true, nome: true },
      })
      const achou = existentes.find((l) => l.nome.toLowerCase() === nome.toLowerCase())
      if (achou) {
        linhaId = achou.id
      } else {
        const nova = await prisma.linhaProjeto.create({
          data: { organizacaoId: d.organizacaoId, nome },
          select: { id: true },
        })
        linhaId = nova.id
        linhasCriadas++
      }
      cache.set(key, linhaId)
    }
    await prisma.demanda.update({ where: { id: d.id }, data: { linhaProjetoId: linhaId } })
    vinculadas++
  }

  console.log(`✅ LinhaProjeto criadas: ${linhasCriadas} | demandas vinculadas: ${vinculadas}`)
}

main()
  .catch((e) => { console.error("❌ Erro:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
