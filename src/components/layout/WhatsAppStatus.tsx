"use client"

import { useEffect, useState } from "react"
import { MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

type Status = "loading" | "connected" | "disconnected" | "error"

const INTERVALO_MS = 60_000

export function WhatsAppStatus() {
  const [status, setStatus] = useState<Status>("loading")
  // Avisos que não chegaram . Saber que a conexão caiu importa
  // menos do que saber quantas mensagens se perderam enquanto ela estava fora.
  const [naoEnviadas, setNaoEnviadas] = useState(0)

  useEffect(() => {
    let mounted = true
    let ultima = 0

    async function check() {
      ultima = Date.now()
      try {
        const res = await fetch("/api/whatsapp/status")
        if (!res.ok) throw new Error("Status indisponível")
        const json = await res.json()
        if (!mounted) return
        setStatus(json.state === "desconhecida" ? "error" : json.connected ? "connected" : "disconnected")
        setNaoEnviadas(Number(json.naoEnviadas) || 0)
      } catch {
        if (mounted) setStatus("error")
      }
    }

    // A cada 60 s e só com a aba à vista: cada consulta é uma chamada paga na
    // Vercel, e aba escondida não tem ninguém olhando o ponto verde. Ao voltar
    // para a aba, confere na hora se a última consulta já envelheceu.
    function seVisivel() {
      if (document.visibilityState === "visible" && Date.now() - ultima >= INTERVALO_MS - 1_000) check()
    }
    check()
    const interval = setInterval(seVisivel, INTERVALO_MS)
    document.addEventListener("visibilitychange", seVisivel)
    return () => {
      mounted = false
      clearInterval(interval)
      document.removeEventListener("visibilitychange", seVisivel)
    }
  }, [])

  const statusConfig = {
    loading: { color: "bg-zinc-500", pulse: true, label: "Verificando..." },
    connected: { color: "bg-green-500", pulse: false, label: "Conexão reportada pelo WhatsApp" },
    disconnected: { color: "bg-red-500", pulse: true, label: "WhatsApp desconectado" },
    error: { color: "bg-amber-500", pulse: false, label: "Status sem confirmação" },
  }

  const cfg = statusConfig[status]

  return (
    <Link
      // Havendo avisos perdidos, o destino útil é a fila de reenvio, não a
      // tela de configuração da conexão.
      href={naoEnviadas > 0 ? "/mensagens-falhadas" : "/configuracoes"}
      title={naoEnviadas > 0 ? `${naoEnviadas} saída(s) precisam de atenção — clique para conferir` : cfg.label}
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
          title={`${naoEnviadas} saída(s) precisam de atenção `}
          className="ml-auto shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40"
        >
          {naoEnviadas}
        </span>
      )}
    </Link>
  )
}
