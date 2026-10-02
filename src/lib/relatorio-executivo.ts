import { recorteMetricas } from "@/lib/metricas-recorte"
import { metricasOperacionais } from "@/lib/metricas-operacionais"
import { prisma } from "@/lib/prisma"

export const VALOR_POR_VIDEO = 200
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

// Meses disponíveis: de maio/2026 até o mês atual (descendente)
export function mesesDisponiveis(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  const now = new Date()
  let y = now.getFullYear(), m = now.getMonth() + 1
  while (y > 2026 || (y === 2026 && m >= 5)) {
    out.push({ value: `${y}-${String(m).padStart(2, "0")}`, label: `${MESES[m - 1]} ${y}` })
    m--; if (m === 0) { m = 12; y-- }
  }
  return out
}

// Resolve a organização a partir do token de leitura externa (query `?token=` ou
// header `Authorization: Bearer`). Retorna null quando o token não existe ou a
// organização está inativa — o chamador responde 401/404, nunca agrega tudo.
export async function orgPorRelatorioToken(token: string | null | undefined): Promise<string | null> {
  if (!token || token.length < 16) return null
  const org = await prisma.organizacao.findUnique({
    where: { relatorioToken: token },
    select: { id: true, ativo: true },
  })
  return org?.ativo ? org.id : null
}

export interface RelatorioExecutivo {
  mes: string
  area: "audiovisual" | "design"
  producaoPorCategoria: Record<string, number>
  nuflowVideos: number
  totalManual: number
  totalGeral: null
  aviso: string
  presencialPorCategoria: Record<string, number>
  producaoRS: number
  valorPorVideo: number
}

// Computa o resumo executivo de um mês: produção lançada (manual) + NuFlow + frentes presenciais.
// `organizacaoId` é obrigatório e vem primeiro: sem ele os números somariam todas as empresas.
export async function computeRelatorioExecutivo(
  organizacaoId: string,
  mesParam: string | null | undefined,
  areaRaw: string | null | undefined
): Promise<RelatorioExecutivo> {
  if (!organizacaoId) throw new Error("organizacaoId é obrigatório no relatório executivo")
  const recorte = recorteMetricas(new URLSearchParams({ ...(mesParam ? { mes: mesParam } : {}), ...(areaRaw ? { area: areaRaw } : {}) }))
  const op = await metricasOperacionais(organizacaoId,recorte)
  const producaoPorCategoria: Record<string,number> = {}, presencialPorCategoria: Record<string,number> = {}
  for (const l of op.manual.lancamentos) {
    const alvo = l.grupo === "presencial" ? presencialPorCategoria : producaoPorCategoria
    alvo[l.categoria] = (alvo[l.categoria] ?? 0) + l.quantidade
  }
  return { mes: recorte.de.slice(0,7), area: recorte.area, producaoPorCategoria, presencialPorCategoria,
    nuflowVideos: op.entregaveis, totalManual: op.manual.total, totalGeral: null, aviso: op.manual.aviso,
    producaoRS: op.entregaveis * VALOR_POR_VIDEO, valorPorVideo: VALOR_POR_VIDEO }
}
