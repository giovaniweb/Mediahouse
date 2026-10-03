// Limite de tentativas dos formulários públicos, guardado no banco.
//
// `checarRateLimit` (lib/rate-limit.ts) conta na memória da instância. Na
// Vercel cada requisição pode cair numa instância diferente, então cada uma vê
// poucas tentativas e ninguém barra o spam. Aqui a contagem fica em
// `limites_publicos`, que só a função `consumir_limite_publico` (SECURITY
// DEFINER, migration 20261001005000) lê e escreve.
//
// `prismaBase` de propósito, como em org-por-credencial: a chamada acontece
// antes de haver empresa, e a função não depende de RLS.
import { createHmac } from "node:crypto"
import { prismaBase } from "@/lib/prisma"
import { ipDaRequisicao } from "@/lib/rate-limit"

function segredo(): string | null {
  return process.env.IP_HASH_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null
}

/**
 * HMAC do IP com segredo do servidor. Serve para contar tentativas sem guardar
 * dado pessoal: sem o segredo, o valor não volta a ser um IP (LGPD). Nunca o IP
 * puro, nunca um hash sem segredo, que se desfaz por força bruta em minutos.
 */
export function hashDoIp(headers: Headers): string | null {
  const s = segredo()
  if (!s) return null
  return createHmac("sha256", `nuflow:ip:${s}`).update(ipDaRequisicao(headers)).digest("base64url").slice(0, 32)
}

/** true enquanto a chave está dentro do teto na janela; false quando passou. */
export async function consumirLimitePublico(chave: string, max: number, janelaSeg: number): Promise<boolean> {
  const linhas = await prismaBase.$queryRaw<{ ok: boolean }[]>`
    SELECT public.consumir_limite_publico(${chave}, ${max}::int, ${janelaSeg}::int) AS ok`
  return linhas[0]?.ok === true
}
