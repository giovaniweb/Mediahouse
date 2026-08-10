/**
 * Marca como "erro" as execuções de agente que ficaram presas em "executando".
 *
 * Uma execução trava quando a função serverless morre no meio (timeout, deploy,
 * exceção fora do try). Ninguém nunca fecha essas linhas, então elas ficam para
 * sempre "executando" e poluem qualquer leitura de saúde dos agentes.
 *
 * Uso:
 *   node prisma/limpar-execucoes-presas.mjs            # dry-run (padrão)
 *   node prisma/limpar-execucoes-presas.mjs --apply    # grava
 *   node prisma/limpar-execucoes-presas.mjs --apply --minutos=60
 */
import pg from "pg"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local", quiet: true })

const args = process.argv.slice(2)
const aplicar = args.includes("--apply")
const minutos = Number(args.find((a) => a.startsWith("--minutos="))?.split("=")[1] ?? 30)

const client = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()

  const alvo = await client.query(
    `SELECT id, agente, "createdAt"
       FROM agente_execucoes
      WHERE status = 'executando'
        AND "createdAt" < now() - ($1 || ' minutes')::interval
      ORDER BY "createdAt"`,
    [String(minutos)]
  )

  if (alvo.rowCount === 0) {
    console.log(`Nenhuma execução presa há mais de ${minutos} min.`)
    return
  }

  console.log(`${alvo.rowCount} execução(ões) presa(s) há mais de ${minutos} min:`)
  console.table(alvo.rows.map((r) => ({ agente: r.agente, desde: r.createdAt.toISOString().slice(0, 16) })))

  if (!aplicar) {
    console.log("\nDry-run — nada foi gravado. Rode com --apply para marcar como 'erro'.")
    return
  }

  const res = await client.query(
    `UPDATE agente_execucoes
        SET status = 'erro',
            erro = COALESCE(erro, 'Execução interrompida (função encerrada antes de concluir)'),
            "finishedAt" = COALESCE("finishedAt", now())
      WHERE status = 'executando'
        AND "createdAt" < now() - ($1 || ' minutes')::interval`,
    [String(minutos)]
  )
  console.log(`\n✅ ${res.rowCount} execução(ões) marcada(s) como 'erro'.`)
}

main()
  .catch((e) => {
    console.error("Falhou:", e.message)
    process.exitCode = 1
  })
  .finally(() => client.end())
