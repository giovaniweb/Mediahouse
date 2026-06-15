import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

// Valor médio por demanda finalizada — índice de produtividade, não faturamento real
const VALOR_POR_DEMANDA = 200

// GET /api/producao?mes=2026-05        — mês específico
// GET /api/producao?de=2026-01-01&ate=2026-12-31  — intervalo customizado
// Default: últimos 12 meses
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const sp = req.nextUrl.searchParams
  const mesParam = sp.get("mes")
  const deParam = sp.get("de")
  const ateParam = sp.get("ate")

  let deDate: Date
  let ateDate: Date

  if (mesParam) {
    // ?mes=2026-05 → primeiro e último dia do mês
    const [ano, mes] = mesParam.split("-").map(Number)
    deDate = new Date(ano, mes - 1, 1, 0, 0, 0, 0)
    ateDate = new Date(ano, mes, 0, 23, 59, 59, 999)
  } else {
    ateDate = ateParam ? new Date(ateParam) : new Date()
    ateDate.setHours(23, 59, 59, 999)
    deDate = deParam
      ? new Date(deParam)
      : new Date(ateDate.getFullYear() - 1, ateDate.getMonth(), 1)
    deDate.setHours(0, 0, 0, 0)
  }

  // Busca demandas finalizadas no período
  // Usa finalizadaEm quando disponível; cai em updatedAt para demandas antigas (campo nullable)
  const demandas = await prisma.demanda.findMany({
    where: {
      organizacaoId,
      area: "audiovisual",
      OR: [
        { finalizadaEm: { gte: deDate, lte: ateDate } },
        { statusVisivel: "finalizado", finalizadaEm: null, updatedAt: { gte: deDate, lte: ateDate } },
      ],
    },
    select: {
      id: true,
      finalizadaEm: true,
      updatedAt: true,
      videomakerId: true,
      editorId: true,
      linkFinal: true,
      videomaker: { select: { id: true, nome: true, valorDiaria: true } },
      editor: { select: { id: true, nome: true, salario: true } },
    },
    orderBy: { updatedAt: "desc" },
  })

  const totalDemandas = demandas.length

  // ── Contar vídeos individuais entregues por demanda ──────────────────────
  // Demandas com registros Arquivo final usam contagem real.
  // Demandas legacy (linkFinal sem Arquivo) contam como 1.
  const demandaIdsProd = demandas.map(d => d.id)
  const arquivosFinaisProd = demandaIdsProd.length > 0
    ? await prisma.arquivo.groupBy({
        by: ["demandaId"],
        where: { demandaId: { in: demandaIdsProd }, tipoArquivo: "final" },
        _count: { id: true },
      })
    : []
  const arquivosMapProd = new Map(arquivosFinaisProd.map(a => [a.demandaId, a._count.id]))

  function videosNaDemanda(d: { id: string; linkFinal: string | null }): number {
    const count = arquivosMapProd.get(d.id)
    return count ?? (d.linkFinal ? 1 : 0)
  }

  const totalVideos = demandas.reduce((acc, d) => acc + videosNaDemanda(d), 0)
  const valorTotal = totalVideos * VALOR_POR_DEMANDA

  // ── Por mês ──────────────────────────────────────────────────────────────
  const mesMap = new Map<string, { label: string; demandas: number; videos: number; valor: number }>()

  demandas.forEach(d => {
    const dt = d.finalizadaEm ?? d.updatedAt // fallback para demandas antigas sem finalizadaEm
    const key = dt.toISOString().slice(0, 7)
    const label = format(dt, "MMM yyyy", { locale: ptBR })
    const vids = videosNaDemanda(d)
    const existing = mesMap.get(key)
    if (existing) { existing.demandas++; existing.videos += vids; existing.valor += vids * VALOR_POR_DEMANDA }
    else mesMap.set(key, { label, demandas: 1, videos: vids, valor: vids * VALOR_POR_DEMANDA })
  })

  // Preenche meses sem produção (para o gráfico não ter lacunas)
  const cursor = new Date(deDate); cursor.setDate(1)
  while (cursor <= ateDate) {
    const key = cursor.toISOString().slice(0, 7)
    if (!mesMap.has(key)) mesMap.set(key, { label: format(cursor, "MMM yyyy", { locale: ptBR }), demandas: 0, videos: 0, valor: 0 })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  const porMes = Array.from(mesMap.entries())
    .map(([mes, v]) => ({ mes, ...v }))
    .sort((a, b) => b.mes.localeCompare(a.mes))

  const mesAtualKey = new Date().toISOString().slice(0, 7)
  const mesAtual = porMes.find(m => m.mes === mesAtualKey)
    ?? { mes: mesAtualKey, label: format(new Date(), "MMM yyyy", { locale: ptBR }), demandas: 0, videos: 0, valor: 0 }

  // ── Por editor (videomaker interno, tem salário fixo) ─────────────────────
  const editorMap = new Map<string, { id: string; nome: string; demandas: number; valor: number; salario: number | null }>()
  demandas.forEach(d => {
    const ed = d.editor; if (!ed) return
    const ex = editorMap.get(ed.id)
    if (ex) { ex.demandas++; ex.valor += VALOR_POR_DEMANDA }
    else editorMap.set(ed.id, { id: ed.id, nome: ed.nome, demandas: 1, valor: VALOR_POR_DEMANDA, salario: ed.salario ?? null })
  })
  const maxEdDemandas = Math.max(...Array.from(editorMap.values()).map(e => e.demandas), 1)
  const porEditor = Array.from(editorMap.values())
    .map(e => ({
      ...e,
      percentual: Math.round((e.demandas / maxEdDemandas) * 100),
      saldo: e.salario != null ? e.valor - e.salario : null,
      sePagou: e.salario != null ? e.valor >= e.salario : null,
      percSalario: e.salario != null && e.salario > 0 ? Math.min(Math.round((e.valor / e.salario) * 100), 150) : null,
    }))
    .sort((a, b) => b.demandas - a.demandas)

  // ── Por videomaker externo (pagos por job, sem salário fixo) ──────────────
  const vmMap = new Map<string, { id: string; nome: string; demandas: number; valor: number; valorDiaria: number | null }>()
  demandas.forEach(d => {
    const vm = d.videomaker; if (!vm) return
    const ex = vmMap.get(vm.id)
    if (ex) { ex.demandas++; ex.valor += VALOR_POR_DEMANDA }
    else vmMap.set(vm.id, { id: vm.id, nome: vm.nome, demandas: 1, valor: VALOR_POR_DEMANDA, valorDiaria: vm.valorDiaria ?? null })
  })
  // Custo real pago a cada videomaker externo no período
  const custosVm = await prisma.custoVideomaker.groupBy({
    by: ["videomakerId"],
    _sum: { valor: true },
    where: { organizacaoId, dataReferencia: { gte: deDate, lte: ateDate } },
  })
  const custoVmMap = new Map(custosVm.map(c => [c.videomakerId, c._sum.valor ?? 0]))
  const maxVmDemandas = Math.max(...Array.from(vmMap.values()).map(v => v.demandas), 1)
  const porVideomaker = Array.from(vmMap.values())
    .map(v => ({
      ...v,
      percentual: Math.round((v.demandas / maxVmDemandas) * 100),
      custoTotal: custoVmMap.get(v.id) ?? null,
    }))
    .sort((a, b) => b.demandas - a.demandas)

  return NextResponse.json({
    valorPorDemanda: VALOR_POR_DEMANDA,
    totalDemandas, totalVideos, valorTotal, mesAtual, porMes, porEditor, porVideomaker,
    periodo: { de: deDate.toISOString(), ate: ateDate.toISOString() },
  })
}
