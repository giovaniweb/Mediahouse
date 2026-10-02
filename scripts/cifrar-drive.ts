import { spawnSync } from "node:child_process"
import { migrarCredenciaisDrive } from "../src/lib/drive-credential-migration"
import { prismaBase } from "../src/lib/prisma"

async function main() {
  // Conexão explícita: CLI não carrega nem procura .env como fallback.
  if (!process.env.DATABASE_URL || process.env.DIRECT_URL !== process.env.DATABASE_URL) {
    throw new Error("Defina DATABASE_URL e DIRECT_URL explicitamente com o mesmo destino autorizado")
  }
  const args = process.argv.slice(2)
  const orgIndex = args.indexOf("--org"), cursorIndex = args.indexOf("--depois-de")
  const organizacaoId = orgIndex >= 0 ? args[orgIndex + 1] : undefined
  if (!organizacaoId || organizacaoId.startsWith("--")) throw new Error("Use --org ID; --aplicar é opcional, padrão é simulação")
  const guard = spawnSync(process.execPath, ["scripts/guarda-banco.mjs"], { stdio: "inherit" })
  if (guard.status !== 0) throw new Error("Guarda de banco recusou a operação")
  const resultado = await migrarCredenciaisDrive(organizacaoId, args.includes("--aplicar"), cursorIndex >= 0 ? args[cursorIndex + 1] : undefined)
  console.log(JSON.stringify(resultado, null, 2))
}
main().catch(() => { console.error("Migração não executada ou incompleta; confira destino explícito, argumentos, guarda e chaves."); process.exitCode = 1 })
  .finally(() => prismaBase.$disconnect())
