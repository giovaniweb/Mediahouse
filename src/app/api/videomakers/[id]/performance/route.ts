import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const videomaker = await prisma.videomaker.findUnique({
    where: { id },
    select: { id: true, nome: true, valorDiaria: true },
  })
  if (!videomaker) return NextResponse.json({ error: "Videomaker não encontrado" }, { status: 404 })

  // All demands
  const demandas = await prisma.demanda.findMany({
    where: { videomakerId: id },
    select: {
      id: true,
      statusVisivel: true,
      createdAt: true,
      updatedAt: true,
      tipoVideo: true,
      classificacao: true,
    },
  })

  const totalDemandas = demandas.length
  const concluidas = demandas.filter((d) => d.statusVisivel === "finalizado")
  const concluidasCount = concluidas.length
  const taxaConclusao = totalDemandas > 0 ? Math.round((concluidasCount / totalDemandas) * 100) : 0

  // Average days to complete
  let totalDias = 0
  for (const d of concluidas) {
    const dias = Math.floor((d.updatedAt.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    totalDias += dias
  }
  const tempoMedioDias = concluidasCount > 0 ? Math.round(totalDias / concluidasCount) : 0

  // Costs
  const custos = await prisma.custoVideomaker.aggregate({
    where: { videomakerId: id },
    _sum: { valor: true },
    _count: true,
  })
  const custoTotal = custos._sum.valor ?? 0
  const custoMedioPorVideo = concluidasCount > 0 ? custoTotal / concluidasCount : 0

  // Monthly performance (last 6 months)
  const now = new Date()
  const performanceMensal = []
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
    const monthStr = monthDate.toISOString().slice(0, 7)

    const monthDemandas = demandas.filter((d) => d.createdAt >= monthDate && d.createdAt <= monthEnd)
    const monthConcluidas = monthDemandas.filter((d) => d.statusVisivel === "finalizado")

    performanceMensal.push({
      month: monthStr,
      total: monthDemandas.length,
      concluidas: monthConcluidas.length,
      taxa: monthDemandas.length > 0 ? Math.round((monthConcluidas.length / monthDemandas.length) * 100) : 0,
    })
  }

  // B2C/B2B breakdown
  const b2cCount = demandas.filter((d) => d.classificacao === "b2c").length
  const b2bCount = demandas.filter((d) => d.classificacao === "b2b").length

  // By type
  const porTipo: Record<string, number> = {}
  for (const d of demandas) {
    porTipo[d.tipoVideo] = (porTipo[d.tipoVideo] || 0) + 1
  }

  return NextResponse.json({
    videomaker,
    totalDemandas,
    concluidas: concluidasCount,
    taxaConclusao,
    tempoMedioDias,
    custoTotal,
    custoMedioPorVideo,
    performanceMensal,
    metaPerformance: 80,
    acimaDaMeta: taxaConclusao >= 80,
    b2cCount,
    b2bCount,
    porTipo,
  })
}
