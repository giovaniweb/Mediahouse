"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Bell, CheckCheck, X, AlertTriangle, Info, Zap } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Alerta {
  id: string
  mensagem: string
  severidade: "info" | "aviso" | "critico"
  createdAt: string
  lida: boolean
  demanda?: { id: string; titulo: string; codigo: string } | null
}

function SeveridadeIcon({ s }: { s: string }) {
  if (s === "critico") return <Zap className="w-3.5 h-3.5 text-red-500" />
  if (s === "aviso") return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
  return <Info className="w-3.5 h-3.5 text-blue-500" />
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return "agora"
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data, mutate } = useSWR<{ alertas: Alerta[]; total: number }>(
    "/api/notificacoes",
    fetcher,
    { refreshInterval: 15000 }
  )

  const alertas = data?.alertas ?? []
  const total = data?.total ?? 0

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const marcarTodasLidas = useCallback(async () => {
    await fetch("/api/notificacoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
    mutate()
  }, [mutate])

  const marcarLida = useCallback(async (id: string) => {
    await fetch("/api/notificacoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    mutate()
  }, [mutate])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded-full hover:bg-zinc-100 transition-colors"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5 text-zinc-600" />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white border border-zinc-200 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
            <span className="text-sm font-semibold text-zinc-800">Notificações</span>
            <div className="flex items-center gap-2">
              {total > 0 && (
                <button
                  onClick={marcarTodasLidas}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Marcar todas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-96 overflow-y-auto divide-y divide-zinc-50">
            {alertas.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="w-8 h-8 mx-auto text-zinc-200 mb-2" />
                <p className="text-sm text-zinc-400">Nenhuma notificação</p>
              </div>
            ) : (
              alertas.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors group",
                    !a.lida && "bg-blue-50/40"
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    <SeveridadeIcon s={a.severidade} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-700 leading-snug">{a.mensagem}</p>
                    {a.demanda && (
                      <Link
                        href={`/demandas/${a.demanda.id}`}
                        onClick={() => { marcarLida(a.id); setOpen(false) }}
                        className="text-[11px] text-blue-600 hover:underline"
                      >
                        {a.demanda.codigo} · {a.demanda.titulo}
                      </Link>
                    )}
                    <p className="text-[10px] text-zinc-400 mt-0.5">{timeAgo(a.createdAt)}</p>
                  </div>
                  {!a.lida && (
                    <button
                      onClick={() => marcarLida(a.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-100 px-4 py-2">
            <Link
              href="/alertas"
              onClick={() => setOpen(false)}
              className="text-xs text-blue-600 hover:underline"
            >
              Ver todos os alertas →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
