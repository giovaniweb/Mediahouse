import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

// Valor médio por demanda finalizada — índice de produtividade, não faturamento real
const VALOR_POR_DEMANDA = 200

// GET /api/producao?de=2026-01-01&ate=2026-12-31
// Retorna métricas de produção baseadas em demandas finalizadas (statusNovo = "encerrado")
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const deParam = sp.get("de")
  const ateParam = sp.get("ate")

  // Default: últimos 12 meses
  const ateDate = ateParam ? new Date(ateParam) : new Date()
  ateDate.setHours(23, 59, 59, 999)

  const deDate = deParam
    ? new Date(deParam)
    : new Date(ateDate.getFullYear() - 1, ateDate.getMonth(), 1)
  deDate.setHours(0, 0, 0, 0)

  // Busca todos os registros de finalização no período
  const historicos = await prisma.historicoStatus.findMany({
    where: {
      statusNovo: "encerrado",
      createdAt: { gte: deDate, lte: ateDate },
    },
    include: {
      demanda: {
        select: {
          id: true,
          videomakerId: true,
          editorId: true,
          videomaker: { select: { id: true, nome: true } },
          editor: { select: { id: true, nome: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  // Deduplica por demandaId (pega apenas o registro mais recente de finalização por demanda)
  const vistos = new Set<string>()
  const unicos = historicos.filter(h => {
    if (!h.demandaId || vistos.has(h.demandaId)) return false
    vistos.add(h.demandaId)
    return true
  })

  const totalDemandas = unicos.length
  const valorTotal = totalDemandas * VALOR_POR_DEMANDA

  // ── Por mês ──────────────────────────────────────────────────────────────
  const mesMap = new Map<string, { label: string; demandas: number; valor: number }>()

  unicos.forEach(h => {
    const key = h.createdAt.toISOString().slice(0, 7) // "2026-04"
    const label = format(h.createdAt, "MMM yyyy", { locale: ptBR })
    const existing = mesMap.get(key)
    if (existing) {
      existing.demandas++
      existing.valor += VALOR_POR_DEMANDA
    } else {
      mesMap.set(key, { label, demandas: 1, valor: VALOR_POR_DEMANDA })
    }
  })

  // Preenche meses sem demandas (para o gráfico não ter lacunas)
  const cursor = new Date(deDate)
  cursor.setDate(1)
  while (cursor <= ateDate) {
    const key = cursor.toISOString().slice(0, 7)
    if (!mesMap.has(key)) {
      mesMap.set(key, {
        label: format(cursor, "MMM yyyy", { locale: ptBR }),
        demandas: 0,
        valor: 0,
      })
    }
    cursor.setMonth(cursor.getMonth() + 1)
  }

  const porMes = Array.from(mesMap.entries())
    .map(([mes, v]) => ({ mes, ...v }))
    .sort((a, b) => b.mes.localeCompare(a.mes)) // mais recente primeiro

  // Mês atual
  const mesAtualKey = new Date().toISOString().slice(0, 7)
  const mesAtual = porMes.find(m => m.mes === mesAtualKey) ?? {
    mes: mesAtualKey,
    label: format(new Date(), "MMM yyyy", { locale: ptBR }),
    demandas: 0,
    valor: 0,
  }

  // ── Por editor (videomaker interno) ──────────────────────────────────────
  const editorMap = new Map<string, { id: string; nome: string; demandas: number; valor: number }>()

  unicos.forEach(h => {
    const ed = h.demanda?.editor
    if (!ed) return
    const existing = editorMap.get(ed.id)
    if (existing) {
      existing.demandas++
      existing.valor += VALOR_POR_DEMANDA
    } else {
      editorMap.set(ed.id, { id: ed.id, nome: ed.nome, demandas: 1, valor: VALOR_POR_DEMANDA })
    }
  })

  const maxEditorDemandas = Math.max(...Array.from(editorMap.values()).map(e => e.demandas), 1)
  const porEditor = Array.from(editorMap.values())
    .map(e => ({ ...e, percentual: Math.round((e.demandas / maxEditorDemandas) * 100) }))
    .sort((a, b) => b.demandas - a.demandas)

  // ── Por videomaker externo ────────────────────────────────────────────────
  const vmMap = new Map<string, { id: string; nome: string; demandas: number; valor: number }>()

  unicos.forEach(h => {
    const vm = h.demanda?.videomaker
    if (!vm) return
    const existing = vmMap.get(vm.id)
    if (existing) {
      existing.demandas++
      existing.valor += VALOR_POR_DEMANDA
    } else {
      vmMap.set(vm.id, { id: vm.id, nome: vm.nome, demandas: 1, valor: VALOR_POR_DEMANDA })
    }
  })

  const maxVmDemandas = Math.max(...Array.from(vmMap.values()).map(v => v.demandas), 1)
  const porVideomaker = Array.from(vmMap.values())
    .map(v => ({ ...v, percentual: Math.round((v.demandas / maxVmDemandas) * 100) }))
    .sort((a, b) => b.demandas - a.demandas)

  return NextResponse.json({
    valorPorDemanda: VALOR_POR_DEMANDA,
    totalDemandas,
    valorTotal,
    mesAtual,
    porMes,
    porEditor,
    porVideomaker,
    periodo: {
      de: deDate.toISOString(),
      ate: ateDate.toISOString(),
    },
  })
}
