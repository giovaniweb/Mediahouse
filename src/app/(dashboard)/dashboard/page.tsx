"use client"

import useSWR from "swr"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { AlertasIA } from "@/components/dashboard/AlertasIA"
import { CargaEquipe } from "@/components/dashboard/CargaEquipe"
import { HojeEmFoco } from "@/components/dashboard/HojeEmFoco"
import { Header } from "@/components/layout/Header"
import { Activity, AlertTriangle, CheckCircle, Clock, Film, Users, TrendingUp, TrendingDown, Minus, BarChart3, Lightbulb } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error("Erro ao carregar")
  return r.json()
})

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
  const { data: kpiB2c } = useSWR("/api/kpi/b2c-b2b", fetcher, { refreshInterval: 60000 })
  const { data: kpiIdeias } = useSWR("/api/ideias/kpi", fetcher, { refreshInterval: 60000 })

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
        {/* TDAH: Painel Hoje em Foco */}
        <HojeEmFoco />
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

        {/* B2C/B2B KPI */}
        {kpiB2c && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-zinc-200">B2C / B2B</h3>
              </div>
              {kpiB2c.alerta && (
                <span className="flex items-center gap-1 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2.5 py-1">
                  <AlertTriangle className="w-3 h-3" /> B2C abaixo de {kpiB2c.meta?.b2c_target ?? 70}%
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-cyan-400">B2C</span>
                  <span className="text-lg font-bold text-cyan-400">{kpiB2c.b2c?.percent ?? 0}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${kpiB2c.b2c?.percent ?? 0}%` }} />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">{kpiB2c.b2c?.count ?? 0} videos</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-orange-400">B2B</span>
                  <span className="text-lg font-bold text-orange-400">{kpiB2c.b2b?.percent ?? 0}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${kpiB2c.b2b?.percent ?? 0}%` }} />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">{kpiB2c.b2b?.count ?? 0} videos</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-zinc-500">Sem classif.</span>
                  <span className="text-lg font-bold text-zinc-500">{kpiB2c.sem_classificacao?.percent ?? 0}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-600 rounded-full transition-all" style={{ width: `${kpiB2c.sem_classificacao?.percent ?? 0}%` }} />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">{kpiB2c.sem_classificacao?.count ?? 0} videos</p>
              </div>
            </div>
          </div>
        )}

        {/* Banco de Ideias */}
        {kpiIdeias && kpiIdeias.totalIdeias > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Banco de Ideias</h3>
              </div>
              <a href="/ideias" className="text-xs text-purple-400 hover:text-purple-300">Ver todas →</a>
            </div>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <span className="text-xs text-zinc-500">Pendentes</span>
                <p className="text-2xl font-bold text-yellow-400">{kpiIdeias.novas + kpiIdeias.emAnalise}</p>
                <p className="text-[10px] text-zinc-600">{kpiIdeias.novas} novas · {kpiIdeias.emAnalise} em análise</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Taxa Conversão</span>
                <p className="text-2xl font-bold text-purple-400">{kpiIdeias.taxaConversao}%</p>
                <p className="text-[10px] text-zinc-600">{kpiIdeias.realizadas} de {kpiIdeias.totalIdeias} ideias</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Este Mês</span>
                <p className="text-2xl font-bold text-blue-400">{kpiIdeias.ideiasEsteMes}</p>
                <p className="text-[10px] text-zinc-600">{kpiIdeias.mediaScoreIA ? `Score médio: ${kpiIdeias.mediaScoreIA}` : "Sem análises"}</p>
              </div>
            </div>
          </div>
        )}

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
