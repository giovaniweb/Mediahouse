// S11 — rotação imediata da senha do admin de teste para uma senha aleatória forte.
// A senha NÃO é impressa nem persistida em lugar nenhum (só o hash bcrypt vai ao banco).
// Para definir uma senha conhecida, use TEST_ORG_ADMIN_PASSWORD com seed-org-teste.mjs.
//   node prisma/rotate-test-admin-senha.mjs
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const EMAIL_ADMIN = "teste-admin@nuflow.local"

async function main() {
  const u = await prisma.usuario.findUnique({ where: { email: EMAIL_ADMIN }, select: { id: true } })
  if (!u) { console.error("Admin de teste não encontrado"); process.exit(1) }

  // Senha aleatória forte (256 bits) — descartada após gerar o hash, nunca exibida/salva.
  let senha = crypto.randomBytes(32).toString("base64url")
  const hash = await bcrypt.hash(senha, 12)
  senha = "" // descarta da memória

  await prisma.usuario.update({ where: { id: u.id }, data: { senhaHash: hash } })
  console.log("✅ Senha do admin de teste rotacionada para aleatória forte (não exibida/registrada).")
}

main()
  .catch((e) => { console.error("❌ Erro:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
