import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { AsyncLocalStorage } from "node:async_hooks"
import { orgAtual } from "@/lib/org-contexto"
import { clienteDaOrg } from "@/lib/prisma-por-org"

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

type ClienteBruto = Record<string, Record<string, (a: unknown) => unknown>>

function comRls(cliente: PrismaClient) {
  return cliente.$extends({
    name: "rls-por-organizacao",

    client: {
      // A aplicação usa `$transaction` em nove lugares — mudança de status,
      // mesclagem de usuário, webhook do WhatsApp. Sem interceptar aqui, cada
      // operação DENTRO dessas transações passaria pela extensão e tentaria
      // abrir a PRÓPRIA transação: aninhamento que o Prisma recusa, ou pior,
      // escritas que escapam do rollback e continuam gravadas quando a
      // transação falha. Perda de atomicidade não aparece em teste feliz.
      //
      // A empresa é declarada UMA vez, no começo da transação de quem chamou, e
      // a marca em `dentroDaTransacao` faz as operações internas passarem
      // direto — elas já estão na conexão certa, com o ajuste certo.
      //
      // Isto continua no cliente BASE, e não no pool da empresa, por um motivo
      // técnico: as operações que chegam aqui foram construídas a partir do
      // cliente base, e o Prisma recusa um lote com promessas de clientes
      // diferentes. Como `$transaction` explícito aparece em nove lugares e não
      // no caminho quente, pagar o `set_config` por transação aqui não move o
      // ponteiro da latência.
      async $transaction(this: unknown, arg: unknown, opcoes?: unknown) {
        const organizacaoId = await orgAtual()
        const chamar = (a: unknown, o?: unknown) =>
          (base.$transaction as unknown as (x: unknown, y?: unknown) => Promise<unknown>)(a, o)

        if (!organizacaoId) return chamar(arg, opcoes)

        const declarar = base.$executeRaw`SELECT set_config('app.org_id', ${organizacaoId}, true)`

        if (Array.isArray(arg)) {
          const saida = (await dentroDaTransacao.run(true, () =>
            chamar([declarar, ...arg], opcoes)
          )) as unknown[]
          return saida.slice(1)
        }

        const callback = arg as (tx: unknown) => Promise<unknown>
        return dentroDaTransacao.run(true, () =>
          chamar(async (tx: unknown) => {
            await (tx as { $executeRawUnsafe: (q: string, ...p: unknown[]) => Promise<unknown> })
              .$executeRawUnsafe(`SELECT set_config('app.org_id', $1, true)`, organizacaoId)
            return callback(tx)
          }, opcoes)
        )
      },
    },

    query: {
      async $allOperations({ model, operation, args, query }) {
        // Já dentro de uma transação nossa ou de quem chamou: a empresa já foi
        // declarada naquela conexão, e abrir outra transação aqui quebraria a
        // atomicidade de quem nos envolveu.
        if (dentroDaTransacao.getStore()) return query(args)

        // SQL cru declara a empresa por conta própria — é assim que a
        // verificação de RLS e os helpers de credencial conseguem trabalhar.
        if (!model) return query(args)

        const organizacaoId = await orgAtual()

        // Sem empresa declarada, a consulta vai sem `app.org_id`. Não é um furo:
        // sob RLS o banco devolve vazio. É a falha FECHADA — chata de descobrir,
        // incapaz de vazar.
        if (!organizacaoId) return query(args)

        // Caminho quente: cliente DEDICADO à empresa, cujas conexões já nascem
        // com `app.org_id` definido no nível da sessão. Uma ida ao banco, sem
        // BEGIN nem COMMIT — que era o custo medido no passo 4.
        const cliente = clienteDaOrg(organizacaoId) as unknown as ClienteBruto
        return cliente[propriedadeDoModelo(model)][operation](args) as Promise<unknown>
      },
    },
  }) as unknown as PrismaClient
}

export const prisma = globalForPrisma.prisma ?? (RLS_ATIVO ? comRls(base) : base)

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaBase = base
}
