"use client"

import useSWR from "swr"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { AlertasIA } from "@/components/dashboard/AlertasIA"
import { CargaEquipe } from "@/components/dashboard/CargaEquipe"
import { Header } from "@/components/layout/Header"
import { Activity, AlertTriangle, CheckCircle, Clock, Film, Users, TrendingUp, TrendingDown, Minus } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Mini SVG bar chart
function MiniBarChart({ data, color = "#3b82f6" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1)
  const w = 6, gap = 3
  const totalW = data.length * (w + gap) - gap
  const h = 32
  return (
    <svg width={totalW} height={h}>
      {data.map((v, i) => {
        const barH = Math.max((v / max) * h, 2)
        return (
          <rect key={i} x={i * (w + gap)} y={h - barH} width={w} height={barH} rx={2}
            fill={color} opacity={i === data.length - 1 ? 1 : 0.4} />
        )
      })}
    </svg>
  )
}

function TrendBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="flex items-center gap-0.5 text-xs text-zinc-500"><Minus className="h-3 w-3" /> Estável</span>
  if (delta > 0) return <span className="flex items-center gap-0.5 text-xs text-green-400"><TrendingUp className="h-3 w-3" /> +{delta} vs sem. anterior</span>
  return <span className="flex items-center gap-0.5 text-xs text-red-400"><TrendingDown className="h-3 w-3" /> {delta} vs sem. anterior</span>
}

export default function DashboardPage() {
  const { data, isLoading } = useSWR("/api/dashboard/metrics", fetcher, {
    refreshInterval: 30000,
  })

  const m = data?.metricas
  const tendencia: Array<{ criadas: number; concluidas: number }> = data?.tendencia ?? []
  const tendCriadas = tendencia.map(w => w?.criadas ?? 0)
  const tendConcluidas = tendencia.map(w => w?.concluidas ?? 0)
  const tLen = tendCriadas.length
  const deltaCriadas = tLen >= 2 ? (tendCriadas[tLen - 1] ?? 0) - (tendCriadas[tLen - 2] ?? 0) : 0

  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-6 space-y-6">
        {/* Métricas principais */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Demandas Ativas" value={isLoading ? "—" : m?.demandasAtivas ?? 0}
            icon={<Film className="w-5 h-5" />} color="blue" href="/demandas" />
          <MetricCard label="Urgentes" value={isLoading ? "—" : m?.urgentesHoje ?? 0}
            icon={<AlertTriangle className="w-5 h-5" />} color="red" href="/aprovacoes" />
          <MetricCard label="Concluídas Mês" value={isLoading ? "—" : m?.concluidasMes ?? 0}
            icon={<CheckCircle className="w-5 h-5" />} color="green" href="/demandas?statusVisivel=finalizado" />
          <MetricCard label="Prazo Crítico" value={isLoading ? "—" : m?.prazoCritico ?? 0}
            icon={<Clock className="w-5 h-5" />} color="yellow" href="/demandas?filtro=atrasadas" />
        </div>

        {/* Tendência semanal */}
        {tendencia.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Tendência Semanal</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Últimas {tendencia.length} semanas</p>
              </div>
              <TrendBadge delta={deltaCriadas} />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-zinc-500 mb-2">Criadas</p>
                <div className="flex items-end gap-3">
                  <MiniBarChart data={tendCriadas} color="#3b82f6" />
                  <span className="text-2xl font-bold text-blue-400">{tendCriadas[tLen - 1] ?? 0}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-2">Concluídas</p>
                <div className="flex items-end gap-3">
                  <MiniBarChart data={tendConcluidas} color="#22c55e" />
                  <span className="text-2xl font-bold text-green-400">{tendConcluidas[tLen - 1] ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AlertasIA alertas={data?.alertasAtivos ?? []} isLoading={isLoading} />
          </div>
          <div>
            <CargaEquipe editores={data?.cargaEditores ?? []} isLoading={isLoading} />
          </div>
        </div>

        {/* Stats secundárias */}
        {m && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Em Edição" value={m.emEdicao ?? 0}
              icon={<Activity className="w-5 h-5" />} color="purple" small href="/demandas?statusVisivel=edicao" />
            <MetricCard label="Aguardando Aprovação" value={m.aguardandoAprovacao ?? 0}
              icon={<Clock className="w-5 h-5" />} color="yellow" small href="/aprovacoes" />
            <MetricCard label="Para Postar" value={m.paraPostar ?? 0}
              icon={<CheckCircle className="w-5 h-5" />} color="green" small href="/demandas?statusVisivel=para_postar" />
            <MetricCard label="Editores Ativos" value={m.editoresAtivos ?? 0}
              icon={<Users className="w-5 h-5" />} color="blue" small href="/equipe" />
          </div>
        )}
      </main>
    </>
  )
}
