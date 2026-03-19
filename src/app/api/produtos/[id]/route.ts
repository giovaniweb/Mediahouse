import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const produto = await prisma.produto.findUnique({
    where: { id },
    include: {
      fabricante: { select: { id: true, nome: true } },
      demandas: {
        include: {
          demanda: {
            select: {
              id: true,
              titulo: true,
              codigo: true,
              statusVisivel: true,
              classificacao: true,
              tipoVideo: true,
              videomakerId: true,
              createdAt: true,
              videomaker: { select: { id: true, nome: true, valorDiaria: true } },
              custos: { select: { valor: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { demandas: true } },
    },
  })

  if (!produto) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })
  }

  const now = new Date()
  const refDate = produto.ultimoConteudo ?? produto.createdAt
  const diasSemConteudo = Math.floor(
    (now.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const emAlerta = diasSemConteudo > produto.alertaDias
  const score = produto.peso * (diasSemConteudo / Math.max(produto.alertaDias, 1))

  // KPI calculations
  const demandas = produto.demandas.map((dp) => dp.demanda)
  const totalVideos = demandas.length
  const b2cCount = demandas.filter((d) => d.classificacao === "b2c").length
  const b2bCount = demandas.filter((d) => d.classificacao === "b2b").length

  let totalCusto = 0
  for (const d of demandas) {
    for (const c of d.custos) {
      totalCusto += c.valor
    }
  }
  const custoMedio = totalVideos > 0 ? totalCusto / totalVideos : 0

  // Status breakdown
  const statusBreakdown: Record<string, number> = {}
  for (const d of demandas) {
    statusBreakdown[d.statusVisivel] = (statusBreakdown[d.statusVisivel] || 0) + 1
  }

  // Videomaker stats
  const vmMap = new Map<string, { nome: string; count: number; totalCusto: number }>()
  for (const d of demandas) {
    if (d.videomaker) {
      const existing = vmMap.get(d.videomaker.id) || { nome: d.videomaker.nome, count: 0, totalCusto: 0 }
      existing.count++
      for (const c of d.custos) {
        existing.totalCusto += c.valor
      }
      vmMap.set(d.videomaker.id, existing)
    }
  }
  const videomakerStats = Array.from(vmMap.entries()).map(([vmId, v]) => ({ id: vmId, ...v }))

  // Monthly timeline
  const monthlyMap = new Map<string, number>()
  for (const dp of produto.demandas) {
    const month = dp.createdAt.toISOString().slice(0, 7)
    monthlyMap.set(month, (monthlyMap.get(month) || 0) + 1)
  }
  const monthlyTimeline = Array.from(monthlyMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)

  // Active vs completed demands
  const demandasAtivas = demandas.filter((d) => d.statusVisivel !== "finalizado").length
  const demandasConcluidas = demandas.filter((d) => d.statusVisivel === "finalizado").length

  // Average completion time (days)
  let tempoMedioConclusao = 0
  const concluidas = produto.demandas.filter((dp) => dp.demanda.statusVisivel === "finalizado")
  if (concluidas.length > 0) {
    let totalDias = 0
    for (const dp of concluidas) {
      const dias = Math.floor((now.getTime() - dp.demanda.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      totalDias += dias
    }
    tempoMedioConclusao = Math.round(totalDias / concluidas.length)
  }

  // Ideas KPIs
  const [ideiasTotal, ideiasPendentes, ideiasRealizadas, ideiasRecentes] = await Promise.all([
    prisma.ideiaVideo.count({ where: { produtoId: id } }),
    prisma.ideiaVideo.count({ where: { produtoId: id, status: { in: ["nova", "em_analise", "aprovada"] } } }),
    prisma.ideiaVideo.count({ where: { produtoId: id, status: "realizada" } }),
    prisma.ideiaVideo.findMany({
      where: { produtoId: id },
      orderBy: { scoreIA: "desc" },
      take: 5,
      select: { id: true, titulo: true, status: true, scoreIA: true, origem: true, createdAt: true, linkReferencia: true },
    }),
  ])

  return NextResponse.json({
    produto: {
      ...produto,
      diasSemConteudo,
      emAlerta,
      score,
      kpi: {
        totalVideos,
        b2cCount,
        b2bCount,
        totalCusto,
        custoMedio,
        demandasAtivas,
        demandasConcluidas,
        tempoMedioConclusao,
        statusBreakdown,
        videomakerStats,
        monthlyTimeline,
        ideiasTotal,
        ideiasPendentes,
        ideiasRealizadas,
        ideiasRecentes,
      },
    },
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const existing = await prisma.produto.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })
  }

  const produto = await prisma.produto.update({
    where: { id },
    data: {
      ...(body.nome !== undefined && { nome: body.nome.trim() }),
      ...(body.descricao !== undefined && { descricao: body.descricao?.trim() || null }),
      ...(body.categoria !== undefined && { categoria: body.categoria?.trim() || null }),
      ...(body.fabricanteId !== undefined && { fabricanteId: body.fabricanteId || null }),
      ...(body.peso !== undefined && { peso: parseFloat(body.peso) }),
      ...(body.alertaDias !== undefined && { alertaDias: parseInt(body.alertaDias) }),
      ...(body.ativo !== undefined && { ativo: body.ativo }),
    },
  })

  return NextResponse.json(produto)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const existing = await prisma.produto.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })
  }

  await prisma.produto.update({
    where: { id },
    data: { ativo: false },
  })

  return NextResponse.json({ ok: true })
}
