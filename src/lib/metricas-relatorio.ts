import { snapshotOperacionalSchema } from "@/lib/metricas-contrato"
import { prisma } from "@/lib/prisma"
import { diariasDaEmpresa } from "@/lib/videomaker-vinculo"
import { inicioDoDia } from "@/lib/datas"
import { metricasOperacionais } from "@/lib/metricas-operacionais"
import type { RecorteMetricas } from "@/lib/metricas-recorte"
export async function metricasRelatorio(organizacaoId: string, recorte: RecorteMetricas, financeiro: boolean) {
  const agora = new Date(), area = recorte.area, deDate = new Date(recorte.inicio), ateDate = new Date(recorte.fim)
  const operacional = await metricasOperacionais(organizacaoId, recorte)
  // ── Métricas estáticas (estado atual — não dependem de período) ────────────
  const [
    urgentes,
    emAtraso,
    aguardandoAprovacao,
    emEdicao,
  ] = await Promise.all([
    prisma.demanda.count({ where: { area, organizacaoId,prioridade: "urgente", statusVisivel: { notIn: ["finalizado"] } } }),
    prisma.demanda.count({ where: { area, organizacaoId,dataLimite: { lt: inicioDoDia() }, statusVisivel: { notIn: ["finalizado"] } } }),
    prisma.demanda.count({ where: { area, organizacaoId,statusInterno: { in: ["aguardando_aprovacao_interna", "urgencia_pendente_aprovacao"] } } }),
    prisma.demanda.count({ where: { area, organizacaoId,statusInterno: { in: ["editor_atribuido", "fila_edicao", "editando"] } } }),
  ])

  const concluidas = operacional.concluidas
  const videosEntregues = operacional.entregaveis
  const onTimeRate = operacional.noPrazoPercentual
  const tempoMedioConclusao = operacional.tempoMedioDias

  // ── Produção (índice de produtividade) ─────────────────────────────────────
  // Usa contagem de vídeos individuais entregues (Arquivo final), não de demandas

  // ── Volume por tipo de vídeo (criadas no período) ─────────────────────────
  const demandasPeriodo = await prisma.demanda.findMany({
    where: { area, organizacaoId,createdAt: { gte: deDate, lt: ateDate } },
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
    where: { area, organizacaoId,statusVisivel: { notIn: ["finalizado"] } },
  })

  // ── Custos (CustoVideomaker no período) ───────────────────────────────────
  const [custosAggregate, custosPorVideomaker] = await Promise.all([
    financeiro ? prisma.custoVideomaker.aggregate({
      where: { organizacaoId, demanda: { area, organizacaoId }, dataReferencia: { gte: deDate, lt: ateDate } },
      _sum: { valor: true },
      _count: true,
    }) : Promise.resolve({ _sum: { valor: null }, _count: 0 }),
    financeiro ? prisma.custoVideomaker.groupBy({
      by: ["videomakerId"],
      where: { organizacaoId, demanda: { area, organizacaoId }, dataReferencia: { gte: deDate, lt: ateDate } },
      _sum: { valor: true },
      _count: { id: true },
      orderBy: { _sum: { valor: "desc" } },
      take: 5,
    }) : Promise.resolve([]),
  ])

  const topVideomakersIds = custosPorVideomaker.map((c) => c.videomakerId)
  const topVideomakers = await prisma.videomaker.findMany({
    where: { id: { in: topVideomakersIds } },
    select: { id: true, nome: true },
  })
  const vmMap = Object.fromEntries(topVideomakers.map((v) => [v.id, v]))
  // Diária é do vínculo desta empresa — o relatório de uma não pode exibir o
  // preço que a outra negociou com o mesmo profissional.
  const diariasTop = financeiro ? await diariasDaEmpresa(topVideomakersIds, organizacaoId) : new Map<string, number>()

  const topVideomakersDetalhado = custosPorVideomaker.map((c) => ({
    id: c.videomakerId,
    nome: vmMap[c.videomakerId]?.nome ?? "Desconhecido",
    valorDiaria: diariasTop.get(c.videomakerId) ?? 0,
    totalGasto: c._sum.valor ?? 0,
    qtdServicos: c._count.id,
    mediaServico: c._sum.valor && c._count.id ? c._sum.valor / c._count.id : 0,
  }))

  // ── Videomakers ───────────────────────────────────────────────────────────
  const [totalVideomakers, videomakersAtivos] = await Promise.all([
    prisma.videomaker.count({ where: { vinculos: { some: { organizacaoId } } } }),
    prisma.videomaker.count({ where: { status: { in: ["ativo", "preferencial"] }, vinculos: { some: { organizacaoId } } } }),
  ])

  // Bug 6 fix: contar demandas finalizadas no período OU ativas com videomakerId atribuído,
  // em vez de apenas demandas CRIADAS no período (que resultava em ranking vazio em meses recentes)
  const videomakersComDemandas = await prisma.demanda.groupBy({
    by: ["videomakerId"],
    where: {
      area,
      organizacaoId,
      videomakerId: { not: null },
      OR: [
        { statusVisivel: "finalizado", finalizadaEm: { gte: deDate, lt: ateDate } },
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
    select: { id: true, nome: true, avaliacao: true },
  })
  const topVmInfoMap = Object.fromEntries(topVmInfo.map((v) => [v.id, v]))
  const diariasVm = financeiro ? await diariasDaEmpresa(topVmIds, organizacaoId) : new Map<string, number>()
  const videomakersTop = videomakersComDemandas.map((v) => ({
    id: v.videomakerId!,
    nome: topVmInfoMap[v.videomakerId!]?.nome ?? "Desconhecido",
    avaliacao: topVmInfoMap[v.videomakerId!]?.avaliacao ?? 0,
    ...(financeiro ? { valorDiaria: diariasVm.get(v.videomakerId!) ?? null } : {}),
    demandasMes: v._count.id,
  }))

  // ── Alertas ativos ────────────────────────────────────────────────────────
  const [alertasAtivos, alertasCriticos] = await Promise.all([
    prisma.alertaIA.count({ where: { status: "ativo", organizacaoId } }),
    prisma.alertaIA.count({ where: { status: "ativo", severidade: "critico", organizacaoId } }),
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
      prisma.demanda.count({ where: { area, organizacaoId,createdAt: { gte: inicio, lt: fim } } }),
      prisma.demanda.count({
        where: {
          area,
          organizacaoId,
          statusVisivel: "finalizado", finalizadaEm: { gte: inicio, lt: fim },
        },
      }),
    ])
    tendencia.push({ semana: `Faixa ${i + 1}`, criadas, concluidas: concluidasFatia })
  }

  const [totalIdeias, novasIdeias, realizadasIdeias, criadasIdeias] = await Promise.all([
    prisma.ideiaVideo.count({ where: { organizacaoId } }),
    prisma.ideiaVideo.count({ where: { organizacaoId, status: "nova" } }),
    prisma.ideiaVideo.count({ where: { organizacaoId, status: "realizada" } }),
    prisma.ideiaVideo.count({ where: { organizacaoId, createdAt: { gte: deDate, lt: ateDate } } }),
  ])
  return {
    bancoIdeias: { escopo: "empresa_sem_separacao_de_area" as const, total: totalIdeias, novas: novasIdeias, realizadas: realizadasIdeias, criadasPeriodo: criadasIdeias },
    operacional,
    versaoMetricas: recorte.versao,
    geradoEm: agora.toISOString(),
    periodo: { de: recorte.de, ate: recorte.ate, inicio: recorte.inicio, fim: recorte.fim, fuso: recorte.fuso, tipo: recorte.tipo, area },
    demandas: {
      totalAtivas: operacional.ativas,
      totalMes: operacional.criadas,   // criadas no período
      totalSemana: operacional.criadas, // retrocompat
      concluidas30d: concluidas,        // finalizadas no período
      urgentes,
      emAtraso,
      aguardandoAprovacao,
      emEdicao,
      tempoMedioConclusao,
      porTipo: Object.entries(porTipo)
        .map(([tipo, count]) => ({ tipo, count }))
        .sort((a, b) => b.count - a.count),
      porStatus: statusCounts.map((s) => ({ status: s.statusVisivel, count: s._count.id })),
    },
    ...(financeiro ? { custos: {
      totalMes: custosAggregate._sum.valor ?? 0,
      totalSemana: custosAggregate._sum.valor ?? 0,
      total30d: custosAggregate._sum.valor ?? 0,
      qtdServicos30d: custosAggregate._count,
      // Custos vinculados à área / entregáveis identificados no período.
      custoPorVideo: videosEntregues > 0
        ? Math.round((custosAggregate._sum.valor ?? 0) / videosEntregues * 100) / 100
        : null,
      topVideomakers: topVideomakersDetalhado,
      escopo: "Custos vinculados a demandas desta área; lançamentos sem demanda não rateados",
    } } : {}),
    producao: {
      demandasFinalizadasMes: concluidas,
      demandasFinalizadas30d: concluidas,
      videosEntreguesMes: videosEntregues,
      videosEntregues30d: videosEntregues,
      onTimeRate, // % entregue no prazo (null se sem demandas com prazo)
    },
    videomakers: {
      total: totalVideomakers,
      ativos: videomakersAtivos,
      topPorDemandas: videomakersTop,
    },
    alertas: { ativos: alertasAtivos, criticos: alertasCriticos },
    tendencia,
  }
}

export function snapshotDoRelatorio(dados: Awaited<ReturnType<typeof metricasRelatorio>>) {
  const metricas = snapshotOperacionalSchema.parse(dados.operacional)
  return { demandasCriadas: metricas.criadas, concluidas: metricas.concluidas, emAndamento: metricas.ativas,
    custoTotal: dados.custos?.totalMes ?? null, custoPorVideo: dados.custos?.custoPorVideo ?? null,
    tempoMedioDias: metricas.tempoMedioDias, alertasAtivos: dados.alertas.ativos, metricas,
    bancoIdeias: dados.bancoIdeias,
    equipe: dados.videomakers.topPorDemandas.map(v => ({ nome: v.nome, demandasAtivasOuConcluidasPeriodo: v.demandasMes })),
  }
}
