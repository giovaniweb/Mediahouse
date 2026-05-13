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
              finalizadaEm: true,
              updatedAt: true,
              videomaker: { select: { id: true, nome: true, valorDiaria: true } },
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

  // Bug 2 fix: usar última demanda FINALIZADA para o produto (igual à página de lista)
  // em vez de produto.ultimoConteudo que pode estar desatualizado
  const ultimaFinalizacaoProduto = await prisma.demandaProduto.findFirst({
    where: { produtoId: id, demanda: { statusVisivel: "finalizado" } },
    orderBy: { demanda: { updatedAt: "desc" } },
    select: { demanda: { select: { finalizadaEm: true, updatedAt: true } } },
  })
  const refDate =
    (ultimaFinalizacaoProduto?.demanda?.finalizadaEm ?? ultimaFinalizacaoProduto?.demanda?.updatedAt)
    ?? produto.ultimoConteudo
    ?? produto.createdAt

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

  // Fix 5: Consultar custos por demandaId IN [demandas do produto] — mais preciso que por vmId.
  // Evita incluir custos de outros produtos do mesmo videomaker.
  const demandaIds = demandas.map((d) => d.id)
  let totalCusto = 0
  const custosPorDemandaId = new Map<string, number>()
  const custosPorVmId = new Map<string, number>()
  if (demandaIds.length > 0) {
    const custosDemandasProduto = await prisma.custoVideomaker.findMany({
      where: { demandaId: { in: demandaIds } },
      select: { valor: true, videomakerId: true, demandaId: true },
    })
    for (const c of custosDemandasProduto) {
      const prev = custosPorDemandaId.get(c.demandaId ?? "") ?? 0
      custosPorDemandaId.set(c.demandaId ?? "", prev + c.valor)
      totalCusto += c.valor
      // Também agrupar por VM para videomakerStats
      const vmPrev = custosPorVmId.get(c.videomakerId) ?? 0
      custosPorVmId.set(c.videomakerId, vmPrev + c.valor)
    }
  }
  const custoMedio = totalVideos > 0 ? totalCusto / totalVideos : 0

  // Status breakdown
  const statusBreakdown: Record<string, number> = {}
  for (const d of demandas) {
    statusBreakdown[d.statusVisivel] = (statusBreakdown[d.statusVisivel] || 0) + 1
  }

  // Videomaker stats — usa custosPorVmId agrupado por demandaId do produto
  const vmMap = new Map<string, { nome: string; count: number; totalCusto: number }>()
  for (const d of demandas) {
    if (d.videomaker) {
      const existing = vmMap.get(d.videomaker.id) || { nome: d.videomaker.nome, count: 0, totalCusto: custosPorVmId.get(d.videomaker.id) ?? 0 }
      existing.count++
      vmMap.set(d.videomaker.id, existing)
    }
  }
  const videomakerStats = Array.from(vmMap.entries()).map(([vmId, v]) => ({ id: vmId, ...v }))

  // Monthly timeline
  // Bug 3 fix: usar dp.demanda.createdAt (data da demanda) e não dp.createdAt (data do vínculo ao produto)
  const monthlyMap = new Map<string, number>()
  for (const dp of produto.demandas) {
    const month = dp.demanda.createdAt.toISOString().slice(0, 7)
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
  // Bug 1 fix: usar finalizadaEm (ou updatedAt como fallback) em vez de now.
  // Antes: (now - createdAt) que cresce indefinidamente. Agora: (finalizadaEm - createdAt).
  let tempoMedioConclusao = 0
  const concluidas = produto.demandas.filter((dp) => dp.demanda.statusVisivel === "finalizado")
  if (concluidas.length > 0) {
    let totalDias = 0
    for (const dp of concluidas) {
      const ref = dp.demanda.finalizadaEm ?? dp.demanda.updatedAt
      const dias = Math.floor((ref.getTime() - dp.demanda.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      totalDias += Math.max(0, dias) // garantir que não seja negativo
    }
    tempoMedioConclusao = Math.round(totalDias / concluidas.length)
  }

  // Ideas KPIs
  let ideiasTotal = 0
  let ideiasPendentes = 0
  let ideiasRealizadas = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ideiasRecentes: any[] = []
  try {
    const results = await Promise.all([
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
    ideiasTotal = results[0]
    ideiasPendentes = results[1]
    ideiasRealizadas = results[2]
    ideiasRecentes = results[3]
  } catch {
    // ideiaVideo table may not exist yet
  }

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
