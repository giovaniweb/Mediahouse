"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Header } from "@/components/layout/Header"
import { AlertTriangle, RefreshCw, Loader2, CheckCircle2, MessageCircleOff } from "lucide-react"
import { toast } from "sonner"
import { fetcher } from "@/lib/fetcher"


interface MensagemFalhada {
  id: string
  telefone: string
  conteudo: string
  status: string
  createdAt: string
  demanda?: { id: string; codigo: string; titulo: string } | null
}

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  })
}

export default function MensagensFalhadasPage() {
  const { data, isLoading, mutate } = useSWR<{ mensagens: MensagemFalhada[]; total: number }>(
    "/api/mensagens-falhadas?limit=200", fetcher
  )
  const [reenviando, setReenviando] = useState<string | null>(null)
  const [reenviandoTudo, setReenviandoTudo] = useState(false)

  const mensagens = data?.mensagens ?? []
  const total = data?.total ?? 0

  async function reenviar(ids: string[], rotulo: string) {
    const res = await fetch("/api/mensagens-falhadas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? "Erro ao reenviar")
      return
    }
    if (json.enviadas === 0) {
      toast.error("Nenhuma foi entregue — verifique se o WhatsApp está conectado.")
    } else if (json.falharam > 0) {
      toast.warning(`${json.enviadas} entregue(s), ${json.falharam} continuam falhando.`)
    } else {
      toast.success(`${rotulo} entregue(s).`)
    }
    mutate()
  }

  return (
    <>
      <Header title="Avisos não entregues" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Avisos não entregues</h1>
              <p className="text-sm text-zinc-400 max-w-2xl">
                {isLoading
                  ? "Carregando…"
                  : total === 0
                  ? "Tudo em dia — nenhum aviso ficou pelo caminho."
                  : `${total.toLocaleString("pt-BR")} mensagem(ns) que o sistema tentou enviar e não chegaram. Costuma acontecer quando a conexão do WhatsApp cai.`}
              </p>
            </div>
          </div>

          {mensagens.length > 0 && (
            <button
              onClick={async () => {
                setReenviandoTudo(true)
                await reenviar(mensagens.map((m) => m.id), "Todas")
                setReenviandoTudo(false)
              }}
              disabled={reenviandoTudo}
              className="flex items-center gap-2 shrink-0 px-3 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-60"
            >
              {reenviandoTudo
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Reenviando…</>
                : <><RefreshCw className="w-4 h-4" /> Reenviar todas ({mensagens.length})</>}
            </button>
          )}
        </div>

        {!isLoading && total === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
            <p className="text-zinc-300 font-medium">Nenhum aviso pendente</p>
            <p className="text-sm text-zinc-500 mt-1">
              Se o WhatsApp cair, as mensagens perdidas aparecem aqui para reenvio.
            </p>
          </div>
        )}

        {mensagens.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {mensagens.map((m) => (
              <div key={m.id} className="flex items-start gap-4 p-4">
                <MessageCircleOff className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-200">{m.telefone}</span>
                    {m.demanda && (
                      <Link
                        href={`/demandas/${m.demanda.id}`}
                        className="text-xs font-mono text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        {m.demanda.codigo}
                      </Link>
                    )}
                    <span className="text-xs text-zinc-500">{quando(m.createdAt)}</span>
                    {m.status === "sem_config" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        SEM CONFIGURAÇÃO
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 whitespace-pre-wrap line-clamp-3">{m.conteudo}</p>
                </div>

                <button
                  onClick={async () => {
                    setReenviando(m.id)
                    await reenviar([m.id], "Mensagem")
                    setReenviando(null)
                  }}
                  disabled={reenviando === m.id || reenviandoTudo}
                  className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-60"
                >
                  {reenviando === m.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                  Reenviar
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
