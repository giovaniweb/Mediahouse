// Pessoas & Acessos — backfill das dimensões da membership (categoria, funcaoProfissional,
// areas) a partir do `tipo` legado do Usuario. Idempotente: só preenche memberships
// ainda não classificadas (funcaoProfissional null E areas vazias). Não apaga nada.
// Rodar:  node prisma/backfill-pessoas-acessos.mjs
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

// tipo legado → { categoria, funcao, areas }
function mapear(tipo) {
  switch (tipo) {
    case "solicitante":     return { categoria: "solicitante", funcao: null, areas: [] }
    case "videomaker":      return { categoria: "externo", funcao: "videomaker", areas: ["audiovisual"] }
    case "editor":          return { categoria: "interna", funcao: "editor", areas: ["audiovisual"] }
    case "designer":        return { categoria: "interna", funcao: "designer", areas: ["growth"] }
    case "social":          return { categoria: "interna", funcao: "social", areas: ["growth"] }
    case "analista_crm":    return { categoria: "interna", funcao: "analista_crm", areas: ["growth"] }
    case "gestor_trafego":  return { categoria: "interna", funcao: "gestor_trafego", areas: ["growth"] }
    case "gestor_eventos":  return { categoria: "interna", funcao: "gestor_eventos", areas: ["eventos"] }
    case "gestor":          return { categoria: "interna", funcao: "gestor", areas: ["audiovisual", "growth"] }
    case "admin":           return { categoria: "interna", funcao: "admin", areas: ["audiovisual", "growth"] }
    case "operacao":        return { categoria: "interna", funcao: "operacao", areas: ["audiovisual", "growth"] }
    case "auxiliar_admin":  return { categoria: "interna", funcao: "auxiliar_admin", areas: ["audiovisual", "growth"] }
    default:                return { categoria: "interna", funcao: tipo ?? null, areas: ["growth"] }
  }
}

async function main() {
  // Memberships ainda não classificadas (funcaoProfissional null = ainda não tocada).
  // Preserva quem já foi editado manualmente (já tem função preenchida).
  const memberships = await prisma.usuarioOrganizacao.findMany({
    where: { funcaoProfissional: null },
    select: { id: true, usuario: { select: { tipo: true } } },
  })
  console.log(`Memberships a classificar: ${memberships.length}`)

  let n = 0
  for (const m of memberships) {
    const { categoria, funcao, areas } = mapear(m.usuario.tipo)
    await prisma.usuarioOrganizacao.update({
      where: { id: m.id },
      data: { categoria, funcaoProfissional: funcao, areas },
    })
    n++
  }
  console.log(`✅ ${n} membership(s) classificada(s) por tipo legado.`)
}

main()
  .catch((e) => { console.error("❌ Erro:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
