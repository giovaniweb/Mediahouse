"use client"

import { useEffect, useState } from "react"
import { MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

type Status = "loading" | "connected" | "disconnected" | "error"

export function WhatsAppStatus() {
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    let mounted = true

    async function check() {
      try {
        const res = await fetch("/api/whatsapp/status")
        const json = await res.json()
        if (!mounted) return
        setStatus(json.connected ? "connected" : "disconnected")
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
      href="/configuracoes"
      title={cfg.label}
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
    </Link>
  )
}
