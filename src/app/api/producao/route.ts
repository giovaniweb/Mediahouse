import { recorteMetricas, RecorteInvalido } from "@/lib/metricas-recorte"
import { carregarConcluidas } from "@/lib/metricas-operacionais"
import { contarEntregaveis } from "@/lib/metricas-entregaveis"
import { dataEmSaoPaulo, somarMeses } from "@/lib/datas"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { diariasDaEmpresa } from "@/lib/videomaker-vinculo"
import { vinculosDaEmpresa } from "@/lib/editor-vinculo"

// Valor médio por demanda finalizada — índice de produtividade, não faturamento real
const VALOR_POR_DEMANDA = 200

// GET /api/producao?mes=2026-05        — mês específico
// GET /api/producao?de=2026-01-01&ate=2026-12-31  — intervalo customizado
// Default: últimos 12 meses
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso("verCustos")
  if (acesso instanceof NextResponse) return acesso
  const { organizacaoId } = acesso

  const sp = req.nextUrl.searchParams
  let recorte
  try { recorte = recorteMetricas(new URLSearchParams({ periodo: "12meses", ...Object.fromEntries(sp) })) }
  catch (e) { if (e instanceof RecorteInvalido) return NextResponse.json({ error: e.message }, { status: 400 }); throw e }
  const deDate = new Date(recorte.inicio), ateDate = new Date(recorte.fim)
  const demandas = await carregarConcluidas(organizacaoId,recorte)
  const totalDemandas = demandas.length
  const videosNaDemanda = contarEntregaveis

  const totalVideos = demandas.reduce((acc, d) => acc + videosNaDemanda(d), 0)
  const valorTotal = totalVideos * VALOR_POR_DEMANDA

  // ── Por mês ──────────────────────────────────────────────────────────────
  const mesMap = new Map<string, { label: string; demandas: number; videos: number; valor: number }>()

  demandas.forEach(d => {
    const dt = d.finalizadaEm!
    const key = dataEmSaoPaulo(dt).slice(0, 7)
    const label = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).format(dt)
    const vids = videosNaDemanda(d)
    const existing = mesMap.get(key)
    if (existing) { existing.demandas++; existing.videos += vids; existing.valor += vids * VALOR_POR_DEMANDA }
    else mesMap.set(key, { label, demandas: 1, videos: vids, valor: vids * VALOR_POR_DEMANDA })
  })

  // Preenche meses sem produção (para o gráfico não ter lacunas)
  let cursor = `${recorte.de.slice(0,7)}-01`
  while (cursor <= recorte.ate) {
    const key = cursor.slice(0,7)
    if (!mesMap.has(key)) mesMap.set(key, { label: key, demandas: 0, videos: 0, valor: 0 })
    cursor = somarMeses(cursor,1)
  }
  const porMes = Array.from(mesMap.entries())
    .map(([mes, v]) => ({ mes, ...v }))
    .sort((a, b) => b.mes.localeCompare(a.mes))

  const mesAtualKey = dataEmSaoPaulo(new Date()).slice(0, 7)
  const mesAtual = porMes.find(m => m.mes === mesAtualKey)
    ?? { mes: mesAtualKey, label: mesAtualKey, demandas: 0, videos: 0, valor: 0 }

  // ── Por editor (videomaker interno, tem salário fixo) ─────────────────────
  const editorMap = new Map<string, { id: string; nome: string; demandas: number; valor: number; salario: number | null }>()
  demandas.forEach(d => {
    const ed = d.editor; if (!ed) return
    const ex = editorMap.get(ed.id)
    if (ex) { ex.demandas++; ex.valor += videosNaDemanda(d) * VALOR_POR_DEMANDA }
    else editorMap.set(ed.id, { id: ed.id, nome: ed.nome, demandas: 1, valor: videosNaDemanda(d) * VALOR_POR_DEMANDA, salario: null })
  })
  // Salário do vínculo desta empresa, numa consulta só. O relatório de uma
  // empresa não pode exibir o que a outra paga pela mesma pessoa.
  const vincEd = await vinculosDaEmpresa([...editorMap.keys()], organizacaoId)
  for (const [id, e] of editorMap) e.salario = vincEd.get(id)?.salario ?? null
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
    if (ex) { ex.demandas++; ex.valor += videosNaDemanda(d) * VALOR_POR_DEMANDA }
    else vmMap.set(vm.id, { id: vm.id, nome: vm.nome, demandas: 1, valor: videosNaDemanda(d) * VALOR_POR_DEMANDA, valorDiaria: null })
  })
  // Diária do vínculo desta empresa, em uma consulta só para todos os do mapa.
  const diarias = await diariasDaEmpresa([...vmMap.keys()], organizacaoId)
  for (const [id, v] of vmMap) v.valorDiaria = diarias.get(id) ?? null
  // Custo real pago a cada videomaker externo no período
  const custosVm = await prisma.custoVideomaker.groupBy({
    by: ["videomakerId"],
    _sum: { valor: true },
    where: { organizacaoId, demanda: { area: recorte.area }, dataReferencia: { gte: deDate, lt: ateDate } },
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
    periodo: recorte,
  })
}
