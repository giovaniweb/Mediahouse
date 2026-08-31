import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { AsyncLocalStorage } from "node:async_hooks"
import { orgAtual } from "@/lib/org-contexto"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaBase: PrismaClient | undefined
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
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

// Evita transação dentro de transação: a operação redespachada abaixo passa por
// esta mesma extensão, e sem a marca abriria outra, e outra.
const dentroDaTransacao = new AsyncLocalStorage<true>()

function propriedadeDoModelo(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

function comRls(cliente: PrismaClient) {
  return cliente.$extends({
    name: "rls-por-organizacao",
    query: {
      async $allOperations({ model, operation, args, query }) {
        // Já estamos dentro de uma transação nossa: o `set_config` de fora vale
        // para esta consulta também.
        if (dentroDaTransacao.getStore()) return query(args)

        // Operações que não são de modelo ($queryRaw, $executeRaw) e as de
        // transação seguem direto: quem escreve SQL cru declara a empresa por
        // conta própria, e é assim que a verificação de RLS consegue testar.
        if (!model) return query(args)

        const organizacaoId = await orgAtual()

        // Sem empresa declarada, a consulta vai sem `app.org_id`. Não é um furo:
        // sob RLS o banco devolve vazio. É a falha FECHADA — chata de descobrir,
        // incapaz de vazar.
        if (!organizacaoId) return query(args)

        return base.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SELECT set_config('app.org_id', $1, true)`, organizacaoId)
          return dentroDaTransacao.run(true, () => {
            const modelo = (tx as unknown as Record<string, Record<string, (a: unknown) => unknown>>)[
              propriedadeDoModelo(model)
            ]
            return modelo[operation](args) as Promise<unknown>
          })
        })
      },
    },
  }) as unknown as PrismaClient
}

export const prisma = globalForPrisma.prisma ?? (RLS_ATIVO ? comRls(base) : base)

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaBase = base
}
