// Leitura de erro de API no cliente.
//
// Dois defeitos que isto conserta:
//
// 1. `toast.error(String(e))` — String(new Error("Título curto")) devolve
//    "Error: Título curto". O prefixo é o JavaScript vazando para o usuário.
//    Apareceu em 26 pontos do projeto.
//
// 2. O erro chegava sem dizer QUAL campo estava errado, então todo problema
//    virava um toast no canto da tela — mesmo quando a causa era um input
//    específico que o usuário tinha na frente.
import type { CamposComErro } from "@/lib/erros-api"

export class ErroApi extends Error {
  readonly campos: CamposComErro
  readonly status: number
  /** Veio do middleware por sessão caída — e não de um 401 da própria rota. */
  readonly sessaoExpirada: boolean

  constructor(mensagem: string, campos: CamposComErro = {}, status = 400, sessaoExpirada = false) {
    super(mensagem)
    this.name = "ErroApi"
    this.campos = campos
    this.status = status
    this.sessaoExpirada = sessaoExpirada
  }

  /** Há campo específico para marcar no formulário? */
  temCampos(): boolean {
    return Object.keys(this.campos).length > 0
  }
}

/**
 * Constrói o erro a partir de uma resposta que não foi ok.
 * Tolera corpo vazio, HTML de erro de proxy e JSON fora do contrato.
 */
export async function erroDaResposta(res: Response, padrao = "Não foi possível concluir a ação."): Promise<ErroApi> {
  const texto = await res.text().catch(() => "")

  let corpo: unknown = null
  try {
    corpo = texto ? JSON.parse(texto) : null
  } catch {
    // Corpo não é JSON (HTML de gateway, texto solto). Cai no tratamento abaixo.
  }

  return erroDeCorpo(corpo, res.status, texto, padrao)
}

/**
 * Mesma leitura, para quem já consumiu o body da resposta — chamar `res.text()`
 * duas vezes lança, então quem lê o corpo antes precisa desta porta.
 */
export function erroDeCorpo(
  corpo: unknown,
  status: number,
  textoOriginal = "",
  padrao = "Não foi possível concluir a ação."
): ErroApi {
  if (corpo && typeof corpo === "object") {
    const { error, campos, sessaoExpirada } = corpo as { error?: unknown; campos?: unknown; sessaoExpirada?: unknown }
    const camposValidos: CamposComErro = {}
    if (campos && typeof campos === "object") {
      for (const [k, v] of Object.entries(campos as Record<string, unknown>)) {
        if (typeof v === "string") camposValidos[k] = v
      }
    }
    // `error` deveria ser sempre string pelo contrato; se alguma rota antiga
    // ainda mandar objeto, usamos o primeiro campo em vez de "[object Object]".
    const mensagem =
      typeof error === "string" && error.trim()
        ? error
        : (Object.values(camposValidos)[0] ?? `${padrao} (HTTP ${status})`)
    return new ErroApi(mensagem, camposValidos, status, sessaoExpirada === true)
  }

  const recorte = textoOriginal.trim().slice(0, 200)
  return new ErroApi(recorte || `${padrao} (HTTP ${status})`, {}, status)
}

/** Mensagem exibível de qualquer coisa jogada num catch — nunca com "Error:" na frente. */
export function mensagemDeErro(e: unknown, padrao = "Não foi possível concluir a ação."): string {
  if (e instanceof Error) return e.message || padrao
  if (typeof e === "string" && e.trim()) return e
  return padrao
}
