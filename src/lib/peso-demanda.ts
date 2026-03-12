import type { Prioridade } from "@prisma/client"

const PESOS_TIPO: Record<string, number> = {
  corte_simples:       1,
  social_media:        1,
  stories:             1,
  reels:               1,
  vsl:                 2,
  video_meta_ads:      2,
  video_google_ads:    2,
  teste_criativo:      1.5,
  video_institucional: 3,
  treinamento:         3,
  comunicacao_interna: 2,
  video_convite:       2,
  teaser:              2,
  aftermovie:          4,
  cobertura_evento:    5,
  video_cultura:       3,
  outros:              2,
}

const BONUS_PRIORIDADE: Record<Prioridade, number> = {
  normal:  0,
  alta:    1,
  urgente: 3,
}

export function calcularPeso(tipoVideo: string, prioridade: Prioridade): number {
  const basePeso = PESOS_TIPO[tipoVideo] ?? 2
  const bonus = BONUS_PRIORIDADE[prioridade]
  return Math.min(basePeso + bonus, 10)
}

export function calcularCargaTotal(
  demandas: Array<{ pesoDemanda: number }>
): number {
  return demandas.reduce((sum, d) => sum + d.pesoDemanda, 0)
}

export function avaliarSobrecarga(
  cargaAtual: number,
  cargaLimite: number
): "ok" | "atencao" | "sobrecarga" {
  const pct = cargaAtual / cargaLimite
  if (pct >= 1) return "sobrecarga"
  if (pct >= 0.75) return "atencao"
  return "ok"
}
