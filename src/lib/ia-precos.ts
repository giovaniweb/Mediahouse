/** Referência consultada em 2026-09-30. Não retroagir nem estender validade sem nova conferência. */
export const TABELA_IA = {
  versao: "anthropic-standard-global-2026-09-30",
  consultadoEm: "2026-09-30", inicio: "2026-09-30T00:00:00.000Z", fim: "2026-10-30T00:00:00.000Z",
  fonte: "https://platform.claude.com/docs/en/about-claude/pricing",
  moeda: "USD",
} as const
// USD por milhão de tokens: API direta, padrão/global, sem batch/fast/tools.
const PRECOS: Record<string, { entrada: number; saida: number; leitura: number }> = {
  "claude-haiku-4-5": { entrada: 1, saida: 5, leitura: 0.1 },
  "claude-sonnet-4-5": { entrada: 3, saida: 15, leitura: 0.3 },
  "claude-opus-4-6": { entrada: 5, saida: 25, leitura: 0.5 },
}
export function estimarGrupoIA(modelo: string, uso: { entrada: number; saida: number; leitura: number }) {
  const p = Object.hasOwn(PRECOS, modelo) ? PRECOS[modelo] : undefined
  if (!p || Object.values(uso).some(n => !Number.isSafeInteger(n) || n < 0)) return null
  return (uso.entrada * p.entrada + uso.saida * p.saida + uso.leitura * p.leitura) / 1_000_000
}
