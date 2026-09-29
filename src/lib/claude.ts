/**
 * Análises contextuais legadas — migração ao orçamento em andamento
 * Modelo principal: claude-opus-4-6 (adaptive thinking)
 * Modelo rápido:    claude-haiku-4-5
 */

import Anthropic from "@anthropic-ai/sdk"

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODELO_RAPIDO   = "claude-haiku-4-5"    // análises rápidas, batch
export const MODELO_POTENTE  = "claude-opus-4-6"    // agentes, relatórios completos, chat

const SYSTEM_VIDEOOPS = "Você auxilia a equipe do NuFlow em análises pontuais. Responda em português, com clareza e sem inventar dados. Não execute ações nem afirme ter acesso a ferramentas."

// ─── Helpers básicos ──────────────────────────────────────────────────────────

export async function analisarComClaude(
  prompt: string,
  contexto: string,
  modelo: string = MODELO_RAPIDO
): Promise<{ texto: string; tokens: number }> {
  const response = await claude.messages.create({
    model: modelo,
    max_tokens: 4096,
    ...(modelo === MODELO_POTENTE ? { thinking: { type: "adaptive" } } : {}),
    messages: [
      {
        role: "user",
        content: contexto ? `${contexto}\n\n${prompt}` : prompt,
      },
    ],
    system: SYSTEM_VIDEOOPS,
  })

  const texto = response.content.find(b => b.type === "text")?.text ?? ""
  const tokens = response.usage.input_tokens + response.usage.output_tokens

  return { texto, tokens }
}

// Extrai JSON de uma resposta que pode ter texto ao redor
export function extrairJSON(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    const match = texto.match(/```json\n?([\s\S]*?)\n?```/) ?? texto.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[1] ?? match[0])
      } catch {
        return null
      }
    }
    return null
  }
}
