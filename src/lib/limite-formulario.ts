// Limite dos formulários públicos de pedido e de cadastro de videomaker e designer.
//
// As duas rotas não tinham limite nenhum, e cada pedido público dispara aviso
// de WhatsApp para os gestores da empresa. A chave é por EMPRESA e por IP (HMAC):
// a recepção de uma clínica pode abrir vários pedidos seguidos do mesmo IP, e um
// excesso numa empresa não pode bloquear outra.
//
// Banco fora do ar ao contar = recusa (503). A escolha é falhar fechado: sem a
// contagem, não há como saber se aquele IP está inundando a empresa, e criar o
// pedido mesmo assim seria abrir mão do limite justamente quando ele não pode
// ser conferido. O formulário mantém o que a pessoa digitou.
import { NextResponse } from "next/server"
import { consumirLimitePublico, hashDoIp } from "@/lib/limite-publico"

export const LIMITES_FORMULARIO = {
  demanda: { max: 20, janelaSeg: 60 * 60 },
  videomaker: { max: 5, janelaSeg: 60 * 60 },
  designer: { max: 5, janelaSeg: 60 * 60 },
  // Ideia/solicitação para a social (/c/<slug>/ideia): não avisa ninguém, mas
  // enche a coluna Ideias — mesmo teto do pedido.
  ideia: { max: 20, janelaSeg: 60 * 60 },
} as const

export const MSG_EXCESSO = "Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo — o que você preencheu continua aqui."
export const MSG_INDISPONIVEL = "Não foi possível receber agora. Tente de novo em alguns minutos — o que você preencheu continua aqui."

/** null para seguir; uma resposta 429/503 para devolver como está. */
export async function barrarExcesso(
  headers: Headers,
  tipo: keyof typeof LIMITES_FORMULARIO,
  organizacaoId: string,
): Promise<NextResponse | null> {
  const { max, janelaSeg } = LIMITES_FORMULARIO[tipo]
  const chave = `${tipo}:${organizacaoId}:${hashDoIp(headers) ?? "desconhecido"}`
  let dentro: boolean
  try {
    dentro = await consumirLimitePublico(chave, max, janelaSeg)
  } catch (e) {
    console.error(`[limite] ${tipo}: contagem indisponível — envio recusado.`, (e as Error).message)
    return NextResponse.json({ error: MSG_INDISPONIVEL }, { status: 503 })
  }
  return dentro ? null : NextResponse.json({ error: MSG_EXCESSO }, { status: 429, headers: { "Retry-After": "300" } })
}
