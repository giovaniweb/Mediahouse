"use client"

import { useState } from "react"
import { AlertTriangle, Bell, CheckCircle, X, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

const severidadeConfig = {
  critico: {
    icon: AlertTriangle,
    color: "text-red-400",
    bg: "bg-red-500/5 border-l-red-500",
    badge: "bg-red-500/15 text-red-400",
  },
  aviso: {
    icon: Bell,
    color: "text-amber-400",
    bg: "bg-amber-500/5 border-l-amber-500",
    badge: "bg-amber-500/15 text-amber-400",
  },
  info: {
    icon: Bell,
    color: "text-blue-400",
    bg: "bg-blue-500/5 border-l-blue-500",
    badge: "bg-blue-500/15 text-blue-400",
  },
}

interface Alerta {
  id: string
  tipoAlerta: string
  mensagem: string
  severidade: "critico" | "aviso" | "info"
  acaoSugerida: string | null
  demandaId?: string | null
  demanda?: { codigo: string; titulo: string } | null
}

interface AlertasIAProps {
  alertas: Alerta[]
  isLoading: boolean
}

export function AlertasIA({ alertas, isLoading }: AlertasIAProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = alertas.filter((a) => !dismissed.has(a.id))

  async function handleResolve(id: string) {
    setDismissed((prev) => new Set([...prev, id]))
    await fetch(`/api/alertas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "resolver" }),
    })
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
          <Bell className="w-4 h-4 text-purple-400" /> Alertas IA
        </h2>
        {visible.length > 0 && (
          <span className="bg-red-500/15 text-red-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-red-500/20">
            {visible.length}
          </span>
        )}
      </div>

      <div className="divide-y divide-zinc-800/50">
        {isLoading &&
          [1, 2].map((i) => (
            <div key={i} className="p-4 animate-pulse">
              <div className="h-4 bg-zinc-800 rounded w-3/4 mb-2" />
              <div className="h-3 bg-zinc-800 rounded w-1/2" />
            </div>
          ))}

        {!isLoading && visible.length === 0 && (
          <div className="p-8 text-center">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
            <p className="text-sm text-zinc-500">Nenhum alerta ativo</p>
          </div>
        )}

        {!isLoading &&
          visible.slice(0, 5).map((alerta) => {
            const cfg = severidadeConfig[alerta.severidade] ?? severidadeConfig.info
            const Icon = cfg.icon
            const isClickable = !!alerta.demandaId

            const content = (
              <div className={cn(
                "p-4 flex gap-3 border-l-[3px] transition-colors",
                cfg.bg,
                isClickable && "hover:bg-zinc-800/50 cursor-pointer group"
              )}>
                <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", cfg.color)} />
                <div className="flex-1 min-w-0">
                  {alerta.demanda && (
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {alerta.demanda.codigo} ·{" "}
                    </span>
                  )}
                  <p className="text-sm text-zinc-200">{alerta.mensagem}</p>
                  {alerta.acaoSugerida && (
                    <p className="text-xs text-zinc-500 mt-0.5">→ {alerta.acaoSugerida}</p>
                  )}
                </div>
                {isClickable && (
                  <span className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity text-xs text-zinc-500 flex items-center gap-1">
                    Ver <ArrowRight className="w-3 h-3" />
                  </span>
                )}
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleResolve(alerta.id) }}
                  className="shrink-0 p-1 rounded hover:bg-zinc-700 text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )

            if (isClickable && alerta.demandaId) {
              return (
                <Link key={alerta.id} href={`/demandas/${alerta.demandaId}`}>
                  {content}
                </Link>
              )
            }

            return <div key={alerta.id}>{content}</div>
          })}
      </div>
    </div>
  )
}
