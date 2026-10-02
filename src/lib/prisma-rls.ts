import type { PrismaClient } from "@prisma/client"
import { AsyncLocalStorage } from "node:async_hooks"
import { orgAtual } from "@/lib/org-contexto"

// Somente consultas do lote usam a conexão/transação que o Prisma já atribuiu.
// Callbacks recebem tx do cliente base; consultas globais continuam declarando contexto.
const dentroDaTransacao = new AsyncLocalStorage<true>()

function propriedadeDoModelo(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

type ClienteBruto = Record<string, Record<string, (a: unknown) => unknown>>

export function comRls(cliente: PrismaClient) {
  const base = cliente
  /** Declara a empresa e executa, tudo numa transação em LOTE — uma ida ao banco. */
  function emLote<T>(organizacaoId: string | null, operacao: unknown): Promise<T> {
    const declarar = base.$executeRaw`SELECT set_config('app.org_id', ${organizacaoId ?? ""}, true)`
    return base
      .$transaction([declarar, operacao as ReturnType<typeof base.$executeRaw>])
      .then(([, resultado]) => resultado as T)
  }

  return cliente.$extends({
    name: "rls-por-organizacao",

    client: {
      // SET LOCAL e consultas ficam na mesma conexão; callback recebe tx bruto.
      async $transaction(this: unknown, arg: unknown, opcoes?: unknown) {
        const organizacaoId = await orgAtual()
        const chamar = (a: unknown, o?: unknown) =>
          (base.$transaction as unknown as (x: unknown, y?: unknown) => Promise<unknown>)(a, o)


        const declarar = base.$executeRaw`SELECT set_config('app.org_id', ${organizacaoId ?? ""}, true)`

        if (Array.isArray(arg)) {
          const saida = (await dentroDaTransacao.run(true, () =>
            chamar([declarar, ...arg], opcoes)
          )) as unknown[]
          return saida.slice(1)
        }

        const callback = arg as (tx: unknown) => Promise<unknown>
        return chamar(async (tx: unknown) => {
          await (tx as { $executeRawUnsafe: (q: string, ...p: unknown[]) => Promise<unknown> })
            .$executeRawUnsafe(`SELECT set_config('app.org_id', $1, true)`, organizacaoId ?? "")
          return callback(tx)
        }, opcoes)
      },
    },

    query: {
      async $allOperations({ model, operation, args, query }) {
        // O lote já recebeu SET LOCAL na primeira instrução.
        if (dentroDaTransacao.getStore()) return query(args)

        const organizacaoId = await orgAtual()
        // Inclui SQL cru e contexto vazio: SET LOCAL impede resíduo no pool.
        if (!model) {
          const metodo = (base as unknown as Record<string, (...a: unknown[]) => unknown>)[operation]
          const operacao = metodo.apply(base, Array.isArray(args) ? args : [args])
          return emLote(organizacaoId, operacao)
        }

        const modelo = (base as unknown as ClienteBruto)[propriedadeDoModelo(model)]
        const operacao = modelo[operation](args)
        return emLote(organizacaoId, operacao)
      },
    },
  }) as unknown as PrismaClient
}

