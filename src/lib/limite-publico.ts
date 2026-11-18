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
  return hashComSegredo("ip", ipDaRequisicao(headers))
}

/**
 * O mesmo HMAC para outro identificador (o e-mail ou telefone de quem tenta
 * entrar). A contagem do login fica por conta sem o e-mail em claro no banco.
 */
export function hashComSegredo(rotulo: string, valor: string): string | null {
  const s = segredo()
  if (!s) return null
  return createHmac("sha256", `nuflow:${rotulo}:${s}`).update(valor).digest("base64url").slice(0, 32)
}

/** true enquanto a chave está dentro do teto na janela; false quando passou. */
export async function consumirLimitePublico(chave: string, max: number, janelaSeg: number): Promise<boolean> {
  const linhas = await prismaBase.$queryRaw<{ ok: boolean }[]>`
    SELECT public.consumir_limite_publico(${chave}, ${max}::int, ${janelaSeg}::int) AS ok`
  return linhas[0]?.ok === true
}

const DEZ_MIN = 10 * 60
/** Leitura: a página pode recarregar; escrita: quem envia não manda 30 vezes em 10 minutos. */
const TETO_TOKEN = { leitura: 120, escrita: 30 } as const

/**
 * Teto por IP das rotas abertas por token na URL (aprovação de vídeo, nota
 * fiscal, portal do fornecedor, entrega pelo convite). O token já é longo e
 * aleatório; o teto é contra quem varre tokens ou martela a rota (auditoria de
 * 18/11/2026). Devolve a resposta 429 para a rota retornar, ou null.
 * Banco fora do ar ao contar: segue (a própria rota depende do banco e vai
 * falhar do jeito dela), para não trocar um erro por outro.
 */
export async function barrarTokenPublico(
  headers: Headers,
  rota: string,
  tipo: keyof typeof TETO_TOKEN,
): Promise<Response | null> {
  const ip = hashDoIp(headers) ?? "desconhecido"
  try {
    if (await consumirLimitePublico(`token:${rota}:${tipo}:${ip}`, TETO_TOKEN[tipo], DEZ_MIN)) return null
  } catch (e) {
    console.error(`[limite-publico] ${rota}: contagem indisponível.`, (e as Error).message)
    return null
  }
  return Response.json(
    { error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo." },
    { status: 429, headers: { "Retry-After": String(DEZ_MIN) } },
  )
}
