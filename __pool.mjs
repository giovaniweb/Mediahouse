import pg from "pg"; import { readFileSync, writeFileSync } from "node:fs"
const REF="chgfqvdzbuyjcswkfrsf", HOST="aws-0-us-east-1.pooler.supabase.com"
const env = Object.fromEntries(readFileSync(process.env.SCR+"/urls-preview.txt","utf8")
  .trim().split("\n").map(l=>[l.slice(0,l.indexOf("=")), l.slice(l.indexOf("=")+1)]))
const senhaDe = (u) => decodeURIComponent(u.split("//")[1].split("@")[0].split(":")[1])

const urls = {
  DATABASE_URL: `postgresql://app_user.${REF}:${senhaDe(env.DATABASE_URL)}@${HOST}:6543/postgres?pgbouncer=true`,
  AUTH_DATABASE_URL: `postgresql://app_auth.${REF}:${senhaDe(env.AUTH_DATABASE_URL)}@${HOST}:6543/postgres?pgbouncer=true`,
  DIRECT_URL: `postgresql://postgres.${REF}:${senhaDe(env.DIRECT_URL)}@${HOST}:5432/postgres`,
}

for (const [nome, url] of Object.entries(urls)) {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 })
  try {
    await c.connect()
    const { rows:[q] } = await c.query("SELECT current_user u")
    // o teste que importa: SET LOCAL sobrevive ao pooler em modo transação?
    let visiveis = "n/a"
    if (nome === "DATABASE_URL") {
      await c.query("BEGIN")
      const { rows:[o] } = await c.query(`SELECT id FROM organizacoes WHERE slug='empresa-teste'`).catch(()=>({rows:[{}]}))
      await c.query(`SELECT set_config('app.org_id',$1,true)`,[o.id ?? ""])
      const { rows:[d] } = await c.query("SELECT count(*)::int n FROM demandas")
      await c.query("COMMIT")
      visiveis = `${d.n} demanda(s) da empresa-teste`
    }
    console.log(`  ✅ ${nome.padEnd(18)} conecta como ${q.u} · ${visiveis}`)
    await c.end()
  } catch (e) { console.log(`  ❌ ${nome}: ${String(e.message).slice(0,90)}`) }
}
writeFileSync(process.env.SCR+"/urls-preview-pooler.txt",
  Object.entries(urls).map(([k,v])=>`${k}=${v}`).join("\n")+"\nRLS_ATIVO=sim\n")
console.log("\n  urls do pooler gravadas fora do repositório")
