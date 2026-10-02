import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { conexaoBanco } from "@/lib/banco-conexao"
import { comRls } from "@/lib/prisma-rls"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaBase: PrismaClient | undefined
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: conexaoBanco("app") })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
}

const base = globalForPrisma.prismaBase ?? createPrismaClient()

/**
 * Cliente sem a camada de RLS. Use apenas onde declarar a empresa seria
 * circular — a própria resolução de empresa. Todo o resto usa `prisma`.
 */
export const prismaBase = base

// ─────────────────────────────────────────────────────────────────────────────
// Camada de RLS
//
// O Postgres decide o que devolver a partir de `app.org_id`, que vale por
// TRANSAÇÃO (`set_config(..., true)` = SET LOCAL). Como cada consulta do Prisma
// normalmente pega uma conexão qualquer do pool, a única forma de garantir que
// a declaração e a consulta caem na mesma conexão é envolvê-las numa transação
// interativa — que é o que esta extensão faz.
//
// O custo é real e está medido no plano de voo: cada consulta vira BEGIN,
// set_config, consulta, COMMIT. É o preço de o banco recusar sozinho o que o
// código esquecer de filtrar.
//
// Desligada por padrão. `RLS_ATIVO=sim` liga. Enquanto a aplicação conectar como
// dono do banco, ligar não muda nada — dono ignora RLS —, o que permite exercitar
// o caminho antes de trocar a credencial.
// ─────────────────────────────────────────────────────────────────────────────

export const RLS_ATIVO = process.env.RLS_ATIVO === "sim"


export const prisma = globalForPrisma.prisma ?? (RLS_ATIVO ? comRls(base) : base)

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaBase = base
}
