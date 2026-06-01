import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const VALOR_POR_DEMANDA = 200

/**
 * GET /api/relatorios/metricas
 *
 * Query params (período das métricas dependentes de data):
 *   ?periodo=semana    → últimos 7 dias
 *   ?periodo=mes       → mês atual (padrão)
 *   ?periodo=3meses    → últimos 90 dias
 *   ?periodo=ano       → ano atual (jan 1 → hoje)
 *   ?periodo=custom&de=YYYY-MM-DD&ate=YYYY-MM-DD
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const periodoParam = sp.get("periodo") ?? "mes"
  const deParam = sp.get("de")
  const ateParam = sp.get("ate")
  // Área do relatório (separa audiovisual de design). Default audiovisual.
  const area = (sp.get("area") === "design" ? "design" : "audiovisual") as "audiovisual" | "design"

  const agora = new Date()

  // ── Calcular deDate / ateDate baseado no período ──────────────────────────
  let deDate: Date
  let ateDate: Date = new Date(agora)
  ateDate.setHours(23, 59, 59, 999)

  switch (periodoParam) {
    case "semana":
      deDate = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case "3meses":
      deDate = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000)
      break
    case "ano":
      deDate = new Date(agora.getFullYear(), 0, 1)
      break
    case "custom":
      deDate = deParam ? new Date(deParam) : new Date(agora.getFullYear(), agora.getMonth(), 1)
      if (ateParam) {
        ateDate = new Date(ateParam)
        ateDate.setHours(23, 59, 59, 999)
      }
      break
    case "mes":
    default:
      deDate = new Date(agora.getFullYear(), agora.getMonth(), 1)
      break
  }
  deDate.setHours(0, 0, 0, 0)

  // ── Métricas estáticas (estado atual — não dependem de período) ────────────
  const [
    totalAtivas,
    totalCriadasPeriodo,
    urgentes,
    emAtraso,
    aguardandoAprovacao,
    emEdicao,
  ] = await Promise.all([
    prisma.demanda.count({ where: { area, statusVisivel: { notIn: ["finalizado"] } } }),
    prisma.demanda.count({ where: { area, createdAt: { gte: deDate, lte: ateDate } } }),
    prisma.demanda.count({ where: { area, prioridade: "urgente", statusVisivel: { notIn: ["finalizado"] } } }),
    prisma.demanda.count({ where: { area, dataLimite: { lt: agora }, statusVisivel: { notIn: ["finalizado"] } } }),
    prisma.demanda.count({ where: { area, statusInterno: { in: ["aguardando_aprovacao_interna", "urgencia_pendente_aprovacao"] } } }),
    prisma.demanda.count({ where: { area, statusInterno: { in: ["editor_atribuido", "fila_edicao", "editando"] } } }),
  ])

  // ── Demandas finalizadas no período ───────────────────────────────────────
  // Usa finalizadaEm quando disponível; cai em updatedAt para demandas antigas (campo nullable)
  const demandasFinalizadas = await prisma.demanda.findMany({
    where: {
      area,
      OR: [
        { finalizadaEm: { gte: deDate, lte: ateDate } },
        { statusVisivel: "finalizado", finalizadaEm: null, updatedAt: { gte: deDate, lte: ateDate } },
      ],
    },
    select: { id: true, linkFinal: true },
  })
  const concluidas = demandasFinalizadas.length

  // ── Contar vídeos individuais entregues (Arquivo com tipoArquivo="final") ──
  // Demandas com registros Arquivo final usam a contagem real.
  // Demandas legacy (linkFinal presente mas sem Arquivo final) contam como 1.
  const demandaIdsFinalizadas = demandasFinalizadas.map(d => d.id)
  const arquivosFinaisPeriodo = demandaIdsFinalizadas.length > 0
    ? await prisma.arquivo.groupBy({
        by: ["demandaId"],
        where: { demandaId: { in: demandaIdsFinalizadas }, tipoArquivo: "final" },
        _count: { id: true },
      })
    : []
  const arquivosMapPeriodo = new Map(arquivosFinaisPeriodo.map(a => [a.demandaId, a._count.id]))
  let videosEntregues = 0
  for (const d of demandasFinalizadas) {
    const count = arquivosMapPeriodo.get(d.id)
    videosEntregues += count ?? (d.linkFinal ? 1 : 0)
  }

  // ── Tempo médio: só demandas com videomaker E finalizadaEm confiável ────────
  // Não usa updatedAt como fallback — updatedAt muda em qualquer edição posterior,
  // inflando artificialmente o tempo. Usamos apenas datas verificadas.
  const demandasComVM = await prisma.demanda.findMany({
    where: {
      area,
      videomakerId: { not: null },
      finalizadaEm: { not: null, gte: deDate, lte: ateDate },
    },
    select: { createdAt: true, finalizadaEm: true },
  })
  let tempoMedioConclusao = 0
  if (demandasComVM.length > 0) {
    const tempos = demandasComVM.map((d) =>
      (d.finalizadaEm!.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    )
    tempoMedioConclusao = tempos.reduce((a, b) => a + b, 0) / tempos.length
  }

  // ── Produção (índice de produtividade) ─────────────────────────────────────
  // Usa contagem de vídeos individuais entregues (Arquivo final), não de demandas
  const producaoPeriodo = videosEntregues * VALOR_POR_DEMANDA

  // ── Volume por tipo de vídeo (criadas no período) ─────────────────────────
  const demandasPeriodo = await prisma.demanda.findMany({
    where: { area, createdAt: { gte: deDate, lte: ateDate } },
    select: { tipoVideo: true },
  })
  const porTipo: Record<string, number> = {}
  for (const d of demandasPeriodo) {
    porTipo[d.tipoVideo] = (porTipo[d.tipoVideo] || 0) + 1
  }

  // ── Distribuição por status (estado atual) ────────────────────────────────
  const statusCounts = await prisma.demanda.groupBy({
    by: ["statusVisivel"],
    _count: { id: true },
    where: { area, statusVisivel: { notIn: ["finalizado"] } },
  })

  // ── Custos (CustoVideomaker no período) ───────────────────────────────────
  const [custosAggregate, custosPorVideomaker] = await Promise.all([
    prisma.custoVideomaker.aggregate({
      where: { dataReferencia: { gte: deDate, lte: ateDate } },
      _sum: { valor: true },
      _count: true,
    }),
    prisma.custoVideomaker.groupBy({
      by: ["videomakerId"],
      where: { dataReferencia: { gte: deDate, lte: ateDate } },
      _sum: { valor: true },
      _count: { id: true },
      orderBy: { _sum: { valor: "desc" } },
      take: 5,
    }),
  ])

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

  // ── Videomakers ───────────────────────────────────────────────────────────
  const [totalVideomakers, videomakersAtivos] = await Promise.all([
    prisma.videomaker.count(),
    prisma.videomaker.count({ where: { status: { in: ["ativo", "preferencial"] } } }),
  ])

  // Bug 6 fix: contar demandas finalizadas no período OU ativas com videomakerId atribuído,
  // em vez de apenas demandas CRIADAS no período (que resultava em ranking vazio em meses recentes)
  const videomakersComDemandas = await prisma.demanda.groupBy({
    by: ["videomakerId"],
    where: {
      area,
      videomakerId: { not: null },
      OR: [
        { finalizadaEm: { gte: deDate, lte: ateDate } },
        { statusVisivel: { notIn: ["finalizado"] } },
      ],
    },
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

  // ── Alertas ativos ────────────────────────────────────────────────────────
  const [alertasAtivos, alertasCriticos] = await Promise.all([
    prisma.alertaIA.count({ where: { status: "ativo" } }),
    prisma.alertaIA.count({ where: { status: "ativo", severidade: "critico" } }),
  ])

  // ── Tendência: semanas dentro do período selecionado ─────────────────────
  // Sempre 4 "fatias" do período, escaladas ao intervalo escolhido
  const duracaoTotal = ateDate.getTime() - deDate.getTime()
  const tamanhoFatia = duracaoTotal / 4
  const tendencia = []
  for (let i = 0; i < 4; i++) {
    const inicio = new Date(deDate.getTime() + i * tamanhoFatia)
    const fim = new Date(deDate.getTime() + (i + 1) * tamanhoFatia)
    const [criadas, concluidasFatia] = await Promise.all([
      prisma.demanda.count({ where: { area, createdAt: { gte: inicio, lt: fim } } }),
      prisma.demanda.count({
        where: {
          area,
          OR: [
            { finalizadaEm: { gte: inicio, lt: fim } },
            { statusVisivel: "finalizado", finalizadaEm: null, updatedAt: { gte: inicio, lt: fim } },
          ],
        },
      }),
    ])
    tendencia.push({ semana: `S${i + 1}`, criadas, concluidas: concluidasFatia })
  }

  return NextResponse.json({
    geradoEm: agora.toISOString(),
    periodo: { de: deDate.toISOString(), ate: ateDate.toISOString(), tipo: periodoParam },
    demandas: {
      totalAtivas,
      totalMes: totalCriadasPeriodo,   // criadas no período
      totalSemana: totalCriadasPeriodo, // retrocompat
      concluidas30d: concluidas,        // finalizadas no período
      urgentes,
      emAtraso,
      aguardandoAprovacao,
      emEdicao,
      tempoMedioConclusao: Math.round(tempoMedioConclusao * 10) / 10,
      porTipo: Object.entries(porTipo)
        .map(([tipo, count]) => ({ tipo, count }))
        .sort((a, b) => b.count - a.count),
      porStatus: statusCounts.map((s) => ({ status: s.statusVisivel, count: s._count.id })),
    },
    custos: {
      totalMes: custosAggregate._sum.valor ?? 0,
      totalSemana: custosAggregate._sum.valor ?? 0,
      total30d: custosAggregate._sum.valor ?? 0,
      qtdServicos30d: custosAggregate._count,
      // Bug 5 fix: custo real médio por serviço (não mais hardcoded em 200)
      custoPorVideo: custosAggregate._count > 0
        ? Math.round((custosAggregate._sum.valor ?? 0) / custosAggregate._count)
        : 0,
      topVideomakers: topVideomakersDetalhado,
    },
    producao: {
      valorPorDemanda: VALOR_POR_DEMANDA,
      producaoMes: producaoPeriodo,
      producao30d: producaoPeriodo,
      demandasFinalizadasMes: concluidas,
      demandasFinalizadas30d: concluidas,
      videosEntreguesMes: videosEntregues,
      videosEntregues30d: videosEntregues,
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
