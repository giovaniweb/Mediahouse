// Seed/backfill da Fase 1 multiempresa: cria a org Contourline, vincula todos os
// usuários existentes a ela (papel = tipo) e preenche organizacaoId nos dados antigos.
// Idempotente — pode rodar de novo sem duplicar.
//   node prisma/seed-multitenant.mjs   (rodar da raiz do projeto)
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function main() {
  // 1. Organização Contourline (find-or-create)
  let org = await prisma.organizacao.findUnique({ where: { slug: "contourline" } })
  if (!org) {
    org = await prisma.organizacao.create({ data: { nome: "Contourline", slug: "contourline" } })
    console.log("✅ Organização Contourline criada:", org.id)
  } else {
    console.log("• Organização Contourline já existe:", org.id)
  }

  // 2. Membership de todos os usuários → Contourline (papel = tipo)
  const usuarios = await prisma.usuario.findMany({ select: { id: true, tipo: true, nome: true } })
  let novosMembros = 0
  for (const u of usuarios) {
    const existe = await prisma.usuarioOrganizacao.findUnique({
      where: { usuarioId_organizacaoId: { usuarioId: u.id, organizacaoId: org.id } },
    })
    if (!existe) {
      await prisma.usuarioOrganizacao.create({
        data: { usuarioId: u.id, organizacaoId: org.id, papel: u.tipo },
      })
      novosMembros++
    }
  }
  console.log(`✅ Memberships: ${novosMembros} criadas (${usuarios.length} usuários no total)`)

  // 3. Super-admin (gestão global). Por enquanto: admins atuais (única org).
  const sa = await prisma.usuario.updateMany({ where: { tipo: "admin" }, data: { superAdmin: true } })
  console.log(`✅ superAdmin marcado em ${sa.count} admin(s)`)

  // 4. Backfill organizacaoId nos models privados (só onde está null)
  const models = [
    "demanda", "eventoCobertura", "editor", "designer", "custoVideomaker", "produto",
    "evento", "alertaIA", "ideiaVideo", "fornecedor", "eventoGestao", "relatorioIA",
    "producaoManual", "configEmpresa", "configEmail", "configParametro",
    "mensagemWhatsapp", "contatoWhatsApp", "mapaLidWhatsApp", "configWhatsapp",
  ]
  for (const m of models) {
    try {
      const r = await prisma[m].updateMany({ where: { organizacaoId: null }, data: { organizacaoId: org.id } })
      console.log(`  • ${m}: ${r.count} registro(s) atualizados`)
    } catch (e) {
      console.error(`  ✗ ${m}:`, e.message)
    }
  }

  console.log("\n🎉 Backfill concluído.")
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
