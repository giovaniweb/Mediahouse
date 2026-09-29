/** Modelos e leitura de respostas. Chamadas de texto passam por ia-analise.ts. */
export const MODELO_RAPIDO   = "claude-haiku-4-5"    // análise opcional
export const MODELO_POTENTE  = "claude-opus-4-6"    // análise opcional de relatórios

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
