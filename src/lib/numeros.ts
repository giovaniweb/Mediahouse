// Leitura de número vindo de corpo de requisição.
//
// Dois defeitos que isto conserta:
//
// 1. `parseFloat(x)` sem checagem. Texto não numérico vira NaN, e a coluna
//    `double precision` do Postgres ACEITA NaN — depois disso qualquer soma que
//    inclua a linha também vira NaN, e não há como descobrir qual registro
//    envenenou o total.
//
// 2. `valor ? parseFloat(valor) : atual`. O zero é falsy, então "custo = 0"
//    silenciosamente preservava o valor antigo e a API respondia sucesso.

/** Número finito, ou null quando o valor é ausente/inválido. Zero é preservado. */
export function lerNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null
  if (typeof valor !== "string") return null

  const n = Number(valor.trim())
  return Number.isFinite(n) ? n : null
}

/** Inteiro finito, ou null. Recusa fracionário em vez de truncar em silêncio. */
export function lerInteiro(valor: unknown): number | null {
  const n = lerNumero(valor)
  if (n === null) return null
  return Number.isInteger(n) ? n : null
}

/**
 * Valor monetário: número finito e não negativo.
 * `presente` distingue "campo ausente" (não mexer) de "campo inválido" (recusar).
 */
export function lerValorMonetario(valor: unknown): { presente: boolean; ok: boolean; valor: number | null } {
  if (valor === undefined) return { presente: false, ok: true, valor: null }
  if (valor === null || valor === "") return { presente: true, ok: true, valor: null }

  const n = lerNumero(valor)
  if (n === null || n < 0) return { presente: true, ok: false, valor: null }
  return { presente: true, ok: true, valor: n }
}
