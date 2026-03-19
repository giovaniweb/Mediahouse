"use client"

import useSWR from "swr"
import { cn } from "@/lib/utils"
import { TrendingUp, Clock, DollarSign, Film, Target, Loader2 } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json() })
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

interface Props {
  videomakerId: string
  compact?: boolean
  tipo?: "externo" | "interno"
}

export function VideomakerPerformance({ videomakerId, compact, tipo = "externo" }: Props) {
  const apiBase = tipo === "interno" ? "/api/editores" : "/api/videomakers"
  const { data, isLoading } = useSWR(`${apiBase}/${videomakerId}/performance`, fetcher)

  if (isLoading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center justify-center min-h-[120px]">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
      </div>
    )
  }

  if (!data) return null

  const taxa = data.taxaConclusao ?? 0
  const performanceColor = taxa >= 80 ? "text-emerald-400" : taxa >= 60 ? "text-amber-400" : "text-red-400"
  const performanceBg = taxa >= 80 ? "bg-emerald-500" : taxa >= 60 ? "bg-amber-500" : "bg-red-500"
  const performanceBorder = taxa >= 80 ? "border-emerald-500" : taxa >= 60 ? "border-amber-500" : "border-red-500"

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header with performance gauge */}
      <div className={cn("px-5 py-4 border-b border-zinc-800 flex items-center justify-between", compact && "px-4 py-3")}>
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-400" />
          <h3 className={cn("font-semibold text-zinc-100", compact ? "text-sm" : "text-base")}>Performance</h3>
        </div>
        <div className="flex items-center gap-3">
          {/* Performance circle */}
          <div className={cn("relative w-14 h-14 flex items-center justify-center", compact && "w-11 h-11")}>
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-800" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className={performanceColor}
                strokeDasharray={`${(taxa / 100) * 97.4} 97.4`} strokeLinecap="round" />
            </svg>
            <span className={cn("text-sm font-bold z-10", performanceColor, compact && "text-xs")}>{taxa}%</span>
          </div>
          <div>
            <p className={cn("text-xs font-medium", performanceColor)}>
              {taxa >= 80 ? "Acima da meta" : taxa >= 60 ? "Perto da meta" : "Abaixo da meta"}
            </p>
            <p className="text-[10px] text-zinc-600">Meta: {data.metaPerformance}%</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className={cn("px-5 py-4 grid gap-4", compact ? "grid-cols-2 px-4 py-3" : "grid-cols-4")}>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Film className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</span>
          </div>
          <p className="text-lg font-bold text-white">{data.totalDemandas}</p>
          <p className="text-[10px] text-zinc-600">{data.concluidas} concluidas</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Tempo Medio</span>
          </div>
          <p className="text-lg font-bold text-white">{data.tempoMedioDias}d</p>
          <p className="text-[10px] text-zinc-600">dias p/ concluir</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Custo Total</span>
          </div>
          <p className="text-lg font-bold text-white">{fmt(data.custoTotal)}</p>
          <p className="text-[10px] text-zinc-600">{fmt(data.custoMedioPorVideo)}/video</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">B2C/B2B</span>
          </div>
          <p className="text-lg font-bold text-white">{data.b2cCount}/{data.b2bCount}</p>
          <p className="text-[10px] text-zinc-600">b2c / b2b</p>
        </div>
      </div>

      {/* Monthly bars */}
      {data.performanceMensal?.length > 0 && (
        <div className={cn("px-5 pb-4 border-t border-zinc-800 pt-4", compact && "px-4 pb-3 pt-3")}>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">Ultimos 6 meses</p>
          <div className="flex items-end gap-2 h-16">
            {data.performanceMensal.map((m: { month: string; concluidas: number; total: number; taxa: number }) => {
              const max = Math.max(...data.performanceMensal.map((x: { total: number }) => x.total), 1)
              const hTotal = Math.max((m.total / max) * 100, 5)
              const hDone = m.total > 0 ? (m.concluidas / m.total) * hTotal : 0
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5" title={`${m.month}: ${m.concluidas}/${m.total} (${m.taxa}%)`}>
                  <span className="text-[9px] text-zinc-600">{m.taxa}%</span>
                  <div className="w-full relative" style={{ height: `${hTotal}%` }}>
                    <div className="absolute bottom-0 left-0 right-0 bg-zinc-700 rounded-t" style={{ height: "100%" }} />
                    <div className={cn("absolute bottom-0 left-0 right-0 rounded-t transition-all", performanceBg)} style={{ height: `${hDone}%` }} />
                  </div>
                  <span className="text-[8px] text-zinc-600">{m.month.slice(5)}</span>
                </div>
              )
            })}
          </div>
          {/* Meta line */}
          <div className="relative mt-2">
            <div className={cn("h-px w-full border-t border-dashed", performanceBorder)} />
            <span className={cn("absolute right-0 -top-2.5 text-[9px] font-medium", performanceColor)}>Meta {data.metaPerformance}%</span>
          </div>
        </div>
      )}
    </div>
  )
}
