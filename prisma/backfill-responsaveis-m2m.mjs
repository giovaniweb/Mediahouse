// Backfill: sincroniza `demanda.responsavelId` (coluna derivada) com a tabela
// `demanda_responsavel` (fonte da verdade).
//
// Motivo: até a correção, a edição inline de responsável gravava só a coluna
// escalar e nunca a M2M — e o filtro por responsável consulta a M2M. Resultado:
// demandas atribuídas sumiam do filtro. Este script cria a linha que falta.
//
// Uso:
//   node prisma/backfill-responsaveis-m2m.mjs            # dry-run (não escreve)
//   node prisma/backfill-responsaveis-m2m.mjs --apply    # aplica
//
// Idempotente: rodar de novo depois de aplicado não faz nada.
import pg from "pg"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local", quiet: true })

const apply = process.argv.includes("--apply")

const client = new pg.Client({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  // Demandas com responsável escalar que NÃO têm a linha correspondente na M2M.
  const { rows: faltando } = await client.query(`
    SELECT d.id, d.codigo, d.titulo, d."responsavelId", d."organizacaoId", u.nome AS responsavel
    FROM demandas d
    JOIN usuarios u ON u.id = d."responsavelId"
    WHERE d."responsavelId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM demanda_responsavel r
        WHERE r."demandaId" = d.id AND r."usuarioId" = d."responsavelId"
      )
    ORDER BY d."organizacaoId", d.codigo
  `)

  // Casos que precisam de decisão humana: responsável que não é membro da org da demanda.
  const { rows: foraDaOrg } = await client.query(`
    SELECT d.codigo, u.nome AS responsavel
    FROM demandas d
    JOIN usuarios u ON u.id = d."responsavelId"
    WHERE d."responsavelId" IS NOT NULL
      AND d."organizacaoId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM usuario_organizacao m
        WHERE m."usuarioId" = d."responsavelId" AND m."organizacaoId" = d."organizacaoId"
      )
  `)

  console.log(`\n${apply ? "APLICANDO" : "DRY-RUN (nada será escrito)"}\n`)
  console.log(`Demandas com responsável fora da M2M : ${faltando.length}`)
  console.log(`Responsável que não é membro da org  : ${foraDaOrg.length}`)

  if (faltando.length > 0) {
    const porOrg = faltando.reduce((acc, r) => {
      acc[r.organizacaoId ?? "(sem org)"] = (acc[r.organizacaoId ?? "(sem org)"] ?? 0) + 1
      return acc
    }, {})
    console.log("\nPor organização:")
    for (const [org, n] of Object.entries(porOrg)) console.log(`  ${org}: ${n}`)
    console.log("\nAmostra (até 10):")
    console.table(faltando.slice(0, 10).map((r) => ({ codigo: r.codigo, responsavel: r.responsavel })))
  }

  if (foraDaOrg.length > 0) {
    console.log("\n⚠️  Estes ficam de fora do backfill — o responsável não pertence à organização da demanda:")
    console.table(foraDaOrg.slice(0, 20))
  }

  if (!apply) {
    console.log("\nRode com --apply para gravar.")
  } else if (faltando.length === 0) {
    console.log("\nNada a fazer — já está sincronizado.")
  } else {
    const res = await client.query(`
      INSERT INTO demanda_responsavel (id, "demandaId", "usuarioId", "createdAt")
      SELECT
        'bf' || substr(md5(random()::text || d.id), 1, 23),
        d.id, d."responsavelId", now()
      FROM demandas d
      WHERE d."responsavelId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM demanda_responsavel r
          WHERE r."demandaId" = d.id AND r."usuarioId" = d."responsavelId"
        )
      ON CONFLICT ("demandaId", "usuarioId") DO NOTHING
    `)
    console.log(`\n✅ ${res.rowCount} vínculo(s) criado(s).`)

    const { rows: check } = await client.query(`
      SELECT count(*)::int AS n FROM demandas d
      WHERE d."responsavelId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM demanda_responsavel r
          WHERE r."demandaId" = d.id AND r."usuarioId" = d."responsavelId"
        )
    `)
    console.log(`Verificação — restantes fora de sincronia: ${check[0].n} (esperado 0)`)
  }
} finally {
  await client.end()
}
