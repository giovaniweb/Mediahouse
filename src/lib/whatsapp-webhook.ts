// Registro do webhook de entrada na Evolution.
//
// Mora aqui, e não dentro de uma rota, porque precisa ser chamado de dois
// lugares: do botão "Reativar recebimento de respostas" (reparo manual) e do
// fluxo de QR, assim que a instância conecta.
//
// O segundo é o que importa: parear a instância derruba o webhook em memória da
// Evolution. Antes, quem lia o QR ficava com o envio funcionando e o recebimento
// desligado, sem nada dizendo isso — foi assim que as respostas dos videomakers
// ficaram cinco meses mudas, e foi assim de novo em 16/08/2026, quando um "sim"
// caiu na janela de 18 minutos entre o pareamento e a reaplicação manual.

import { prisma } from "@/lib/prisma"
import crypto from "crypto"

export interface ResultadoWebhook {
  ok: boolean
  /** Lido de volta da Evolution: registrar e confiar foi o que quebrou isso. */
  confirmado: boolean
  urlRegistrada?: string
  eventos?: string[]
  erro?: string
}

export interface ConfigParaWebhook {
  id: string
  instanceUrl: string
  apiKey: string
  instanceId: string
  webhookSecret: string | null
}

/**
 * Registra (ou reaplica) o webhook de entrada e confere lendo de volta.
 *
 * `origem` precisa ser a URL pública em https — com a origem da requisição,
 * rodando local, registraríamos localhost e a Evolution nunca alcançaria.
 */
export async function registrarWebhookEntrada(
  config: ConfigParaWebhook,
  origem: string
): Promise<ResultadoWebhook> {
  if (!/^https:\/\//.test(origem)) {
    return { ok: false, confirmado: false, erro: "URL pública indisponível (NEXTAUTH_URL). A Evolution não alcançaria este endereço." }
  }

  // Sem segredo, o endpoint aceitaria qualquer origem — e ele cria demanda e
  // evento pelas ferramentas da IA. Gera um na primeira vez.
  let segredo = config.webhookSecret
  if (!segredo) {
    segredo = crypto.randomBytes(24).toString("base64url")
    await prisma.configWhatsapp.update({ where: { id: config.id }, data: { webhookSecret: segredo } })
  }

  const base = config.instanceUrl.replace(/\/$/, "")
  const url = `${origem.replace(/\/$/, "")}/api/whatsapp/webhook?s=${segredo}`
  const eventos = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]

  try {
    const res = await fetch(`${base}/webhook/set/${config.instanceId}`, {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      // A Evolution v1.8 espera os campos na raiz e em snake_case; a v2 aceita o
      // objeto `webhook` aninhado em camelCase. Mandamos os dois formatos: o
      // servidor usa o que reconhece e ignora o resto.
      body: JSON.stringify({
        enabled: true,
        url,
        webhook_by_events: false,
        webhook_base64: true,
        events: eventos,
        webhook: { enabled: true, url, webhookByEvents: false, webhookBase64: true, events: eventos },
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      const corpo = await res.text().catch(() => "")
      return { ok: false, confirmado: false, erro: `Evolution recusou (${res.status}): ${corpo.slice(0, 200)}` }
    }

    const check = await fetch(`${base}/webhook/find/${config.instanceId}`, {
      headers: { apikey: config.apiKey },
      signal: AbortSignal.timeout(10000),
    })
    const atual = await check.json().catch(() => ({}))
    const ativo = atual?.enabled ?? atual?.webhook?.enabled ?? false
    const eventosAtuais: string[] = atual?.events ?? atual?.webhook?.events ?? []

    return {
      ok: true,
      confirmado: !!ativo && eventosAtuais.includes("MESSAGES_UPSERT"),
      // A URL leva o segredo na query — devolvemos sem ele.
      urlRegistrada: url.split("?")[0],
      eventos: eventosAtuais,
    }
  } catch (e) {
    return { ok: false, confirmado: false, erro: e instanceof Error ? e.message : "Erro de rede ao falar com a Evolution" }
  }
}

/** A URL pública do NuFlow, ou "" quando não há uma em https. */
export function origemPublica(): string {
  const publica = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "")
  return /^https:\/\//.test(publica) ? publica : ""
}
