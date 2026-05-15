"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Check, X, Loader2, Calendar, MapPin, Film, AlertTriangle, Clock, DollarSign } from "lucide-react"

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
    localGravacao?: string
    dataCaptacao?: string
    prioridade: string
  }
}

type ErroState = {
  mensagem: string
  statusConvite?: "aceito" | "recusado" | "expirado"
}

export default function ConvitePage() {
  const { token } = useParams<{ token: string }>()
  const [convite, setConvite] = useState<ConviteData | null>(null)
  const [erro, setErro] = useState<ErroState | null>(null)
  const [loading, setLoading] = useState(true)
  const [respondendo, setRespondendo] = useState(false)
  const [resultado, setResultado] = useState<"aceito" | "recusado" | null>(null)

  useEffect(() => {
    fetch(`/api/convites/${token}`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) {
          // Convite já respondido ou expirado — mostrar estado específico
          const statusConvite = data.status as "aceito" | "recusado" | "expirado" | undefined
          throw { mensagem: data.error || "Erro ao carregar convite", statusConvite }
        }
        return data
      })
      .then(setConvite)
      .catch((e) => setErro({ mensagem: e.mensagem || e.message || "Erro", statusConvite: e.statusConvite }))
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
      setErro({ mensagem: e instanceof Error ? e.message : "Erro" })
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

  // Convite já respondido — mostrar estado específico
  if (erro?.statusConvite) {
    const isAceito = erro.statusConvite === "aceito"
    const isRecusado = erro.statusConvite === "recusado"
    const isExpirado = erro.statusConvite === "expirado"

    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md text-center">
          {isAceito && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h1 className="text-xl font-bold text-zinc-100 mb-2">Você já aceitou esta demanda! ✅</h1>
              <p className="text-zinc-400">Fique de olho no WhatsApp para os próximos passos. Boa captação! 🎬</p>
            </>
          )}
          {isRecusado && (
            <>
              <div className="w-16 h-16 rounded-full bg-zinc-700/40 flex items-center justify-center mx-auto mb-4">
                <X className="w-8 h-8 text-zinc-400" />
              </div>
              <h1 className="text-xl font-bold text-zinc-100 mb-2">Convite já recusado</h1>
              <p className="text-zinc-400">Você já recusou esta demanda anteriormente. O gestor foi notificado.</p>
            </>
          )}
          {isExpirado && (
            <>
              <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-yellow-400" />
              </div>
              <h1 className="text-xl font-bold text-zinc-100 mb-2">Convite expirado</h1>
              <p className="text-zinc-400">Este link não é mais válido. Entre em contato com a equipe se ainda tiver interesse.</p>
            </>
          )}
        </div>
      </div>
    )
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-zinc-100 mb-2">Convite Indisponível</h1>
          <p className="text-zinc-400">{erro.mensagem}</p>
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
              <h1 className="text-xl font-bold text-zinc-100 mb-2">Convite Aceito! ✅</h1>
              <p className="text-zinc-400">Você foi confirmado nesta demanda. Aguarde os próximos passos via WhatsApp. Boa captação! 🎬</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <X className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-zinc-100 mb-2">Convite Recusado</h1>
              <p className="text-zinc-400">Tudo bem! O gestor será notificado e buscará outro profissional.</p>
            </>
          )}
        </div>
      </div>
    )
  }

  const d = convite!.demanda
  const localExibir = d.localEvento || d.localGravacao

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
            Olá <span className="font-semibold text-white">{convite!.videomaker.nome}</span>, você foi convidado para participar desta demanda:
          </p>

          <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Film className="w-4 h-4 text-zinc-500" />
              <span className="text-zinc-400">Tipo:</span>
              <span className="text-zinc-200">{d.tipoVideo}</span>
            </div>
            {localExibir && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-400">Local:</span>
                <span className="text-zinc-200">{localExibir}</span>
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
            {d.cidade && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-400">Cidade:</span>
                <span className="text-zinc-200">{d.cidade}</span>
              </div>
            )}
            {d.prioridade !== "normal" && (
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                <span className="text-yellow-400 font-medium capitalize">{d.prioridade}</span>
              </div>
            )}
          </div>

          {d.descricao && (
            <div>
              <p className="text-xs text-zinc-500 uppercase font-semibold mb-1">Descrição</p>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{d.descricao}</p>
            </div>
          )}

          {/* Seção de Pagamento */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <p className="text-sm text-amber-300 font-medium">Pagamento</p>
            </div>
            <p className="text-sm text-zinc-300">
              Realizado em até <strong className="text-white">15 dias</strong> após o envio da nota fiscal.
            </p>
            <p className="text-xs text-zinc-500 mt-1">A nota fiscal deverá ser enviada assim que os brutos forem entregues.</p>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <Clock className="w-3.5 h-3.5" />
            Expira em {new Date(convite!.expiresAt).toLocaleDateString("pt-BR")} às{" "}
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
