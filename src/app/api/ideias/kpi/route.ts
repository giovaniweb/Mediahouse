import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const now = new Date()
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalIdeias,
    novas,
    emAnalise,
    aprovadas,
    emProducao,
    realizadas,
    descartadas,
    ideiasEsteMes,
    porOrigem,
    porClassificacao,
    porProdutoRaw,
    scores,
  ] = await Promise.all([
    prisma.ideiaVideo.count(),
    prisma.ideiaVideo.count({ where: { status: "nova" } }),
    prisma.ideiaVideo.count({ where: { status: "em_analise" } }),
    prisma.ideiaVideo.count({ where: { status: "aprovada" } }),
    prisma.ideiaVideo.count({ where: { status: "em_producao" } }),
    prisma.ideiaVideo.count({ where: { status: "realizada" } }),
    prisma.ideiaVideo.count({ where: { status: "descartada" } }),
    prisma.ideiaVideo.count({ where: { createdAt: { gte: inicioMes } } }),
    prisma.ideiaVideo.groupBy({ by: ["origem"], _count: true }),
    prisma.ideiaVideo.groupBy({ by: ["classificacao"], _count: true, where: { classificacao: { not: null } } }),
    prisma.ideiaVideo.groupBy({
      by: ["produtoId"],
      _count: true,
      where: { produtoId: { not: null } },
    }),
    prisma.ideiaVideo.aggregate({
      _avg: { scoreIA: true },
      where: { scoreIA: { not: null } },
    }),
  ])

  // Get product names for porProduto
  const produtoIds = porProdutoRaw.map(p => p.produtoId!).filter(Boolean)
  const produtos = produtoIds.length > 0
    ? await prisma.produto.findMany({ where: { id: { in: produtoIds } }, select: { id: true, nome: true } })
    : []
  const produtoMap = new Map(produtos.map(p => [p.id, p.nome]))

  const porProduto = porProdutoRaw.map(p => ({
    produtoId: p.produtoId,
    produtoNome: produtoMap.get(p.produtoId!) || "Sem produto",
    total: p._count,
  }))

  // Realized count for product
  const realizadasPorProduto = produtoIds.length > 0
    ? await prisma.ideiaVideo.groupBy({
        by: ["produtoId"],
        _count: true,
        where: { produtoId: { not: null }, status: "realizada" },
      })
    : []
  const realizadasMap = new Map(realizadasPorProduto.map(r => [r.produtoId, r._count]))
  for (const p of porProduto) {
    (p as Record<string, unknown>).realizadas = realizadasMap.get(p.produtoId) || 0
  }

  // Monthly trend (last 6 months)
  const tendenciaMensal = []
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
    const monthStr = monthDate.toISOString().slice(0, 7)

    const [novasMes, realizadasMes] = await Promise.all([
      prisma.ideiaVideo.count({ where: { createdAt: { gte: monthDate, lte: monthEnd } } }),
      prisma.ideiaVideo.count({ where: { status: "realizada", convertidoEm: { gte: monthDate, lte: monthEnd } } }),
    ])

    tendenciaMensal.push({ month: monthStr, novas: novasMes, realizadas: realizadasMes })
  }

  const totalSemDescartadas = totalIdeias - descartadas
  const taxaConversao = totalSemDescartadas > 0 ? Math.round((realizadas / totalSemDescartadas) * 100) : 0

  return NextResponse.json({
    totalIdeias,
    novas,
    emAnalise,
    aprovadas,
    emProducao,
    realizadas,
    descartadas,
    ideiasEsteMes,
    taxaConversao,
    mediaScoreIA: scores._avg.scoreIA ? Math.round(scores._avg.scoreIA) : null,
    porOrigem: porOrigem.map(o => ({ origem: o.origem, count: o._count })),
    porClassificacao: porClassificacao.map(c => ({ classificacao: c.classificacao, count: c._count })),
    porProduto,
    tendenciaMensal,
  })
}
