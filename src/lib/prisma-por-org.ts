// Um pool de conexões por empresa, com `app.org_id` no nível da SESSÃO.
//
// Por que existe: a primeira versão do RLS declarava a empresa por CONSULTA,
// dentro de uma transação. Funcionava e isolava, mas o passo 4 mediu o preço —
// `BEGIN` e `COMMIT` são duas viagens extras ao banco por consulta, e com a
// aplicação em gru1 e o banco nos Estados Unidos cada viagem custa uns 120ms:
//
//   /api/demandas    538ms → 1827ms
//   /api/produtos    652ms → 1718ms
//
// Aqui a empresa é declarada UMA VEZ, quando a conexão nasce, e vale para tudo
// que passar por ela. A consulta volta a ser uma ida só.
//
// ── O que torna isto seguro ─────────────────────────────────────────────────
//
// O pool é DEDICADO a uma empresa. Uma conexão nunca é emprestada para outra,
// então o ajuste de sessão não tem como vazar — que é o risco óbvio de sair da
// transação e o motivo de o desenho anterior ser conservador.
//
// Exige o pooler em modo SESSÃO (porta 5432). Em modo transação (6543) o
// Supavisor troca a conexão de baixo entre uma consulta e outra, e um ajuste de
// sessão não sobrevive — chega a parecer que sobrevive quando não há
// concorrência, que é a pior forma de estar errado.
//
// ── E o que ele NÃO resolve ─────────────────────────────────────────────────
//
// Modo sessão prende uma conexão do banco por conexão do pool, então isto
// escala com DEZENAS de inquilinos, não com milhares. Quando esse dia chegar, o
// caminho é outro (um pool só, com o ajuste por transação, ou proxy dedicado).
// O limite abaixo existe para o problema aparecer como erro claro, e não como
// banco sem conexões livres.
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool, type PoolClient } from "pg"

/** Quantas empresas podem ter pool ao mesmo tempo neste processo. */
const MAX_EMPRESAS = Number(process.env.RLS_MAX_POOLS ?? 12)
/** Conexões por empresa. Baixo de propósito: modo sessão não devolve conexão. */
const MAX_CONEXOES = Number(process.env.RLS_POOL_MAX ?? 3)

type Entrada = { cliente: PrismaClient; pool: Pool; usadoEm: number }
const porEmpresa = new Map<string, Entrada>()

const JA_DECLARADA = Symbol("app.org_id")

/**
 * Pool cujas conexões já nascem sabendo a empresa.
 *
 * O evento `connect` do node-postgres NÃO é aguardado: o cliente é entregue a
 * quem pediu antes de um handler assíncrono terminar, e a primeira consulta
 * sairia sem `app.org_id` — devolvendo vazio, de vez em quando, sem padrão.
 * Por isso a declaração entra no CAMINHO de aquisição, não num evento.
 */
function poolDaEmpresa(organizacaoId: string): Pool {
  const url =
    process.env.RLS_SESSION_URL ||
    process.env.DATABASE_URL

  const pool = new Pool({
    connectionString: url,
    max: MAX_CONEXOES,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })

  const adquirir = pool.connect.bind(pool)

  async function conexaoPronta(): Promise<PoolClient> {
    const conexao = (await adquirir()) as PoolClient & { [JA_DECLARADA]?: boolean }
    if (!conexao[JA_DECLARADA]) {
      // `set_config` com parâmetro, e não `SET app.org_id = '...'`: SET não
      // aceita parâmetro, e interpolar id na string é abrir uma porta que não
      // precisa existir.
      await conexao.query(`SELECT set_config('app.org_id', $1, false)`, [organizacaoId])
      conexao[JA_DECLARADA] = true
    }
    return conexao
  }

  pool.connect = conexaoPronta as typeof pool.connect

  // O adaptador do Prisma usa `pool.query` para consulta simples e
  // `pool.connect` para transação. Os dois precisam passar pela declaração.
  const consultar = async (...args: unknown[]) => {
    const conexao = await conexaoPronta()
    try {
      return await (conexao.query as (...a: unknown[]) => Promise<unknown>)(...args)
    } finally {
      conexao.release()
    }
  }
  pool.query = consultar as typeof pool.query

  return pool
}

/** Cliente Prisma preso a uma empresa. Reaproveitado entre requisições. */
export function clienteDaOrg(organizacaoId: string): PrismaClient {
  const existente = porEmpresa.get(organizacaoId)
  if (existente) {
    existente.usadoEm = Date.now()
    return existente.cliente
  }

  // Estourou o teto: fecha o pool mais antigo em vez de abrir conexão sem fim.
  if (porEmpresa.size >= MAX_EMPRESAS) {
    const [maisAntiga] = [...porEmpresa.entries()].sort((a, b) => a[1].usadoEm - b[1].usadoEm)
    if (maisAntiga) {
      const [id, entrada] = maisAntiga
      porEmpresa.delete(id)
      void entrada.cliente.$disconnect().catch(() => null)
      void entrada.pool.end().catch(() => null)
    }
  }

  const pool = poolDaEmpresa(organizacaoId)
  // O cast existe porque `@prisma/adapter-pg` traz a PRÓPRIA cópia de
  // `@types/pg` aninhada, e o tsc trata os dois `Pool` como tipos distintos
  // mesmo sendo a mesma classe em tempo de execução. Não há incompatibilidade
  // real: é o mesmo objeto que o adaptador criaria sozinho.
  const adaptador = new PrismaPg(pool as unknown as ConstructorParameters<typeof PrismaPg>[0])
  const cliente = new PrismaClient({ adapter: adaptador, log: ["error"] })
  porEmpresa.set(organizacaoId, { cliente, pool, usadoEm: Date.now() })
  return cliente
}

/** Quantos pools estão abertos. Só para diagnóstico. */
export function poolsAbertos(): number {
  return porEmpresa.size
}
