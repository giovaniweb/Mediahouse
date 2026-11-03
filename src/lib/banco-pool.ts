// Conexões com o banco: um Pool por URL, no processo inteiro.
//
// O pooler do Supabase aceita 200 clientes ao mesmo tempo no modo transação
// (porta 6543). Em 03/11/2026 um deploy no meio do expediente passou desse teto
// por quatro minutos (`EMAXCONN ... limit: 200`) e as rotas devolveram 500/503.
//
// Antes, cada cliente Prisma (app, auth, admin) abria o próprio Pool com o
// padrão do `pg`: até 10 conexões cada, e a ociosa só fechava depois de 10 s.
// O relógio da ociosa não anda com a instância congelada. A Vercel congela a
// instância logo depois da resposta, e na troca de deploy as instâncias da
// versão anterior ficavam paradas segurando as conexões abertas enquanto as da
// versão nova abriam as delas.
//
// Três travas, e cada uma resolve uma parte:
//   1. Um Pool por URL, guardado em `globalThis`. O Next pode avaliar os
//      arquivos do Prisma mais de uma vez no mesmo processo, e app e auth usam
//      a mesma URL enquanto o RLS estiver desligado: tudo cai no mesmo Pool.
//   2. No máximo 5 conexões por Pool, e a ociosa fecha em 5 s.
//   3. `attachDatabasePool` segura a instância acordada até as ociosas
//      fecharem, antes de a Vercel congelá-la. Fora da Vercel não faz nada.
//
// O RLS não muda: `app.org_id` continua valendo por transação (SET LOCAL), e
// nenhum código abre ajuste de sessão. Dividir o Pool não deixa resíduo.
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { attachDatabasePool } from "@vercel/functions/db-connections"
import { conexaoBanco } from "@/lib/banco-conexao"

export const LIMITE_POOL = { max: 5, idleTimeoutMillis: 5_000 } as const

const globalParaPools = globalThis as unknown as { nuflowPools?: Map<string, Pool> }

type Tipo = "app" | "auth" | "admin"
type Env = Readonly<Record<string, string | undefined>>

export function poolDoBanco(tipo: Tipo, env: Env = process.env): Pool {
  const url = conexaoBanco(tipo, env)
  const pools = (globalParaPools.nuflowPools ??= new Map())
  const existente = pools.get(url ?? "")
  if (existente) return existente

  const pool = new Pool({ connectionString: url, ...LIMITE_POOL })
  // Sem ouvinte, uma conexão ociosa que o pooler derruba vira exceção sem dono
  // e mata o processo. O do Prisma só existe entre o connect e o $disconnect.
  pool.on("error", erro => console.error(`[banco] conexão ociosa caiu (${tipo}):`, erro.message))
  attachDatabasePool(pool)
  pools.set(url ?? "", pool)
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
