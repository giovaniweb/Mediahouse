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
  totalGeral: number
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
  const area: "audiovisual" | "design" = areaRaw === "design" ? "design" : "audiovisual"
  const hoje = new Date()
  let ano = hoje.getFullYear()
  let mes = hoje.getMonth() + 1
  if (mesParam && /^\d{4}-\d{2}$/.test(mesParam)) {
    const [y, m] = mesParam.split("-").map(Number)
    ano = y; mes = m
  }
  const de = new Date(Date.UTC(ano, mes - 1, 1))
  const ate = new Date(Date.UTC(ano, mes, 0, 23, 59, 59))
  const competencia = ano * 100 + mes

  // Produção manual (lançada) por grupo
  const lancamentos = await prisma.producaoManual.findMany({ where: { organizacaoId, area, competencia } })
  const producaoPorCategoria: Record<string, number> = {}
  const presencialPorCategoria: Record<string, number> = {}
  for (const l of lancamentos) {
    const alvo = l.grupo === "presencial" ? presencialPorCategoria : producaoPorCategoria
    alvo[l.categoria] = (alvo[l.categoria] ?? 0) + l.quantidade
  }
  const totalManual = Object.values(producaoPorCategoria).reduce((a, b) => a + b, 0)

  // Vídeos NuFlow entregues no mês (Arquivo final + legado linkFinal)
  const finalizadas = await prisma.demanda.findMany({
    where: {
      organizacaoId,
      area,
      OR: [
        { finalizadaEm: { gte: de, lte: ate } },
        { statusVisivel: "finalizado", finalizadaEm: null, updatedAt: { gte: de, lte: ate } },
      ],
    },
    select: { id: true, linkFinal: true },
  })
  const ids = finalizadas.map((d) => d.id)
  const arquivos = ids.length
    ? await prisma.arquivo.groupBy({ by: ["demandaId"], where: { demandaId: { in: ids }, tipoArquivo: "final" }, _count: { id: true } })
    : []
  const arqMap = new Map(arquivos.map((a) => [a.demandaId, a._count.id]))
  let nuflowVideos = 0
  for (const d of finalizadas) nuflowVideos += arqMap.get(d.id) ?? (d.linkFinal ? 1 : 0)

  const totalGeral = totalManual + nuflowVideos

  return {
    mes: `${ano}-${String(mes).padStart(2, "0")}`,
    area,
    producaoPorCategoria,
    nuflowVideos,
    totalManual,
    totalGeral,
    presencialPorCategoria,
    producaoRS: totalGeral * VALOR_POR_VIDEO,
    valorPorVideo: VALOR_POR_VIDEO,
  }
}
