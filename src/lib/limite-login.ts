// Trava de tentativas do login, do "esqueci a senha" e da troca de senha.
//
// Até 07/10/2026 a contagem vivia na memória de cada servidor da Vercel
// (lib/rate-limit): com as tentativas espalhadas entre instâncias, cada uma via
// poucas e ninguém barrava quem ficava testando senhas. Agora a contagem é a
// mesma dos formulários públicos, no banco (consumir_limite_publico), por CONTA
// e por IP: a conta segura o ataque a uma pessoa; o IP, quem testa várias contas.
//
// Nada em claro: a conta e o IP viram HMAC com segredo do servidor antes de
// chegar ao banco. Banco fora do ar ao contar = recusa. O login também precisa
// do banco para conferir a senha, então não há o que perder falhando fechado.
import { consumirLimitePublico, hashComSegredo, hashDoIp } from "@/lib/limite-publico"

const QUINZE_MIN = 15 * 60
const UMA_HORA = 60 * 60

export const LIMITES_LOGIN = {
  // 10 senhas erradas seguidas numa conta é ataque, não distração.
  login: { conta: { max: 10, janelaSeg: QUINZE_MIN }, ip: { max: 50, janelaSeg: QUINZE_MIN } },
  // Cada pedido manda um e-mail: 3 por hora para a mesma conta já cobre o "não chegou".
  esqueci: { conta: { max: 3, janelaSeg: UMA_HORA }, ip: { max: 10, janelaSeg: UMA_HORA } },
  // A troca usa o token do e-mail; o limite é contra adivinhar token.
  redefinir: { conta: null, ip: { max: 10, janelaSeg: QUINZE_MIN } },
} as const

export type ResultadoLimite = "ok" | "bloqueado" | "indisponivel"

/** Normaliza o que a pessoa digitou (e-mail ou telefone) para contar sempre a mesma conta. */
export function contaDigitada(entrada: string): string {
  const t = entrada.trim().toLowerCase()
  return t.includes("@") ? t : t.replace(/\D/g, "") || t
}

/**
 * Conta UMA tentativa. Consome a conta e o IP; "bloqueado" se qualquer um passou
 * do teto. Conta toda tentativa, certa ou errada: a função do banco só soma, e
 * acertar a senha 10 vezes em 15 minutos não é uso normal.
 */
export async function consumirLimiteLogin(
  tipo: keyof typeof LIMITES_LOGIN,
  headers: Headers,
  conta?: string | null,
): Promise<ResultadoLimite> {
  const regra = LIMITES_LOGIN[tipo]
  const chaves: { chave: string; max: number; janelaSeg: number }[] = []
  const ip = hashDoIp(headers)
  chaves.push({ chave: `${tipo}:ip:${ip ?? "desconhecido"}`, ...regra.ip })
  if (regra.conta && conta) {
    const h = hashComSegredo("conta", contaDigitada(conta))
    if (h) chaves.push({ chave: `${tipo}:conta:${h}`, ...regra.conta })
  }
  try {
    // As duas sempre: parar na primeira deixaria a conta sem contar quando o IP barra.
    const resultados = await Promise.all(chaves.map(c => consumirLimitePublico(c.chave, c.max, c.janelaSeg)))
    return resultados.every(Boolean) ? "ok" : "bloqueado"
  } catch (e) {
    console.error(`[limite-login] ${tipo}: contagem indisponível — tentativa recusada.`, (e as Error).message)
    return "indisponivel"
  }
}
