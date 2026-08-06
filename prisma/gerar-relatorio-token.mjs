// Gera (ou rotaciona) o token de leitura externa do Relatório Executivo de uma
// organização. Esse token identifica a EMPRESA nos endpoints públicos:
//   • página   /relatorio-executivo/<mes>?token=<token>
//   • MCP      Authorization: Bearer <token>
//
// Uso:
//   node prisma/gerar-relatorio-token.mjs <slug>            # mostra o token atual (ou cria se não houver)
//   node prisma/gerar-relatorio-token.mjs <slug> --rotate   # gera um novo, invalidando o anterior
//
// Rotacionar quebra os links já compartilhados — é justamente como se revoga o acesso.
import { randomBytes } from "node:crypto"
import pg from "pg"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local", quiet: true })

const slug = process.argv[2]
const rotate = process.argv.includes("--rotate")

if (!slug) {
  console.error("Informe o slug da organização. Ex: node prisma/gerar-relatorio-token.mjs contourline")
  process.exit(1)
}

const client = new pg.Client({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  const { rows } = await client.query(
    `SELECT id, nome, "relatorioToken" FROM organizacoes WHERE slug = $1`,
    [slug]
  )
  if (rows.length === 0) {
    console.error(`Organização "${slug}" não encontrada.`)
    process.exit(1)
  }
  const org = rows[0]

  let token = org.relatorioToken
  if (!token || rotate) {
    token = randomBytes(24).toString("base64url")
    await client.query(`UPDATE organizacoes SET "relatorioToken" = $1 WHERE id = $2`, [token, org.id])
    console.log(rotate ? "♻️  Token rotacionado (links antigos deixaram de funcionar)." : "✅ Token criado.")
  } else {
    console.log("ℹ️  Token já existente (use --rotate para gerar outro).")
  }

  const base = process.env.NEXTAUTH_URL ?? "https://nuflow.space"
  const agora = new Date()
  const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`

  console.log(`\nEmpresa : ${org.nome} (${slug})`)
  console.log(`Token   : ${token}`)
  console.log(`\nRelatório : ${base}/relatorio-executivo/${mes}?token=${token}`)
  console.log(`MCP       : ${base}/api/mcp   (header: Authorization: Bearer ${token})`)
} finally {
  await client.end()
}
