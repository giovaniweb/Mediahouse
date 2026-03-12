"use client"

import { useState } from "react"
import { AlertTriangle, Bell, CheckCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"

const severidadeConfig = {
  critico: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-700" },
  aviso: { icon: Bell, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200", badge: "bg-yellow-100 text-yellow-700" },
  info: { icon: Bell, color: "text-blue-600", bg: "bg-blue-50 border-blue-200", badge: "bg-blue-100 text-blue-700" },
}

interface Alerta {
  id: string
  tipoAlerta: string
  mensagem: string
  severidade: "critico" | "aviso" | "info"
  acaoSugerida: string | null
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
      body: JSON.stringify({ id, acao: "resolver" }),
    })
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-zinc-800 flex items-center gap-2">
          <Bell className="w-4 h-4 text-purple-600" /> Alertas IA
        </h2>
        {visible.length > 0 && (
          <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {visible.length}
          </span>
        )}
      </div>

      <div className="divide-y">
        {isLoading &&
          [1, 2].map((i) => (
            <div key={i} className="p-4 animate-pulse">
              <div className="h-4 bg-zinc-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-zinc-100 rounded w-1/2" />
            </div>
          ))}

        {!isLoading && visible.length === 0 && (
          <div className="p-8 text-center text-zinc-400">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-sm">Nenhum alerta ativo</p>
          </div>
        )}

        {!isLoading &&
          visible.slice(0, 5).map((alerta) => {
            const cfg = severidadeConfig[alerta.severidade] ?? severidadeConfig.info
            const Icon = cfg.icon
            return (
              <div key={alerta.id} className={cn("p-4 flex gap-3", cfg.bg)}>
                <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", cfg.color)} />
                <div className="flex-1 min-w-0">
                  {alerta.demanda && (
                    <span className="text-xs text-zinc-500 font-mono">
                      {alerta.demanda.codigo} ·{" "}
                    </span>
                  )}
                  <p className="text-sm text-zinc-800">{alerta.mensagem}</p>
                  {alerta.acaoSugerida && (
                    <p className="text-xs text-zinc-500 mt-0.5">→ {alerta.acaoSugerida}</p>
                  )}
                </div>
                <button
                  onClick={() => handleResolve(alerta.id)}
                  className="shrink-0 p-1 rounded hover:bg-zinc-200/60 text-zinc-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
      </div>
    </div>
  )
}
