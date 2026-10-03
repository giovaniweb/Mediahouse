"use client"

import { DashboardPreview } from "@/components/dashboard/DashboardPreview"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { VideomakerDashboard } from "@/components/dashboard/VideomakerDashboard"
import { DesignerDashboard } from "@/components/dashboard/DesignerDashboard"
import { Header } from "@/components/layout/Header"
import { fetcher } from "@/lib/fetcher"
import { useMe } from "@/hooks/usePermissoes"

// Dashboard interno (equipe, admin, gestor, etc.)
function InternalDashboard() {
  // Módulos desta empresa — antes eram constantes iguais para todas.
  const { data: me } = useMe()
  const { data, isLoading, error, mutate } = useSWR("/api/dashboard/metrics", fetcher, {
    refreshInterval: 30000,
  })
  const { data: kpiB2c } = useSWR("/api/kpi/b2c-b2b", fetcher, { refreshInterval: 60000 })
  const { data: kpiIdeias } = useSWR(me?.modulos?.ideias ? "/api/ideias/kpi" : null, fetcher, { refreshInterval: 60000 })

  if (error) return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-6">
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-zinc-100">
          <h2 className="font-semibold">Não foi possível carregar o dashboard</h2>
          <p className="mt-2 text-sm text-zinc-400">Os indicadores estão indisponíveis. Tente novamente para consultar os dados da sua equipe.</p>
          <button onClick={() => void mutate()} className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900">Tentar novamente</button>
        </div>
      </main>
    </>
  )

  return <>
    <Header title="Dashboard" />
    <DashboardPreview data={data} loading={isLoading} b2c={kpiB2c} ideias={me?.modulos?.ideias ? kpiIdeias : undefined} />
  </>
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()

  // Redirecionar mobile para /campo
  useEffect(() => {
    const isMobile = window.innerWidth < 768 || /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)
    if (isMobile) {
      router.replace("/campo")
    }
  }, [router])

  // Videomakers externos têm dashboard próprio
  if (session?.user?.tipo === "videomaker") {
    return (
      <>
        <Header title="Meu Painel" />
        <VideomakerDashboard />
      </>
    )
  }

  // Designers têm painel próprio (suas artes)
  if (session?.user?.tipo === "designer") {
    return (
      <>
        <Header title="Meu Painel" />
        <DesignerDashboard />
      </>
    )
  }

  return <InternalDashboard />
}
