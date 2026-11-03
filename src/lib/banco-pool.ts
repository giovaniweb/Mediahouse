// Conexões com o banco: um Pool por papel (app, auth, admin), no processo inteiro.
//
// O pooler do Supabase aceita 200 clientes ao mesmo tempo no modo transação
// (porta 6543). Em 03/11/2026 um deploy no meio do expediente passou desse teto
// por quatro minutos (`EMAXCONN ... limit: 200`) e as rotas devolveram 500/503.
//
// Antes, cada cliente Prisma (app, auth, admin) abria o próprio Pool com o
// padrão do `pg`: até 10 conexões cada, e a ociosa só fechava depois de 10 s.
// O Next avalia esses arquivos duas vezes por processo (rotas de API e páginas),
// então eram dois Pools de cada. E o relógio da ociosa não anda com a instância
// congelada: a Vercel congela a instância logo depois da resposta, e na troca
// de deploy as instâncias da versão anterior ficavam paradas segurando as
// conexões abertas enquanto as da versão nova abriam as delas.
//
// Três travas, e cada uma resolve uma parte:
//   1. Um Pool por papel, guardado em `globalThis`: as duas avaliações do Next
//      caem no mesmo Pool.
//   2. Teto por papel (app 10, auth 5, admin 5), ociosa fechando em 5 s, e no
//      máximo 10 s de espera por uma conexão livre — espera maior vira erro,
//      não função pendurada até o limite da Vercel.
//   3. `attachDatabasePool` segura a instância acordada até as ociosas
//      fecharem, antes de a Vercel congelá-la. Fora da Vercel não faz nada.
//
// Os papéis não dividem Pool, nem quando a URL é a mesma (RLS desligado): uma
// transação do app que consulte o auth por dentro pega a conexão do Pool do
// auth e não fica esperando por uma que ela mesma segura. Transação que pede
// uma segunda conexão do PRÓPRIO cliente trava com qualquer teto; o
// `auditar:transacoes` barra isso no CI.
//
// O RLS não muda: `app.org_id` continua valendo por transação (SET LOCAL).
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { attachDatabasePool } from "@vercel/functions/db-connections"
import { conexaoBanco } from "@/lib/banco-conexao"

type Tipo = "app" | "auth" | "admin"
type Env = Readonly<Record<string, string | undefined>>

export const LIMITE_POOL: Record<Tipo, number> = { app: 10, auth: 5, admin: 5 }
export const TEMPOS_POOL = { idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000 } as const

const globalParaPools = globalThis as unknown as { nuflowPools?: Map<string, Pool> }

export function poolDoBanco(tipo: Tipo, env: Env = process.env): Pool {
  const url = conexaoBanco(tipo, env)
  const chave = `${tipo} ${url ?? ""}`
  const pools = (globalParaPools.nuflowPools ??= new Map())
  const existente = pools.get(chave)
  if (existente) return existente

  const pool = new Pool({ connectionString: url, max: LIMITE_POOL[tipo], ...TEMPOS_POOL })
  // Sem ouvinte, uma conexão ociosa que o pooler derruba vira exceção sem dono
  // e mata o processo. O do Prisma só existe entre o connect e o $disconnect.
  pool.on("error", erro => console.error(`[banco] conexão ociosa caiu (${tipo}):`, erro.message))
  attachDatabasePool(pool)
  pools.set(chave, pool)
  return pool
}

/**
 * Adapter do Prisma sobre o Pool compartilhado. O `@prisma/adapter-pg` traz o
 * próprio `@types/pg` (8.11), mais velho que o nosso (8.18): em execução é o
 * mesmo `pg` e o adapter reconhece o Pool, só os tipos discordam.
 */
export function adapterDoBanco(tipo: Tipo, env: Env = process.env): PrismaPg {
  return new PrismaPg(poolDoBanco(tipo, env) as unknown as ConstructorParameters<typeof PrismaPg>[0])
}
