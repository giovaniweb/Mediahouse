// Rate limiting em memória para rotas de autenticação.
// Cada instância serverless tem seu próprio contador, então isto não é um limite
// global exato — é o suficiente para tornar força bruta de senha e spam de
// "esqueci minha senha" inviáveis, sem adicionar dependência de Redis.
const tentativas = new Map<string, { count: number; resetAt: number }>()

// A limpeza acontece na leitura: sem ela o Map cresceria indefinidamente numa
// instância de vida longa.
function limparExpirados(agora: number) {
  for (const [chave, registro] of tentativas) {
    if (registro.resetAt <= agora) tentativas.delete(chave)
  }
}

export function checarRateLimit(
  chave: string,
  limite: number,
  janelaMs: number
): { ok: boolean; retryAfterSegundos: number } {
  const agora = Date.now()
  if (tentativas.size > 5000) limparExpirados(agora)

  const registro = tentativas.get(chave)
  if (!registro || registro.resetAt <= agora) {
    tentativas.set(chave, { count: 1, resetAt: agora + janelaMs })
    return { ok: true, retryAfterSegundos: 0 }
  }

  registro.count++
  if (registro.count > limite) {
    return { ok: false, retryAfterSegundos: Math.ceil((registro.resetAt - agora) / 1000) }
  }
  return { ok: true, retryAfterSegundos: 0 }
}

// Zera o contador após uma tentativa bem-sucedida, para que quem acertou a senha
// não fique preso pelo limite acumulado com erros de digitação anteriores.
export function limparRateLimit(chave: string) {
  tentativas.delete(chave)
}

// A Vercel entrega o IP do cliente no x-forwarded-for; sem ele, todo mundo cai
// no mesmo balde "desconhecido" — mais restritivo, nunca menos.
export function ipDaRequisicao(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return headers.get("x-real-ip") ?? "desconhecido"
}
