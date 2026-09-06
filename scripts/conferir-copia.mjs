#!/usr/bin/env node
// Prova que a cópia é a cópia — tabela por tabela, linha por linha.
//
// Este é o gate da virada. A pergunta que ele responde não é "o restore rodou
// sem erro" (rodar sem erro é barato: um dump truncado também não dá erro), e sim
// "o banco novo contém exatamente o que o banco velho continha".
//
// Confere seis coisas, e qualquer divergência derruba o processo:
//
//   1. o conjunto de TABELAS é o mesmo
//   2. a CONTAGEM de cada tabela bate — todas, não uma amostra
//   3. as POLÍTICAS de RLS são as mesmas, pelo nome e pela tabela
//   4. quais tabelas têm RLS LIGADA
//   5. índices e chaves estrangeiras batem em número
//   6. as SEQUÊNCIAS estão no mesmo ponto — a que ninguém lembra, e a que
//      transforma "restore ok" em P2002 na primeira gravação do dia seguinte
//
// Uso (as duas URLs de sessão, 5432):
//   node scripts/conferir-copia.mjs <url-origem> <url-destino>
//
// Sai 1 se qualquer coisa divergir. Não escreve nada em banco nenhum.
import pg from "pg"

const argumentos = process.argv.slice(2)
// No ensaio a produção continua gravando, então divergência de CONTAGEM é
// esperada e vira aviso — mas divergência de ESTRUTURA continua sendo erro:
// tabela ou política faltando não tem desculpa em ensaio nenhum.
const ENSAIO = argumentos.includes("--ensaio")
const [urlA, urlB] = argumentos.filter((a) => !a.startsWith("--"))
if (!urlA || !urlB) {
  console.error("\nuso: node scripts/conferir-copia.mjs <url-origem> <url-destino>\n")
  process.exit(1)
}

const CONSULTAS = {
  tabelas: `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`,
  politicas: `SELECT tablename || '.' || policyname AS p FROM pg_policies WHERE schemaname='public' ORDER BY 1`,
  comRls: `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity ORDER BY 1`,
  indices: `SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY 1`,
  fks: `SELECT conname FROM pg_constraint con JOIN pg_namespace n ON n.oid=con.connamespace
        WHERE n.nspname='public' AND contype='f' ORDER BY 1`,
  migrations: `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY 1`,
}

async function ligar(url) {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20000 })
  await c.connect()
  return c
}

async function lista(c, sql) {
  const { rows } = await c.query(sql)
  return rows.map((r) => Object.values(r)[0])
}

/** Contagem de TODAS as tabelas numa consulta só — 69 idas viram uma. */
async function contagens(c, tabelas) {
  if (tabelas.length === 0) return {}
  const uniao = tabelas
    .map((t) => `SELECT '${t}' AS t, count(*)::bigint AS n FROM public."${t}"`)
    .join(" UNION ALL ")
  const { rows } = await c.query(uniao)
  return Object.fromEntries(rows.map((r) => [r.t, Number(r.n)]))
}

async function sequencias(c) {
  const { rows } = await c.query(`
    SELECT schemaname || '.' || sequencename AS s, COALESCE(last_value, 0) AS v
      FROM pg_sequences WHERE schemaname='public' ORDER BY 1`)
  return Object.fromEntries(rows.map((r) => [r.s, Number(r.v)]))
}

const a = await ligar(urlA)
const b = await ligar(urlB)

let falhas = 0
const conferir = (condicao, texto, detalhe, tolerante = false) => {
  if (condicao) return console.log(`  ✅ ${texto}`)
  if (tolerante && ENSAIO) {
    console.log(`  ⚠️  ${texto}`)
    if (detalhe) console.log(`     ${detalhe}`)
    console.log("     (esperado no ensaio: a produção continuou gravando)")
    return
  }
  falhas++
  console.log(`  ❌ ${texto}`)
  if (detalhe) console.log(`     ${detalhe}`)
}

console.log("\n\x1b[1m▶ Estrutura\x1b[0m")

const tabelasA = await lista(a, CONSULTAS.tabelas)
const tabelasB = await lista(b, CONSULTAS.tabelas)

for (const [nome, sql] of Object.entries(CONSULTAS)) {
  let la, lb
  try {
    la = await lista(a, sql)
    lb = await lista(b, sql)
  } catch (e) {
    conferir(false, `${nome}: consulta falhou`, e.message)
    continue
  }
  const soA = la.filter((x) => !lb.includes(x))
  const soB = lb.filter((x) => !la.includes(x))
  conferir(
    soA.length === 0 && soB.length === 0,
    `${nome}: ${la.length} dos dois lados`,
    [
      soA.length ? `só na origem: ${soA.slice(0, 8).join(", ")}${soA.length > 8 ? "…" : ""}` : "",
      soB.length ? `só no destino: ${soB.slice(0, 8).join(", ")}${soB.length > 8 ? "…" : ""}` : "",
    ].filter(Boolean).join(" · ")
  )
}

console.log("\n\x1b[1m▶ Linhas — todas as tabelas, não uma amostra\x1b[0m")

const cA = await contagens(a, tabelasA)
const cB = await contagens(b, tabelasB)
const divergentes = []
let totalA = 0
let totalB = 0
for (const t of tabelasA) {
  totalA += cA[t] ?? 0
  totalB += cB[t] ?? 0
  if ((cA[t] ?? 0) !== (cB[t] ?? -1)) divergentes.push(`${t}: ${cA[t]} → ${cB[t] ?? "ausente"}`)
}
conferir(
  divergentes.length === 0,
  `${tabelasA.length} tabelas · ${totalA.toLocaleString("pt-BR")} linhas idênticas dos dois lados`,
  divergentes.slice(0, 10).join(" · "),
  true
)
if (divergentes.length === 0) {
  console.log(`     origem ${totalA.toLocaleString("pt-BR")} · destino ${totalB.toLocaleString("pt-BR")}`)
}

console.log("\n\x1b[1m▶ Sequências — o que quebra amanhã, não hoje\x1b[0m")

const sA = await sequencias(a)
const sB = await sequencias(b)
const atrasadas = Object.entries(sA).filter(([s, v]) => (sB[s] ?? -1) < v)
conferir(
  atrasadas.length === 0,
  `${Object.keys(sA).length} sequências no destino em ponto igual ou à frente da origem`,
  atrasadas.map(([s, v]) => `${s}: ${v} → ${sB[s] ?? "ausente"}`).join(" · "),
  true
)

console.log("\n\x1b[1m▶ Roles do RLS no destino\x1b[0m")

const { rows: roles } = await b.query(
  `SELECT rolname, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname IN ('app_user','app_auth') ORDER BY 1`
)
conferir(roles.length === 2, "app_user e app_auth existem no destino")
conferir(roles.every((r) => !r.rolbypassrls), "nenhum dos dois tem BYPASSRLS — as políticas valem")
conferir(roles.every((r) => r.rolcanlogin), "os dois têm LOGIN — a senha foi aplicada")

const { rows: [gs] } = await b.query(`
  SELECT count(*)::int n FROM pg_auth_members am
    JOIN pg_roles r ON r.oid = am.roleid
   WHERE r.rolname IN ('app_user','app_auth') AND am.set_option`)
conferir(
  gs.n >= 2,
  "o dono pode SET ROLE nos dois — o verificar-rls.mjs consegue rodar (§7.4)"
)

await a.end()
await b.end()

if (falhas > 0) {
  console.error(`\n❌ ${falhas} divergência(s). A cópia NÃO está boa — não aponte a produção para ela.\n`)
  process.exit(1)
}
console.log("\n✅ A cópia é a cópia. Estrutura, linhas e sequências conferem.\n")
