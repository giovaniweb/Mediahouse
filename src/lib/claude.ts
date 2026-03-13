/**
 * Claude AI service — relatórios inteligentes, análises e feedback
 */

import Anthropic from "@anthropic-ai/sdk"

export const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODELO_RAPIDO = "claude-haiku-4-5"    // análises rápidas, realtime
export const MODELO_POTENTE = "claude-sonnet-4-5"  // relatórios completos, análises profundas

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function analisarComClaude(
  prompt: string,
  contexto: string,
  modelo: string = MODELO_RAPIDO
): Promise<{ texto: string; tokens: number }> {
  const response = await claude.messages.create({
    model: modelo,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `${contexto}\n\n${prompt}`,
      },
    ],
    system: `Você é o assistente de inteligência artificial do VideoOps, uma plataforma de gestão de produção audiovisual.
Analise os dados fornecidos e gere insights precisos, acionáveis e em português brasileiro.
Seja direto, prático e baseie suas conclusões nos dados reais.
Quando identificar problemas, proponha soluções específicas.
Formate a resposta em JSON estruturado conforme solicitado.`,
  })

  const texto = response.content[0].type === "text" ? response.content[0].text : ""
  const tokens = response.usage.input_tokens + response.usage.output_tokens

  return { texto, tokens }
}

// Extrai JSON de uma resposta que pode ter texto ao redor
export function extrairJSON(texto: string): unknown {
  try {
    // Tenta parsear direto
    return JSON.parse(texto)
  } catch {
    // Extrai bloco JSON
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
