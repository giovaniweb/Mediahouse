"use client"

import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import { AlertTriangle, Bell, CheckCircle, X } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const severidadeConfig = {
  critico: { icon: AlertTriangle, class: "bg-red-50 border-red-200", iconClass: "text-red-600", badge: "bg-red-100 text-red-700" },
  aviso: { icon: Bell, class: "bg-yellow-50 border-yellow-200", iconClass: "text-yellow-600", badge: "bg-yellow-100 text-yellow-700" },
  info: { icon: Bell, class: "bg-blue-50 border-blue-200", iconClass: "text-blue-600", badge: "bg-blue-100 text-blue-700" },
}

export default function AlertasPage() {
  const { data, mutate } = useSWR("/api/alertas", fetcher, { refreshInterval: 15000 })
  const alertas = data?.alertas ?? []

  async function resolver(id: string) {
    await fetch("/api/alertas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, acao: "resolver" }),
    })
    mutate()
  }

  async function ignorar(id: string) {
    await fetch("/api/alertas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, acao: "ignorar" }),
    })
    mutate()
  }

  const criticos = alertas.filter((a: { severidade: string }) => a.severidade === "critico")
  const avisos = alertas.filter((a: { severidade: string }) => a.severidade === "aviso")
  const infos = alertas.filter((a: { severidade: string }) => a.severidade === "info")

  return (
    <>
      <Header title="Alertas IA" />
      <main className="flex-1 p-6 max-w-3xl space-y-6">
        {alertas.length === 0 && (
          <div className="text-center py-16 text-zinc-400">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
            <p className="text-lg font-medium">Nenhum alerta ativo</p>
            <p className="text-sm">Tudo certo por aqui!</p>
          </div>
        )}

        {criticos.length > 0 && (
          <AlertSection title="Críticos" count={criticos.length} alertas={criticos} onResolver={resolver} onIgnorar={ignorar} />
        )}
        {avisos.length > 0 && (
          <AlertSection title="Avisos" count={avisos.length} alertas={avisos} onResolver={resolver} onIgnorar={ignorar} />
        )}
        {infos.length > 0 && (
          <AlertSection title="Informativos" count={infos.length} alertas={infos} onResolver={resolver} onIgnorar={ignorar} />
        )}
      </main>
    </>
  )
}

function AlertSection({
  title,
  count,
  alertas,
  onResolver,
  onIgnorar,
}: {
  title: string
  count: number
  alertas: Array<{
    id: string
    tipoAlerta: string
    mensagem: string
    severidade: "critico" | "aviso" | "info"
    acaoSugerida: string | null
    criadoEm: string
    demanda?: { id: string; codigo: string; titulo: string } | null
  }>
  onResolver: (id: string) => void
  onIgnorar: (id: string) => void
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-semibold text-zinc-700">{title}</h2>
        <span className="bg-zinc-100 text-zinc-500 text-xs font-bold px-2 py-0.5 rounded-full">{count}</span>
      </div>
      <div className="space-y-2">
        {alertas.map((a) => {
          const cfg = severidadeConfig[a.severidade] ?? severidadeConfig.info
          const Icon = cfg.icon
          return (
            <div key={a.id} className={cn("border rounded-xl p-4 flex gap-3", cfg.class)}>
              <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", cfg.iconClass)} />
              <div className="flex-1 min-w-0">
                {a.demanda && (
                  <Link href={`/demandas/${a.demanda.id}`} className="text-xs font-mono text-zinc-500 hover:underline">
                    {a.demanda.codigo} · {a.demanda.titulo}
                  </Link>
                )}
                <p className="text-sm text-zinc-800 font-medium">{a.mensagem}</p>
                {a.acaoSugerida && (
                  <p className="text-xs text-zinc-500 mt-0.5">→ {a.acaoSugerida}</p>
                )}
                <p className="text-[10px] text-zinc-400 mt-1">
                  {format(new Date(a.criadoEm), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  onClick={() => onResolver(a.id)}
                  className="px-2 py-1 text-[10px] font-medium bg-green-100 text-green-700 rounded hover:bg-green-200"
                >
                  Resolver
                </button>
                <button
                  onClick={() => onIgnorar(a.id)}
                  className="px-2 py-1 text-[10px] font-medium bg-zinc-100 text-zinc-500 rounded hover:bg-zinc-200"
                >
                  Ignorar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
