#!/usr/bin/env node
// Pré-voo da Fase 2 — SOMENTE LEITURA.
//
// Antes de um NOT NULL ou de uma FOREIGN KEY entrar, alguém precisa provar que o
// dado aguenta. Um `ALTER TABLE ... SET NOT NULL` numa coluna com uma linha nula
// falha; uma FK com uma linha órfã falha; e falhar no meio de uma migration de
// produção é como se descobre que ninguém mediu antes.
//
// Este script mede. Não escreve nada, nunca — nem com PERMITIR_BANCO_PRODUCAO.
//
//   node scripts/checar-fundacao.mjs
//
// Sai 1 se houver qualquer impedimento, para poder virar passo de checklist.
import { config } from "dotenv"
import pg from "pg"

config({ path: ".env.local" })
config({ path: ".env" })

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) {
  console.error("\n❌ Sem DIRECT_URL/DATABASE_URL.\n")
  process.exit(1)
}

// As 19 tabelas que já têm `organizacaoId`, mas nulável. Viram NOT NULL + FK.
const NULAVEIS = [
  "demandas", "alertas_ia", "config_whatsapp", "mensagens_whatsapp", "contatos_whatsapp",
  "mapa_lid_whatsapp", "eventos", "custos_videomaker", "relatorios_ia", "config_email",
  "config_parametros", "fabricantes", "produtos", "ideias_video", "config_empresa",
  "coberturas", "eventos_gestao", "fornecedores", "producao_manual",
]

const client = new (await import("pg")).default.Client({ connectionString: url })
await client.connect()

let impedimentos = 0

console.log("\n── Colunas `organizacaoId` nuláveis ──\n")
console.log("TABELA                          TOTAL     NULOS    ÓRFÃOS   EMPRESAS")
for (const t of NULAVEIS) {
  const { rows: [r] } = await client.query(`
    SELECT count(*)::int total,
           count(*) FILTER (WHERE "organizacaoId" IS NULL)::int nulos,
           count(*) FILTER (
             WHERE "organizacaoId" IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM organizacoes o WHERE o.id = "organizacaoId")
           )::int orfaos,
           count(DISTINCT "organizacaoId")::int empresas
    FROM "${t}"`)
  const trava = r.nulos > 0 || r.orfaos > 0
  if (trava) impedimentos++
  console.log(
    `${t.padEnd(30)} ${String(r.total).padStart(6)} ${String(r.nulos).padStart(9)} ` +
      `${String(r.orfaos).padStart(9)} ${String(r.empresas).padStart(10)}${trava ? "   ⛔" : ""}`
  )
}

console.log("\n── Chaves estrangeiras já apontando para `organizacoes` ──\n")
const { rows: fks } = await client.query(`
  SELECT tc.table_name AS tabela, kcu.column_name AS coluna, rc.delete_rule AS ao_apagar
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'organizacoes'
  ORDER BY tc.table_name`)
const comFk = new Set(fks.map((f) => f.tabela))
for (const f of fks) console.log(`  ${f.tabela}.${f.coluna}  (ON DELETE ${f.ao_apagar})`)
const semFk = NULAVEIS.filter((t) => !comFk.has(t))
console.log(`\n  ${semFk.length} das ${NULAVEIS.length} nuláveis ainda SEM FK: ${semFk.join(", ")}`)

// Colunas que a Fase 2 criou e que seguem NULÁVEIS de propósito ou por
// transição. Nulo aqui não é bug — é dado que ainda não tem dono, e o relatório
// existe para que ninguém precise adivinhar quanto disso sobrou.
console.log("\n── Colunas novas, ainda nuláveis ──\n")
const NOVAS = {
  depoimentos: "vitrine pública — nulo some da vitrine de todo mundo",
  checklist_templates: "template sem empresa não aparece para ninguém",
  config_trello: "credencial de board sem dono não é usada",
  avaliacoes_videomaker: "nulo = avaliação por QR público, sem empresa (esperado)",
  avaliacoes_editor: "nulo = avaliação por QR público, sem empresa (esperado)",
}
for (const [t, nota] of Object.entries(NOVAS)) {
  // O script roda ANTES e DEPOIS da migration — é assim que se decide se ela
  // pode entrar. Antes, a coluna não existe, e isso é informação, não erro.
  const { rows: [existe] } = await client.query(
    `SELECT count(*)::int n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'organizacaoId'`,
    [t]
  )
  if (existe.n === 0) {
    console.log(`  ${t.padEnd(24)} coluna ainda não existe — migration pendente`)
    continue
  }
  const { rows: [r] } = await client.query(
    `SELECT count(*)::int total, count(*) FILTER (WHERE "organizacaoId" IS NULL)::int nulos FROM "${t}"`
  )
  console.log(`  ${t.padEnd(24)} ${String(r.total).padStart(5)} linha(s), ${String(r.nulos).padStart(4)} sem dono — ${nota}`)
}

console.log("\n── Tabelas que escapam por serem filhas ou globais ──\n")
console.log("  convites_videomaker      escopa pela demanda")
console.log("  produtos_servico_evento  módulo eventos está desligado na plataforma")

console.log("\n── Empresas ──\n")
const { rows: orgs } = await client.query(`SELECT id, slug, nome FROM organizacoes ORDER BY "createdAt"`)
for (const o of orgs) console.log(`  ${o.slug.padEnd(18)} ${o.id}  ${o.nome}`)

await client.end()

if (impedimentos > 0) {
  console.error(`\n⛔ ${impedimentos} tabela(s) com nulo ou órfão — o NOT NULL/FK falharia. Backfill primeiro.\n`)
  process.exit(1)
}
console.log("\n✅ Nenhum nulo e nenhum órfão. As travas podem entrar.\n")
