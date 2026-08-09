// Gera (ou rotaciona) o segredo do webhook do WhatsApp de uma organização e
// imprime a URL pronta para colar na configuração de webhook da Evolution API.
//
// Enquanto a instância não tiver segredo, o webhook aceita qualquer origem —
// basta descobrir o nome da instância para injetar mensagem. Com o segredo
// configurado, payload sem ele é descartado.
//
// Uso:
//   node prisma/gerar-webhook-secret.mjs <slug-da-org>
//   node prisma/gerar-webhook-secret.mjs <slug-da-org> --rotate
//
// Depois de rodar: atualize a URL do webhook na Evolution ANTES de considerar
// concluído — a partir do primeiro payload sem segredo válido, ele é ignorado.
import { randomBytes, createCipheriv, createHash } from "node:crypto"
import pg from "pg"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local", quiet: true })

const slug = process.argv[2]
const rotate = process.argv.includes("--rotate")

if (!slug) {
  console.error("Informe o slug da organização. Ex: node prisma/gerar-webhook-secret.mjs contourline")
  process.exit(1)
}

// Precisa produzir exatamente o mesmo formato de src/lib/secret-crypto.ts,
// senão o webhook não consegue decifrar: aes-256-gcm, chave = sha256(segredo do
// ambiente), partes unidas por "." em base64url.
function encryptSecret(valor) {
  const fonte = process.env.EMAIL_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET
  if (!fonte) {
    throw new Error("Defina EMAIL_ENCRYPTION_KEY ou NEXTAUTH_SECRET — é a chave que cifra os segredos.")
  }
  const key = createHash("sha256").update(fonte).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const dados = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, dados].map((p) => p.toString("base64url")).join(".")
}

const client = new pg.Client({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  const { rows } = await client.query(
    `SELECT c.id, c."instanceId", c."instanceName", c."webhookSecret", o.nome
       FROM config_whatsapp c JOIN organizacoes o ON o.id = c."organizacaoId"
      WHERE o.slug = $1`,
    [slug]
  )
  if (rows.length === 0) {
    console.error(`Nenhuma configuração de WhatsApp para a organização "${slug}".`)
    process.exit(1)
  }
  const cfg = rows[0]

  if (cfg.webhookSecret && !rotate) {
    console.log("ℹ️  Esta instância já tem segredo configurado.")
    console.log("   O valor não é recuperável (fica cifrado). Use --rotate para gerar outro,")
    console.log("   lembrando que a URL antiga para de funcionar na hora.")
    process.exit(0)
  }

  const segredo = randomBytes(24).toString("base64url")
  await client.query(`UPDATE config_whatsapp SET "webhookSecret" = $1 WHERE id = $2`, [
    encryptSecret(segredo),
    cfg.id,
  ])

  const base = (process.env.NEXTAUTH_URL ?? "https://nuflow.space").replace(/\/$/, "")
  console.log(`\n${rotate ? "♻️  Segredo rotacionado" : "✅ Segredo criado"} para ${cfg.nome} (instância ${cfg.instanceName ?? cfg.instanceId}).\n`)
  console.log("Cole esta URL no webhook da Evolution API:\n")
  console.log(`   ${base}/api/whatsapp/webhook?s=${segredo}\n`)
  console.log("(Alternativa: manter a URL sem querystring e enviar o header x-webhook-secret.)")
  console.log("Anote agora — o segredo fica cifrado no banco e não é exibido de novo.\n")
} finally {
  await client.end()
}
