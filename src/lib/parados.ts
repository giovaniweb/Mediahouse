/**
 * O que está parado — o bloco de cobrança do briefing diário.
 *
 * A equipe reclamou de demanda parada tempo demais esperando decisão. Em
 * 18/08/2026 havia 75 demandas em `aguardando_triagem`, 45 delas há mais de uma
 * semana, e 31 com o prazo vencido antes de alguém pegar. A mais antiga estava
 * parada havia 57 dias.
 *
 * O sistema já detectava isso e ninguém via, porque o aviso morava na Central de
 * Alertas — 706 itens dos quais quase todos eram falsos (ver `lib/alertas.ts`).
 * A cobrança passa para o briefing diário por um motivo estrutural: o briefing
 * **recalcula da tabela de demandas toda manhã**, então não tem como envelhecer.
 */

/** A partir de quantos dias sem movimento a demanda entra na cobrança. */
export const DIAS_PARA_COBRAR = 7

const DIA_MS = 86_400_000

export type DemandaParada = {
  codigo: string
  /** `updatedAt` — última vez que alguém mexeu */
  atualizadaEm: Date
}

export type ResumoParados = {
  /** quantas cruzaram o limite HOJE — número pequeno, é o que dá para agir */
  novasHoje: number
  /** quantas estão paradas no total — indicador de saúde */
  total: number
  /** há quantos dias a pior está parada */
  diasDaPior: number
  /** os códigos mais antigos, para o briefing citar por nome */
  piores: string[]
  /** quantas já passaram do prazo combinado */
  prazoVencido: number
}

/**
 * Monta o resumo a partir das demandas paradas e da contagem de prazo vencido.
 *
 * Função pura, e de propósito: o briefing manda WhatsApp para gestores de
 * verdade, então a montagem da mensagem precisa ser verificável sem disparar
 * nada.
 */
export function resumirParados(
  paradas: DemandaParada[],
  prazoVencido: number,
  agora: Date = new Date(),
  quantosPiores = 3
): ResumoParados {
  const diasParadaDe = (d: DemandaParada) =>
    Math.floor((agora.getTime() - d.atualizadaEm.getTime()) / DIA_MS)

  const ordenadas = [...paradas].sort(
    (a, b) => a.atualizadaEm.getTime() - b.atualizadaEm.getTime()
  )

  // "Cruzou hoje" = está parada há exatamente o limite. Amanhã ela deixa de ser
  // novidade e passa a contar só no total — senão a mesma demanda apareceria
  // como novidade todo dia, que é como um relatório vira papel de parede.
  const novasHoje = paradas.filter((d) => diasParadaDe(d) === DIAS_PARA_COBRAR).length

  return {
    novasHoje,
    total: paradas.length,
    diasDaPior: ordenadas.length > 0 ? diasParadaDe(ordenadas[0]) : 0,
    piores: ordenadas.slice(0, quantosPiores).map((d) => d.codigo),
    prazoVencido,
  }
}

/**
 * O texto que entra no briefing. Devolve string vazia quando não há nada parado
 * — dia limpo não merece parágrafo dizendo que está limpo.
 *
 * Deliberadamente NÃO lista as demandas: com 63 paradas, a lista completa
 * repetiria na mensagem o erro que a Central de Alertas cometeu na tela. Número,
 * os três piores por código, e quem quiser o resto abre o sistema.
 */
export function textoDeParados(r: ResumoParados): string {
  if (r.total === 0) return ""

  const linhas: string[] = []

  if (r.novasHoje > 0) {
    linhas.push(
      `⏳ ${r.novasHoje} demanda(s) completaram ${DIAS_PARA_COBRAR} dias sem andar hoje`
    )
  }

  linhas.push(`📌 ${r.total} parada(s) no total — a mais antiga há ${r.diasDaPior} dias`)

  if (r.prazoVencido > 0) {
    // Frase independente de propósito. "69 já passaram do prazo" logo abaixo de
    // "64 paradas" se lê como subconjunto, e não é: prazo vencido conta o quadro
    // inteiro, inclusive demanda que alguém mexeu ontem. Daí o número maior.
    linhas.push(`🔴 ${r.prazoVencido} demanda(s) com prazo vencido no quadro`)
  }

  if (r.piores.length > 0) {
    linhas.push(`\nMais antigas: ${r.piores.join(", ")}`)
  }

  return linhas.join("\n")
}
