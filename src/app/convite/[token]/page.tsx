"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Check, X, Loader2, Calendar, MapPin, Film, AlertTriangle, Clock } from "lucide-react"

interface ConviteData {
  id: string
  status: string
  expiresAt: string
  videomaker: { id: string; nome: string }
  demanda: {
    codigo: string
    titulo: string
    descricao: string
    tipoVideo: string
    cidade: string
    dataEvento?: string
    localEvento?: string
    dataCaptacao?: string
    prioridade: string
  }
}

export default function ConvitePage() {
  const { token } = useParams<{ token: string }>()
  const [convite, setConvite] = useState<ConviteData | null>(null)
  const [erro, setErro] = useState("")
  const [loading, setLoading] = useState(true)
  const [respondendo, setRespondendo] = useState(false)
  const [resultado, setResultado] = useState<"aceito" | "recusado" | null>(null)

  useEffect(() => {
    fetch(`/api/convites/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json()
          throw new Error(data.error || "Erro ao carregar convite")
        }
        return r.json()
      })
      .then(setConvite)
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false))
  }, [token])

  async function responder(acao: "aceitar" | "recusar") {
    setRespondendo(true)
    try {
      const r = await fetch(`/api/convites/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      })
      if (!r.ok) {
        const data = await r.json()
        throw new Error(data.error || "Erro ao responder")
      }
      setResultado(acao === "aceitar" ? "aceito" : "recusado")
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro")
    } finally {
      setRespondendo(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-zinc-100 mb-2">Convite Indisponivel</h1>
          <p className="text-zinc-400">{erro}</p>
        </div>
      </div>
    )
  }

  if (resultado) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md text-center">
          {resultado === "aceito" ? (
            <>
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h1 className="text-xl font-bold text-zinc-100 mb-2">Convite Aceito!</h1>
              <p className="text-zinc-400">Voce foi atribuido a demanda. Voce recebera os proximos passos via WhatsApp.</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <X className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-zinc-100 mb-2">Convite Recusado</h1>
              <p className="text-zinc-400">Tudo bem! O gestor sera notificado e buscara outro profissional.</p>
            </>
          )}
        </div>
      </div>
    )
  }

  const d = convite!.demanda

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5">
          <p className="text-purple-200 text-sm font-medium">Convite de Demanda</p>
          <h1 className="text-xl font-bold text-white mt-1">{d.codigo} — {d.titulo}</h1>
        </div>

        {/* Info */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-zinc-300">
            Ola <span className="font-semibold text-white">{convite!.videomaker.nome}</span>, voce foi convidado para participar desta demanda:
          </p>

          <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Film className="w-4 h-4 text-zinc-500" />
              <span className="text-zinc-400">Tipo:</span>
              <span className="text-zinc-200">{d.tipoVideo}</span>
            </div>
            {d.localEvento && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-400">Local:</span>
                <span className="text-zinc-200">{d.localEvento}</span>
              </div>
            )}
            {(d.dataEvento || d.dataCaptacao) && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-400">Data:</span>
                <span className="text-zinc-200">
                  {new Date(d.dataEvento || d.dataCaptacao!).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-zinc-500" />
              <span className="text-zinc-400">Cidade:</span>
              <span className="text-zinc-200">{d.cidade}</span>
            </div>
            {d.prioridade !== "normal" && (
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                <span className="text-yellow-400 font-medium capitalize">{d.prioridade}</span>
              </div>
            )}
          </div>

          {d.descricao && (
            <div>
              <p className="text-xs text-zinc-500 uppercase font-semibold mb-1">Descricao</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{d.descricao}</p>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <Clock className="w-3.5 h-3.5" />
            Expira em {new Date(convite!.expiresAt).toLocaleDateString("pt-BR")} as{" "}
            {new Date(convite!.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-5 border-t border-zinc-800 flex gap-3">
          <button
            onClick={() => responder("aceitar")}
            disabled={respondendo}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {respondendo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            Aceitar
          </button>
          <button
            onClick={() => responder("recusar")}
            disabled={respondendo}
            className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold py-3 rounded-xl border border-zinc-700 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
            Recusar
          </button>
        </div>
      </div>
    </div>
  )
}
