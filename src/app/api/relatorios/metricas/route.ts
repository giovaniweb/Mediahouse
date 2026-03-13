import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/relatorios/metricas — métricas em tempo real para o dashboard de relatórios
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const inicioSemana = new Date(agora)
  inicioSemana.setDate(agora.getDate() - agora.getDay())
  inicioSemana.setHours(0, 0, 0, 0)
  const ha30dias = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ha7dias = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000)

  // ─── Demandas ─────────────────────────────────────────────────────────────
  const [
    totalAtivas,
    totalMes,
    totalSemana,
    concluidas30d,
    urgentes,
    emAtraso,
    aguardandoAprovacao,
    emEdicao,
    todasDemandas30d,
  ] = await Promise.all([
    prisma.demanda.count({ where: { statusVisivel: { notIn: ["finalizado"] } } }),
    prisma.demanda.count({ where: { createdAt: { gte: inicioMes } } }),
    prisma.demanda.count({ where: { createdAt: { gte: inicioSemana } } }),
    prisma.demanda.count({
      where: { statusInterno: { in: ["postado", "entregue_cliente", "encerrado"] }, updatedAt: { gte: ha30dias } },
    }),
    prisma.demanda.count({ where: { prioridade: "urgente", statusVisivel: { notIn: ["finalizado"] } } }),
    prisma.demanda.count({
      where: {
        dataLimite: { lt: agora },
        statusVisivel: { notIn: ["finalizado"] },
      },
    }),
    prisma.demanda.count({
      where: { statusInterno: { in: ["aguardando_aprovacao_interna", "urgencia_pendente_aprovacao"] } },
    }),
    prisma.demanda.count({ where: { statusInterno: { in: ["editor_atribuido", "fila_edicao", "editando"] } } }),
    prisma.demanda.findMany({
      where: { createdAt: { gte: ha30dias } },
      select: {
        createdAt: true,
        updatedAt: true,
        statusInterno: true,
        statusVisivel: true,
        prioridade: true,
        tipoVideo: true,
        pesoDemanda: true,
        dataLimite: true,
        historicos: {
          select: { statusNovo: true, statusAnterior: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ])

  // ─── Tempo médio de conclusão (em dias) ───────────────────────────────────
  const concluidas = todasDemandas30d.filter(
    (d) => d.statusInterno === "postado" || d.statusInterno === "entregue_cliente"
  )
  let tempoMedioConclusao = 0
  if (concluidas.length > 0) {
    const tempos = concluidas.map((d) => {
      const diff = d.updatedAt.getTime() - d.createdAt.getTime()
      return diff / (1000 * 60 * 60 * 24)
    })
    tempoMedioConclusao = tempos.reduce((a, b) => a + b, 0) / tempos.length
  }

  // ─── Volume por tipo de vídeo ─────────────────────────────────────────────
  const porTipo: Record<string, number> = {}
  for (const d of todasDemandas30d) {
    porTipo[d.tipoVideo] = (porTipo[d.tipoVideo] || 0) + 1
  }

  // ─── Distribuição por status (Kanban columns) ─────────────────────────────
  const statusCounts = await prisma.demanda.groupBy({
    by: ["statusVisivel"],
    _count: { id: true },
    where: { statusVisivel: { notIn: ["finalizado"] } },
  })

  // ─── Custos ───────────────────────────────────────────────────────────────
  const [custosMes, custosSemana, custosTotal, custosPorVideomaker] = await Promise.all([
    prisma.custoVideomaker.aggregate({
      where: { dataReferencia: { gte: inicioMes } },
      _sum: { valor: true },
      _count: true,
    }),
    prisma.custoVideomaker.aggregate({
      where: { dataReferencia: { gte: inicioSemana } },
      _sum: { valor: true },
    }),
    prisma.custoVideomaker.aggregate({
      where: { dataReferencia: { gte: ha30dias } },
      _sum: { valor: true },
      _count: true,
    }),
    prisma.custoVideomaker.groupBy({
      by: ["videomakerId"],
      where: { dataReferencia: { gte: ha30dias } },
      _sum: { valor: true },
      _count: { id: true },
      orderBy: { _sum: { valor: "desc" } },
      take: 5,
    }),
  ])

  // Buscar nomes dos videomakers do top 5
  const topVideomakersIds = custosPorVideomaker.map((c) => c.videomakerId)
  const topVideomakers = await prisma.videomaker.findMany({
    where: { id: { in: topVideomakersIds } },
    select: { id: true, nome: true, valorDiaria: true },
  })
  const vmMap = Object.fromEntries(topVideomakers.map((v) => [v.id, v]))

  const topVideomakersDetalhado = custosPorVideomaker.map((c) => ({
    id: c.videomakerId,
    nome: vmMap[c.videomakerId]?.nome ?? "Desconhecido",
    valorDiaria: vmMap[c.videomakerId]?.valorDiaria ?? 0,
    totalGasto: c._sum.valor ?? 0,
    qtdServicos: c._count.id,
    mediaServico: c._sum.valor && c._count.id ? c._sum.valor / c._count.id : 0,
  }))

  // ─── Custo por vídeo (últimos 30 dias) ────────────────────────────────────
  const custosPorDemanda = await prisma.custoVideomaker.groupBy({
    by: ["demandaId"],
    where: { dataReferencia: { gte: ha30dias }, demandaId: { not: null } },
    _sum: { valor: true },
  })
  const custoPorVideo =
    custosPorDemanda.length > 0
      ? custosPorDemanda.reduce((sum, c) => sum + (c._sum.valor ?? 0), 0) / custosPorDemanda.length
      : 0

  // ─── Videomakers ─────────────────────────────────────────────────────────
  const [totalVideomakers, videomakersAtivos] = await Promise.all([
    prisma.videomaker.count(),
    prisma.videomaker.count({ where: { status: { in: ["ativo", "preferencial"] } } }),
  ])

  // Videomakers com mais demandas nos últimos 30 dias
  const videomakersComDemandas = await prisma.demanda.groupBy({
    by: ["videomakerId"],
    where: { createdAt: { gte: ha30dias }, videomakerId: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  })

  const topVmIds = videomakersComDemandas.map((v) => v.videomakerId as string)
  const topVmInfo = await prisma.videomaker.findMany({
    where: { id: { in: topVmIds } },
    select: { id: true, nome: true, avaliacao: true, valorDiaria: true },
  })
  const topVmInfoMap = Object.fromEntries(topVmInfo.map((v) => [v.id, v]))

  const videomakersTop = videomakersComDemandas.map((v) => ({
    id: v.videomakerId!,
    nome: topVmInfoMap[v.videomakerId!]?.nome ?? "Desconhecido",
    avaliacao: topVmInfoMap[v.videomakerId!]?.avaliacao ?? 0,
    valorDiaria: topVmInfoMap[v.videomakerId!]?.valorDiaria ?? 0,
    demandasMes: v._count.id,
  }))

  // ─── Alertas ativos ───────────────────────────────────────────────────────
  const alertasAtivos = await prisma.alertaIA.count({ where: { status: "ativo" } })
  const alertasCriticos = await prisma.alertaIA.count({ where: { status: "ativo", severidade: "critico" } })

  // ─── Tendência semanal (últimas 4 semanas) ─────────────────────────────────
  const tendencia = []
  for (let i = 3; i >= 0; i--) {
    const inicio = new Date(agora.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000)
    const fim = new Date(agora.getTime() - i * 7 * 24 * 60 * 60 * 1000)
    const [criadas, concluidas_sem] = await Promise.all([
      prisma.demanda.count({ where: { createdAt: { gte: inicio, lt: fim } } }),
      prisma.demanda.count({
        where: {
          updatedAt: { gte: inicio, lt: fim },
          statusInterno: { in: ["postado", "entregue_cliente"] },
        },
      }),
    ])
    tendencia.push({
      semana: `S${4 - i}`,
      criadas,
      concluidas: concluidas_sem,
    })
  }

  return NextResponse.json({
    geradoEm: agora.toISOString(),
    demandas: {
      totalAtivas,
      totalMes,
      totalSemana,
      concluidas30d,
      urgentes,
      emAtraso,
      aguardandoAprovacao,
      emEdicao,
      tempoMedioConclusao: Math.round(tempoMedioConclusao * 10) / 10,
      porTipo: Object.entries(porTipo)
        .map(([tipo, count]) => ({ tipo, count }))
        .sort((a, b) => b.count - a.count),
      porStatus: statusCounts.map((s) => ({
        status: s.statusVisivel,
        count: s._count.id,
      })),
    },
    custos: {
      totalMes: custosMes._sum.valor ?? 0,
      totalSemana: custosSemana._sum.valor ?? 0,
      total30d: custosTotal._sum.valor ?? 0,
      qtdServicos30d: custosTotal._count,
      custoPorVideo: Math.round(custoPorVideo * 100) / 100,
      topVideomakers: topVideomakersDetalhado,
    },
    videomakers: {
      total: totalVideomakers,
      ativos: videomakersAtivos,
      topPorDemandas: videomakersTop,
    },
    alertas: { ativos: alertasAtivos, criticos: alertasCriticos },
    tendencia,
  })
}
