// A parte do score da rede que a tela também usa (sem banco).
// Regras em lib/rede.ts e na Política de Avaliações.

export const MINIMO_AVALIACOES_REDE = 3

export type ScoreRede = {
  /** null enquanto houver menos de 3 avaliações na média ("Novo na rede"). */
  media: number | null
  avaliacoes: number
}

/** Aplica o "a partir de 3 avaliações" da Política. */
export function scoreExibivel(media: number | null, avaliacoes: number): ScoreRede {
  if (!avaliacoes || avaliacoes < MINIMO_AVALIACOES_REDE || media == null) return { media: null, avaliacoes: avaliacoes || 0 }
  return { media: Math.round(media * 10) / 10, avaliacoes }
}

/** "★ 4,6 · 12 avaliações" ou "Novo na rede": o mesmo texto em toda tela. */
export function textoScore(s: ScoreRede | null | undefined): string {
  if (!s || s.media == null) return "Novo na rede"
  return `★ ${s.media.toFixed(1).replace(".", ",")} · ${s.avaliacoes} ${s.avaliacoes === 1 ? "avaliação" : "avaliações"}`
}
