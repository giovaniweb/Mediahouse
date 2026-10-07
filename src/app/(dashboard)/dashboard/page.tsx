"use client"

import { DashboardPreview } from "@/components/dashboard/DashboardPreview"
import { useEffect, useState } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { VideomakerDashboard } from "@/components/dashboard/VideomakerDashboard"
import { DesignerDashboard } from "@/components/dashboard/DesignerDashboard"
import { Header } from "@/components/layout/Header"
import { fetcher } from "@/lib/fetcher"
import { useMe } from "@/hooks/usePermissoes"
import { DashboardGrowth, DashboardSocial, SeletorDepartamento } from "@/components/dashboard/DashboardDepartamento"
import { departamentosVisiveis, lerDepartamento, type Departamento } from "@/lib/painel-departamento"

// O último departamento escolhido volta na próxima visita. Preferência de quem
// olha, por isso no navegador e não no banco.
const CHAVE_DEPARTAMENTO = "nuflow:dashboard-departamento"

// Dashboard interno (equipe, admin, gestor, etc.)
function InternalDashboard() {
  // Módulos desta empresa — antes eram constantes iguais para todas.
  const { data: me } = useMe()
  const opcoes = departamentosVisiveis(me)
  const [escolhido, setEscolhido] = useState<Departamento | null>(null)
  useEffect(() => {
    try { setEscolhido(lerDepartamento(localStorage.getItem(CHAVE_DEPARTAMENTO))) } catch { /* Sem preferência: Audiovisual. */ }
  }, [])
  // Escolha que esta pessoa não vê mais (perdeu a área) cai no primeiro que ela
  // vê. Lista vazia = perfil ainda carregando: nada é decidido nem buscado.
  const carregou = opcoes.length > 0
  const departamento: Departamento = carregou
    ? escolhido && opcoes.includes(escolhido) ? escolhido : opcoes[0]
    : escolhido ?? "audiovisual"
  function escolher(d: Departamento) {
    setEscolhido(d)
    try { localStorage.setItem(CHAVE_DEPARTAMENTO, d) } catch { /* Continua sem lembrar. */ }
  }

  const { data, isLoading, error, mutate } = useSWR(carregou ? `/api/dashboard/metrics?departamento=${departamento}` : null, fetcher, {
    refreshInterval: 30000,
  })
  const audiovisual = departamento === "audiovisual"
  const { data: kpiB2c } = useSWR(audiovisual ? "/api/kpi/b2c-b2b" : null, fetcher, { refreshInterval: 60000 })
  const { data: kpiIdeias } = useSWR(audiovisual && me?.modulos?.ideias ? "/api/ideias/kpi" : null, fetcher, { refreshInterval: 60000 })
  // A resposta é do departamento pedido; enquanto o novo carrega, nada do anterior aparece.
  const dados = data?.departamento === departamento ? data : undefined
  const carregando = isLoading || !dados
  const seletor = <SeletorDepartamento opcoes={carregou ? opcoes : [departamento]} valor={departamento} onChange={escolher} />

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
    {departamento === "growth" ? <DashboardGrowth data={dados} loading={carregando} seletor={seletor} />
      : departamento === "social" ? <DashboardSocial data={dados} loading={carregando} seletor={seletor} />
      : <DashboardPreview data={dados} loading={carregando} b2c={kpiB2c} ideias={me?.modulos?.ideias ? kpiIdeias : undefined} seletor={seletor} />}
  </>
}

export default function DashboardPage() {
  const { data: session } = useSession()

  // Sem desvio para celular. O redirecionamento para /campo sobrou aqui depois
  // que o middleware perdeu o dele (09/09/2026): /campo é do módulo eventos,
  // desligado, e a rota bloqueada devolve ao Dashboard — o celular ficava em
  // laço. O celular vê o mesmo Dashboard, com o menu em gaveta.

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
