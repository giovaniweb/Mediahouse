#!/usr/bin/env node
// Confere (e, com --aplicar, acerta) os espelhos automáticos do videomaker que
// trabalha por uma empresa (12/11/2026). A regra é a de
// src/lib/espelho-do-videomaker.ts:
//
//   card ABERTO da dona, com videomaker V, e V tem na dona "Empresa dele" = E,
//   e dona e E têm parceria aceita  →  espelho automático ativo para E.
//
// Por padrão SÓ LÊ e mostra o que falta e o que sobra. Com --aplicar, cria o
// que falta e revoga o que sobra (os gatilhos do banco registram, avisam e
// apagam o executor). Escrever em produção passa pela guarda:
//   node scripts/guarda-banco.mjs && node scripts/espelhos-do-videomaker.mjs --aplicar
//
// Uso: DATABASE_URL=... node scripts/espelhos-do-videomaker.mjs [--aplicar]
import { config } from "dotenv"
import pg from "pg"

config({ path: ".env.local" })
config({ path: ".env" })
const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) {
  console.error("Sem DIRECT_URL/DATABASE_URL.")
  process.exit(1)
}
const aplicar = process.argv.includes("--aplicar")
const c = new pg.Client({ connectionString: url })
await c.connect()

const PARCERIA = `EXISTS (SELECT 1 FROM parceria_organizacao p WHERE p.status='aceita' AND p."encerradaEm" IS NULL
  AND ((p."organizacaoConvidanteId"=d."organizacaoId" AND p."organizacaoConvidadaId"=vo."organizacaoExecutoraId")
    OR (p."organizacaoConvidadaId"=d."organizacaoId" AND p."organizacaoConvidanteId"=vo."organizacaoExecutoraId")))`

const { rows: faltam } = await c.query(`
  SELECT d.id, d.codigo, d."videomakerId", vo."organizacaoExecutoraId" AS destino
    FROM demandas d
    JOIN videomaker_organizacao vo ON vo."organizacaoId"=d."organizacaoId" AND vo."videomakerId"=d."videomakerId"
   WHERE vo."organizacaoExecutoraId" IS NOT NULL AND d."statusVisivel" <> 'finalizado' AND ${PARCERIA}
     AND NOT EXISTS (SELECT 1 FROM demanda_compartilhamento c
                      WHERE c."demandaId"=d.id AND c."organizacaoDestinoId"=vo."organizacaoExecutoraId" AND c."revogadoEm" IS NULL)
   ORDER BY d.codigo`)

// Sobra: automático ativo de card ABERTO que já não bate com a regra.
const { rows: sobram } = await c.query(`
  SELECT c.id, d.codigo, c."nomeDestino"
    FROM demanda_compartilhamento c
    JOIN demandas d ON d.id=c."demandaId"
    LEFT JOIN videomaker_organizacao vo ON vo."organizacaoId"=d."organizacaoId" AND vo."videomakerId"=c."porVideomakerId"
   WHERE c."porVideomakerId" IS NOT NULL AND c."revogadoEm" IS NULL AND d."statusVisivel" <> 'finalizado'
     AND (d."videomakerId" IS DISTINCT FROM c."porVideomakerId"
          OR vo."organizacaoExecutoraId" IS DISTINCT FROM c."organizacaoDestinoId"
          OR NOT ${PARCERIA})
   ORDER BY d.codigo`)

console.log(`\nEspelhos automáticos — ${aplicar ? "APLICANDO" : "só leitura"}\n`)
console.log(`Faltam ${faltam.length}:`)
for (const f of faltam) console.log(`  + ${f.codigo} → ${f.destino}`)
console.log(`Sobram ${sobram.length}:`)
for (const s of sobram) console.log(`  - ${s.codigo} (${s.nomeDestino})`)

if (aplicar && (faltam.length || sobram.length)) {
  await c.query("BEGIN")
  try {
    for (const f of faltam) {
      // Reativa a aresta revogada do mesmo par, ou cria. Origem e nomes vêm do gatilho.
      const r = await c.query(`UPDATE demanda_compartilhamento SET "revogadoEm"=NULL, "revogadoPorId"=NULL, escopo='executar',
          "porVideomakerId"=$3, "criadoEm"=now(), "criadoPorId"='sistema:empresa-do-videomaker'
        WHERE "demandaId"=$1 AND "organizacaoDestinoId"=$2`, [f.id, f.destino, f.videomakerId])
      if (r.rowCount === 0) {
        await c.query(`INSERT INTO demanda_compartilhamento (id,"demandaId","organizacaoOrigemId","organizacaoDestinoId","nomeOrigem","nomeDestino",escopo,"criadoPorId","porVideomakerId")
          VALUES (gen_random_uuid()::text,$1,'',$2,'','','executar','sistema:empresa-do-videomaker',$3)`, [f.id, f.destino, f.videomakerId])
      }
      await c.query(`INSERT INTO historico_status (id,"demandaId","statusNovo",origem,observacao,"createdAt")
        VALUES (gen_random_uuid()::text,$1,'espelho_concedido','automacao','Espelhado pela conferência dos espelhos automáticos.',now())`, [f.id])
    }
    for (const s of sobram) {
      await c.query(`UPDATE demanda_compartilhamento SET "revogadoEm"=now(), "revogadoPorId"='sistema:conferencia' WHERE id=$1`, [s.id])
    }
    await c.query("COMMIT")
    console.log("\nAplicado.")
  } catch (e) {
    await c.query("ROLLBACK")
    console.error("\nNada aplicado:", e.message)
    process.exitCode = 1
  }
}
await c.end()
