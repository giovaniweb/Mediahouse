"use client"

import { useEffect, useState } from "react"
import { MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

type Status = "loading" | "connected" | "disconnected" | "error"

export function WhatsAppStatus() {
  const [status, setStatus] = useState<Status>("loading")
  // Avisos que não chegaram nas últimas 24h. Saber que a conexão caiu importa
  // menos do que saber quantas mensagens se perderam enquanto ela estava fora.
  const [naoEnviadas, setNaoEnviadas] = useState(0)

  useEffect(() => {
    let mounted = true

    async function check() {
      try {
        const res = await fetch("/api/whatsapp/status")
        const json = await res.json()
        if (!mounted) return
        setStatus(json.connected ? "connected" : "disconnected")
        setNaoEnviadas(Number(json.naoEnviadas) || 0)
      } catch {
        if (mounted) setStatus("error")
      }
    }

    check()
    // Re-check every 30 seconds
    const interval = setInterval(check, 30000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const statusConfig = {
    loading: { color: "bg-zinc-500", pulse: true, label: "Verificando..." },
    connected: { color: "bg-green-500", pulse: false, label: "WhatsApp conectado" },
    disconnected: { color: "bg-red-500", pulse: true, label: "WhatsApp desconectado" },
    error: { color: "bg-amber-500", pulse: false, label: "Erro na verificacao" },
  }

  const cfg = statusConfig[status]

  return (
    <Link
      // Havendo avisos perdidos, o destino útil é a fila de reenvio, não a
      // tela de configuração da conexão.
      href={naoEnviadas > 0 ? "/mensagens-falhadas" : "/configuracoes"}
      title={naoEnviadas > 0 ? `${naoEnviadas} aviso(s) não entregue(s) — clique para reenviar` : cfg.label}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors text-zinc-400 hover:text-white hover:bg-zinc-800"
    >
      <div className="relative">
        <MessageCircle className="w-4 h-4 flex-shrink-0" />
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-zinc-900",
            cfg.color,
            cfg.pulse && "animate-pulse"
          )}
        />
      </div>
      <span className={cn(
        "truncate",
        status === "connected" && "text-green-400",
        status === "disconnected" && "text-red-400",
        status === "error" && "text-amber-400",
      )}>
        {status === "connected" ? "WhatsApp" : status === "disconnected" ? "WA Offline" : status === "error" ? "WA Erro" : "WA..."}
      </span>
      {naoEnviadas > 0 && (
        <span
          title={`${naoEnviadas} aviso(s) não entregue(s) nas últimas 24h`}
          className="ml-auto shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40"
        >
          {naoEnviadas}
        </span>
      )}
    </Link>
  )
}
