/**
 * Faxina única dos alertas que ficaram abertos para sempre.
 *
 * Em 18/08/2026 a base tinha 706 alertas "ativos" de 751, e apenas 18 haviam
 * sido resolvidos em toda a história. Dos 173 de `aprovacao_pendente`, 172
 * falavam de demandas já aprovadas.
 *
 * Este script NÃO tem regra própria: ele chama `resolverAlertas` de
 * `src/lib/alertas.ts`, o mesmo código que roda em produção a cada mutação. É de
 * propósito — se a lógica estiver errada, o número que sobra denuncia aqui, em
 * vez de a faxina "dar certo" com uma regra que o sistema não usa.
 *
 * Uso (mostra o que faria, sem escrever):
 *   npm run faxina:alertas
 *
 * Para aplicar de verdade em produção:
 *   PERMITIR_BANCO_PRODUCAO=sim npm run faxina:alertas -- --aplicar
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { config } from "dotenv"

config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })

const aplicar = process.argv.includes("--aplicar")

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })

  const orgs = await prisma.organizacao.findMany({ select: { id: true, nome: true, slug: true } })

  console.log(aplicar ? "\n▶ APLICANDO\n" : "\n▶ Simulação (nada será escrito — use --aplicar)\n")

  for (const org of orgs) {
    const antes = await prisma.alertaIA.count({ where: { organizacaoId: org.id, status: "ativo" } })

    if (!aplicar) {
      // Simulação de verdade: aplica o MESMO critério da execução e não
      // escreve. Contar por tipo, como a primeira versão fazia, dizia quantos
      // alertas existem — não quantos fechariam, que é a pergunta.
      const { simularResolucao } = await import("@/lib/alertas")
      const previsto = await simularResolucao(org.id)

      console.log(`${org.slug}: ${antes} ativo(s) → ${antes - previsto.total} depois\n`)
      for (const [tipo, n] of Object.entries(previsto.fecharia).sort((a, b) => b[1] - a[1])) {
        console.log(`   fecha  ${String(n).padStart(4)}  ${tipo}`)
      }
      const ficam = Object.entries(previsto.ficaria).sort((a, b) => b[1] - a[1])
      if (ficam.length > 0) console.log("")
      for (const [tipo, n] of ficam) {
        console.log(`   FICA   ${String(n).padStart(4)}  ${tipo}`)
      }
      continue
    }

    const { resolverAlertas } = await import("@/lib/alertas")
    const r = await resolverAlertas(org.id)
    const depois = await prisma.alertaIA.count({ where: { organizacaoId: org.id, status: "ativo" } })

    console.log(
      `${org.slug}: ${antes} → ${depois} ativo(s)  ` +
        `(${r.pendencias} pendência(s) fechada(s), ${r.expirados} expirado(s) por idade)`
    )
  }

  await prisma.$disconnect()
  console.log("")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
