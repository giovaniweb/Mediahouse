// Regras de data de prazo de entrega.
//
// Histórico: prazos com ano implausível entravam por digitação — um dígito a
// menos no campo ("0026-06-29" em vez de "2026-06-29") virava um prazo no ano 26,
// e o registro nascia atrasado em dois mil anos. Duas demandas em produção
// entraram assim (VOP-26-5333 no ano 0026 e VOP-26-1740 no ano 0001).
//
// A checagem de "ano plausível" resolvia só metade: ela aceitava qualquer ano
// entre 2000 e 2100, então um prazo de 13/08/2004 numa demanda criada em 2026
// passava direto. A regra de negócio real é mais simples e mais forte:
// PRAZO DE ENTREGA NÃO PODE SER ANTERIOR AO DIA DE HOJE.

const FUSO = "America/Sao_Paulo"

/**
 * O dia em que um instante cai no fuso de São Paulo, como "YYYY-MM-DD".
 *
 * Use isto sempre que a pergunta for "que dia é/era isso para o usuário".
 * `toISOString().slice(0,10)` responde outra coisa — o dia em UTC — e às 21h de
 * Brasília as duas respostas já divergem.
 */
export function dataEmSaoPaulo(instante: Date): string {
  // "en-CA" formata como YYYY-MM-DD, exatamente o formato que comparamos.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante)
}

/** Hoje no fuso de São Paulo, como "YYYY-MM-DD". */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return dataEmSaoPaulo(agora)
}

/** "YYYY-MM-DD" somado de N dias, sem passar por Date (imune a fuso). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number)
  const base = new Date(Date.UTC(a, m - 1, d))
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" somado de N meses. Aritmética em UTC pelo mesmo motivo. */
export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = data.split("-").map(Number)
  const base = new Date(Date.UTC(a, m - 1, d))
  base.setUTCMonth(base.getUTCMonth() + meses)
  return base.toISOString().slice(0, 10)
}

/**
 * Extrai a data de calendário ("YYYY-MM-DD") de um valor de prazo.
 *
 * Prazo é data de calendário, não instante. Um `Date` vindo do banco é
 * convertido no fuso de São Paulo; uma string ISO tem a parte de data lida
 * literalmente — converter "2026-08-13T00:00:00.000Z" para o fuso local daria
 * 12/08, justamente o deslocamento de um dia que queremos evitar.
 */
export function dataCalendario(valor: string | Date): string | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null
    // Componentes UTC, não do fuso local: um prazo só-data é gravado como
    // meia-noite UTC (`new Date("2026-08-13")`), e convertê-lo para São Paulo na
    // volta devolveria 12/08 — o dia anterior ao que o usuário escolheu.
    return valor.toISOString().slice(0, 10)
  }

  const texto = valor.trim()
  if (!texto) return null

  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(texto)
  if (iso) return iso[1]

  const d = new Date(texto)
  if (Number.isNaN(d.getTime())) return null
  return hojeEmSaoPaulo(d)
}

export const ANO_MAXIMO = 2100

export type ResultadoPrazo = { ok: true } | { ok: false; motivo: string }

/**
 * Valida um prazo de entrega. Ausência é permitida — demanda sem prazo é válida.
 *
 * `referencia` permite validar contra outra data que não hoje (usado nos testes;
 * em produção é sempre o dia atual).
 */
export function validarPrazo(
  valor: string | Date | null | undefined,
  referencia: string = hojeEmSaoPaulo()
): ResultadoPrazo {
  if (valor === null || valor === undefined || valor === "") return { ok: true }

  const data = dataCalendario(valor)
  if (!data) return { ok: false, motivo: "Data inválida." }

  const ano = Number(data.slice(0, 4))
  if (ano > ANO_MAXIMO) {
    return { ok: false, motivo: `Ano acima de ${ANO_MAXIMO} — confira se não sobrou um dígito.` }
  }

  // Comparação lexicográfica: em "YYYY-MM-DD" ela equivale à cronológica.
  if (data < referencia) {
    return {
      ok: false,
      motivo: `O prazo de entrega não pode ser anterior a hoje (${formatarBR(referencia)}). Escolha ${formatarBR(referencia)} ou uma data futura.`,
    }
  }

  return { ok: true }
}

/** "YYYY-MM-DD" → "DD/MM/YYYY", para mensagem de usuário. */
export function formatarBR(data: string): string {
  const [a, m, d] = data.split("-")
  return d && m && a ? `${d}/${m}/${a}` : data
}

/** Duas datas de prazo apontam para o mesmo dia? Usado para não barrar
 *  edição de demanda antiga quando o prazo não foi tocado. */
export function mesmoDia(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return dataCalendario(a) === dataCalendario(b)
}
