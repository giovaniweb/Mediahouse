/**
 * Cria uma organização e vincula uma pessoa como admin dela.
 *
 * Não existe auto-cadastro no Nuflow: organização nova nasce por aqui. O que ela
 * precisa para funcionar já é automático — `configuracoes/parametros` semeia os
 * 32 parâmetros (departamentos, tipos de vídeo, habilidades) no primeiro acesso,
 * por organização. Então este script cria o mínimo e sai da frente.
 *
 * O usuário é REAPROVEITADO quando já existe: uma pessoa, várias empresas. É
 * para isso que serve a troca de organização (src/lib/org.ts + o seletor no
 * cabeçalho) — antes dela, quem tivesse duas memberships ficava preso na mais
 * antiga por `createdAt`.
 *
 * Uso (mostra o que faria, sem escrever):
 *   npx dotenv -e .env.local -- ts-node -r tsconfig-paths/register prisma/criar-organizacao.ts --nome "..." --slug "..." --email "..."
 *
 * Para aplicar:
 *   PERMITIR_BANCO_PRODUCAO=sim npm run criar:organizacao -- --nome "..." --slug "..." --email "..." --aplicar
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { config } from "dotenv"

config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })

const arg = (nome: string): string | undefined => {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const aplicar = process.argv.includes("--aplicar")

async function main() {
  const nome = arg("nome")
  const slug = arg("slug")?.toLowerCase().trim()
  const email = arg("email")?.toLowerCase().trim()

  if (!nome || !slug || !email) {
    console.error("Uso: --nome \"Nome da Empresa\" --slug apelido --email pessoa@dominio [--aplicar]")
    process.exit(1)
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    console.error(`Slug inválido: "${slug}". Use só letras minúsculas, números e hífen — ele vai na URL pública (?org=${slug}).`)
    process.exit(1)
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  console.log(aplicar ? "\n▶ APLICANDO\n" : "\n▶ Simulação (nada será escrito — use --aplicar)\n")

  const jaExiste = await db.organizacao.findUnique({ where: { slug }, select: { id: true, nome: true } })
  if (jaExiste) {
    console.error(`❌ O slug "${slug}" já é da organização "${jaExiste.nome}". Escolha outro.`)
    process.exit(1)
  }

  const usuario = await db.usuario.findUnique({
    where: { email },
    select: { id: true, nome: true, status: true, organizacoes: { select: { organizacao: { select: { slug: true } } } } },
  })
  if (!usuario) {
    console.error(`❌ Não há usuário com o e-mail ${email}. Este script vincula quem já existe; não cria login novo.`)
    process.exit(1)
  }
  if (usuario.status === "inativo") {
    console.error(`❌ O usuário ${usuario.nome} está inativo. Reative antes de vinculá-lo.`)
    process.exit(1)
  }

  console.log(`  organização   "${nome}" (slug: ${slug})`)
  console.log(`  admin         ${usuario.nome} <${email}>`)
  console.log(`  já é membro de: ${usuario.organizacoes.map((o) => o.organizacao.slug).join(", ") || "nenhuma"}`)
  console.log(`\n  Depois de entrar, os 32 parâmetros são semeados no primeiro acesso a Configurações.`)
  if (usuario.organizacoes.length >= 1) {
    console.log(`  Com 2+ empresas, o seletor aparece no topo — é por ele que se troca.`)
  }

  if (!aplicar) {
    console.log("\n(simulação — nada foi escrito)\n")
    await db.$disconnect()
    return
  }

  // Uma transação: organização sem admin é organização que ninguém abre.
  const org = await db.$transaction(async (tx) => {
    const nova = await tx.organizacao.create({
      data: { nome, slug, ativo: true },
      select: { id: true, nome: true, slug: true },
    })
    await tx.usuarioOrganizacao.create({
      data: {
        usuarioId: usuario.id,
        organizacaoId: nova.id,
        papel: "admin",
        categoria: "interna",
        recebeTodosAvisos: true,
      },
    })
    return nova
  })

  console.log(`\n✅ Criada: ${org.nome} (${org.slug}) — id ${org.id}`)
  console.log(`   ${usuario.nome} entrou como admin.`)
  console.log(`   Link público do formulário: /cadastrar-demanda?org=${org.slug}\n`)
  await db.$disconnect()
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
