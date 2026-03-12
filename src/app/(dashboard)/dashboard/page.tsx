"use client"

import useSWR from "swr"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { AlertasIA } from "@/components/dashboard/AlertasIA"
import { CargaEquipe } from "@/components/dashboard/CargaEquipe"
import { Header } from "@/components/layout/Header"
import { Activity, AlertTriangle, CheckCircle, Clock, Film, Users } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function DashboardPage() {
  const { data, isLoading } = useSWR("/api/dashboard/metrics", fetcher, {
    refreshInterval: 30000,
  })

  const m = data?.metricas

  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-6 space-y-6">
        {/* Métricas */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            label="Demandas Ativas"
            value={isLoading ? "—" : m?.demandasAtivas ?? 0}
            icon={<Film className="w-5 h-5" />}
            color="blue"
          />
          <MetricCard
            label="Urgentes"
            value={isLoading ? "—" : m?.urgentesHoje ?? 0}
            icon={<AlertTriangle className="w-5 h-5" />}
            color="red"
          />
          <MetricCard
            label="Concluídas Mês"
            value={isLoading ? "—" : m?.concluidasMes ?? 0}
            icon={<CheckCircle className="w-5 h-5" />}
            color="green"
          />
          <MetricCard
            label="Prazo Crítico"
            value={isLoading ? "—" : m?.prazoCritico ?? 0}
            icon={<Clock className="w-5 h-5" />}
            color="yellow"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Alertas IA — ocupa 2/3 */}
          <div className="lg:col-span-2">
            <AlertasIA alertas={data?.alertasAtivos ?? []} isLoading={isLoading} />
          </div>
          {/* Carga da Equipe — ocupa 1/3 */}
          <div>
            <CargaEquipe editores={data?.cargaEditores ?? []} isLoading={isLoading} />
          </div>
        </div>

        {/* Stats secundárias */}
        {m && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label="Em Edição"
              value={m.emEdicao ?? 0}
              icon={<Activity className="w-5 h-5" />}
              color="purple"
              small
            />
            <MetricCard
              label="Aguardando Aprovação"
              value={m.aguardandoAprovacao ?? 0}
              icon={<Clock className="w-5 h-5" />}
              color="yellow"
              small
            />
            <MetricCard
              label="Para Postar"
              value={m.paraPostar ?? 0}
              icon={<CheckCircle className="w-5 h-5" />}
              color="green"
              small
            />
            <MetricCard
              label="Editores Ativos"
              value={m.editoresAtivos ?? 0}
              icon={<Users className="w-5 h-5" />}
              color="blue"
              small
            />
          </div>
        )}
      </main>
    </>
  )
}
