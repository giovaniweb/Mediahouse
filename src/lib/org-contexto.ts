// De qual empresa é esta consulta?
//
// Sob RLS, o Postgres não adivinha: cada transação precisa DECLARAR a empresa
// em `app.org_id`, e o que não bater não sai. Este arquivo é quem carrega essa
// declaração do topo da requisição até a consulta lá embaixo.
//
// Por que AsyncLocalStorage e não um parâmetro: `prisma` é importado direto em
// 200 arquivos. Passar a empresa por argumento significaria reescrever todos, e
// uma migração dessas em PR único é irrevisável — exatamente o tipo de mudança
// grande e silenciosa que já custou caro neste repositório.
//
// Há dois caminhos, e a ordem entre eles importa:
//
//   1. `comOrg(id, fn)` — explícito. Vale para cron, script e worker, onde não
//      existe requisição nem sessão. Tem precedência sobre tudo.
//   2. a sessão da requisição — implícito, pela MESMA função que as rotas já
//      usam (`getOrgId`), então os dois nunca discordam: é o mesmo cálculo.
//
// Sem nenhum dos dois, `orgAtual()` devolve null e a consulta roda sem declarar
// empresa. Sob RLS isso não vaza: devolve vazio. Falha fechado.
import { AsyncLocalStorage } from "node:async_hooks"
import { cache } from "react"

const armazenamento = new AsyncLocalStorage<{ organizacaoId: string | null }>()

/**
 * Roda `fn` declarando a empresa para todas as consultas dentro dela.
 *
 * Use em cron, script e qualquer código sem requisição HTTP. Dentro de uma rota
 * não é necessário — a sessão resolve sozinha —, mas não faz mal e tem
 * precedência.
 */
export function comOrg<T>(organizacaoId: string | null, fn: () => Promise<T>): Promise<T> {
  return armazenamento.run({ organizacaoId }, fn)
}

/**
 * Declara a empresa para o RESTO da requisição em curso, sem envolver nada.
 *
 * `comOrg` exige um callback, e envolver o corpo inteiro de vinte handlers
 * públicos significaria reindentar vinte arquivos — um diff que ninguém revisa
 * de verdade, para uma mudança que precisa ser revisada de verdade.
 * `enterWith` entra no contexto a partir daqui e persiste pelas chamadas
 * assíncronas seguintes, o que dá uma linha por rota:
 *
 *   const organizacaoId = await orgPorCredencial("nota_fiscal", token)
 *   if (!organizacaoId) return NextResponse.json({ error: "..." }, { status: 404 })
 *   declararOrg(organizacaoId)
 *
 * Cabe em rota HTTP porque cada requisição roda no próprio contexto assíncrono:
 * o que é declarado aqui não escapa para a requisição do vizinho. Para código
 * que NÃO nasce numa requisição — cron, worker, script —, use `comOrg`, que
 * delimita o escopo explicitamente em vez de depender de quem chamou.
 */
export function declararOrg(organizacaoId: string): void {
  armazenamento.enterWith({ organizacaoId })
}

/** Empresa declarada explicitamente por `comOrg`, se houver. */
export function orgDeclarada(): string | null {
  return armazenamento.getStore()?.organizacaoId ?? null
}

/** Estamos dentro de um `comOrg`? Diferente de "a empresa é null". */
export function temContextoDeclarado(): boolean {
  return armazenamento.getStore() !== undefined
}

/**
 * Empresa da requisição em curso, pela MESMA função que as rotas usam.
 *
 * O import é dinâmico de propósito: `@/lib/org` importa `prisma`, e `prisma`
 * importa este arquivo. Estaticamente isso é um ciclo; dinamicamente, resolve na
 * primeira chamada, quando os dois módulos já existem.
 *
 * `getOrgId` consulta por `prismaAuth`, não pelo cliente normal — senão
 * descobrir a empresa passaria pela extensão que precisa da empresa, e a
 * recursão não teria fundo.
 *
 * `cache()` do React limita isso a uma resolução por requisição. Fora de uma
 * requisição — cron, script, worker — `auth()` não acha os cabeçalhos e levanta
 * erro; devolvemos null, e quem roda ali declara a empresa com `comOrg`.
 */
export const orgDaSessao = cache(async (): Promise<string | null> => {
  try {
    const [{ auth }, { getOrgId }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/org"),
    ])
    const session = await auth()
    if (!session) return null
    return await getOrgId(session)
  } catch {
    return null
  }
})

/**
 * A empresa que vale para esta consulta.
 *
 * `comOrg` tem precedência: quem declarou explicitamente sabe mais que a
 * sessão — é o caso do cron, que roda uma empresa de cada vez.
 */
export async function orgAtual(): Promise<string | null> {
  if (temContextoDeclarado()) return orgDeclarada()
  return orgDaSessao()
}
