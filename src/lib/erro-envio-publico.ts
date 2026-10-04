// Mensagem de erro dos formulários públicos, para quem está do outro lado.
//
// Os formulários liam a resposta com `res.json()` e mostravam o que viesse. Um
// erro 500 sem corpo virava "Failed to execute 'json' on 'Response'" na tela de
// um cliente. E o 500 pode chegar DEPOIS de gravar (o pedido existe, a resposta
// falhou): reenviar na hora cria pedido duplicado. Daí o aviso explícito.

export const ENVIO_INCERTO =
  "Não conseguimos confirmar o envio. Ele pode ter sido registrado: antes de enviar de novo, aguarde alguns minutos e confira com a equipe."
export const SEM_CONEXAO = "Sem conexão com o servidor. Confira sua internet e tente de novo."
export const INDISPONIVEL = "Não foi possível receber agora. Tente de novo em alguns minutos."

/** Lê a resposta de erro: validação vira a lista de campos; o resto, uma frase clara. */
export async function erroDaResposta(res: Response): Promise<string> {
  // 503 é recusa antes de gravar (serviço ocupado): a mensagem do servidor
  // serve. Os outros 5xx podem ter vindo depois de gravar — daí o aviso.
  if (res.status >= 500 && res.status !== 503) return ENVIO_INCERTO
  const corpo = await res.json().catch(() => null) as { error?: unknown } | null
  if (res.status === 503) return typeof corpo?.error === "string" && corpo.error.trim() ? corpo.error : INDISPONIVEL
  const erro = corpo?.error
  if (typeof erro === "string" && erro.trim()) return erro
  if (erro && typeof erro === "object") {
    const lista = Object.values(erro as Record<string, unknown>).flat().filter(v => typeof v === "string") as string[]
    if (lista.length) return lista.join(", ")
  }
  return "Não foi possível enviar. Confira os campos e tente de novo."
}

/** Erro lançado pelo próprio fetch (sem resposta) é falta de conexão. */
export function erroDeEnvio(e: unknown): string {
  if (e instanceof TypeError) return SEM_CONEXAO
  return e instanceof Error && e.message ? e.message : ENVIO_INCERTO
}
