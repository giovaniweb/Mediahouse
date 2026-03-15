"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Film, CheckCircle2, MessageSquare, ThumbsUp, Send, AlertCircle, Clock, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Aprovacao {
  id: string
  status: string
  urlVideo: string
  nomeVideo: string
  createdAt: string
  expiresAt: string | null
  aprovadoPor: string | null
  comentario: string | null
  demanda: {
    codigo: string
    titulo: string
    tipoVideo: string
  }
}

export default function AprovarVideoPage() {
  const params = useParams()
  const token = params?.token as string

  const [aprovacao, setAprovacao] = useState<Aprovacao | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<"aprovado" | "feedback" | null>(null)

  // Form
  const [nome, setNome] = useState("")
  const [comentario, setComentario] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/aprovacao-video/${token}`)
        if (!res.ok) {
          const json = await res.json()
          setErro(json.error ?? "Link inválido")
          return
        }
        const json = await res.json()
        setAprovacao(json.aprovacao)

        // Se já respondido, mostra o resultado
        if (json.aprovacao.status !== "pendente") {
          setResultado(json.aprovacao.status === "aprovado" ? "aprovado" : "feedback")
        }
      } catch {
        setErro("Erro ao carregar o link de aprovação")
      } finally {
        setLoading(false)
      }
    }
    if (token) load()
  }, [token])

  async function agir(acao: "aprovar" | "feedback") {
    if (acao === "feedback" && !comentario.trim()) {
      return alert("Por favor, descreva o que precisa ser ajustado.")
    }
    setEnviando(true)
    try {
      const res = await fetch(`/api/aprovacao-video/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, aprovadoPor: nome || undefined, comentario: comentario || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setResultado(acao === "aprovar" ? "aprovado" : "feedback")
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao enviar resposta")
    } finally {
      setEnviando(false)
    }
  }

  // Detecta se é vídeo direto ou embed (YouTube, Vimeo, Drive, etc.)
  function renderPlayer(url: string) {
    const isYoutube = url.includes("youtube.com") || url.includes("youtu.be")
    const isVimeo = url.includes("vimeo.com")
    const isDrive = url.includes("drive.google.com")

    if (isYoutube) {
      const videoId = url.match(/(?:v=|youtu\.be\/|embed\/)([^&?/]+)/)?.[1]
      if (videoId) {
        return (
          <iframe
            className="w-full aspect-video rounded-xl"
            src={`https://www.youtube.com/embed/${videoId}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )
      }
    }

    if (isVimeo) {
      const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1]
      if (videoId) {
        return (
          <iframe
            className="w-full aspect-video rounded-xl"
            src={`https://player.vimeo.com/video/${videoId}?h=auto&color=ffffff`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        )
      }
    }

    if (isDrive) {
      const fileId = url.match(/\/d\/([^/]+)/)?.[1]
      if (fileId) {
        return (
          <iframe
            className="w-full aspect-video rounded-xl"
            src={`https://drive.google.com/file/d/${fileId}/preview`}
            allow="autoplay"
          />
        )
      }
    }

    // Vídeo direto (mp4, webm, etc.)
    return (
      <video
        className="w-full rounded-xl max-h-[70vh]"
        controls
        preload="metadata"
        src={url}
      >
        Seu navegador não suporta o player de vídeo.
      </video>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
      </div>
    )
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Link inválido</h2>
          <p className="text-zinc-400">{erro}</p>
        </div>
      </div>
    )
  }

  if (!aprovacao) return null

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center">
              <Film className="w-4 h-4 text-zinc-900" />
            </div>
            <span className="font-bold">NuFlow</span>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-400">{aprovacao.demanda.codigo}</p>
            <p className="text-sm font-medium text-white">{aprovacao.demanda.titulo}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Resultado já enviado */}
        {resultado === "aprovado" && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-green-300 mb-2">Vídeo Aprovado! 🎉</h2>
            <p className="text-green-400/80">
              {aprovacao.aprovadoPor
                ? `${aprovacao.aprovadoPor} aprovou este vídeo.`
                : "Este vídeo já foi aprovado."
              } Nossa equipe seguirá com a publicação.
            </p>
          </div>
        )}

        {resultado === "feedback" && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6 text-center">
            <MessageSquare className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-yellow-300 mb-2">Feedback enviado!</h2>
            <p className="text-yellow-400/80">Nossa equipe já recebeu suas observações e irá realizar os ajustes solicitados.</p>
            {aprovacao.comentario && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mt-4 text-left">
                <p className="text-xs text-zinc-400 mb-1">Seu comentário:</p>
                <p className="text-sm text-zinc-300">{aprovacao.comentario}</p>
              </div>
            )}
          </div>
        )}

        {/* Título e info */}
        <div>
          <h1 className="text-2xl font-bold mb-1">{aprovacao.nomeVideo}</h1>
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <span>{aprovacao.demanda.tipoVideo}</span>
            {aprovacao.expiresAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Expira em {new Date(aprovacao.expiresAt).toLocaleDateString("pt-BR")}
              </span>
            )}
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium",
              aprovacao.status === "aprovado" ? "bg-green-500/20 text-green-300" :
              aprovacao.status === "feedback_solicitado" ? "bg-yellow-500/20 text-yellow-300" :
              "bg-zinc-800 text-zinc-400"
            )}>
              {aprovacao.status === "pendente" ? "Aguardando sua resposta" :
               aprovacao.status === "aprovado" ? "Aprovado" : "Ajuste solicitado"}
            </span>
          </div>
        </div>

        {/* Player */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {renderPlayer(aprovacao.urlVideo)}
        </div>

        {/* Ações (só se pendente) */}
        {aprovacao.status === "pendente" && !resultado && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-white">O que você acha do vídeo?</h2>

            {/* Nome (opcional) */}
            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-1.5">Seu nome (opcional)</label>
              <input
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: João da Silva"
              />
            </div>

            {/* Feedback opcional */}
            {showFeedback && (
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">
                  Descreva o que precisa ser ajustado *
                </label>
                <textarea
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10 resize-none"
                  rows={4}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Ex: Cortar a parte dos 0:30 a 0:45, ajustar a legenda na segunda cena, incluir logo no final..."
                />
              </div>
            )}

            <div className="flex gap-3">
              {!showFeedback ? (
                <>
                  <button
                    onClick={() => agir("aprovar")}
                    disabled={enviando}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-50 text-sm"
                  >
                    {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                    Aprovar Vídeo
                  </button>
                  <button
                    onClick={() => setShowFeedback(true)}
                    className="flex-1 flex items-center justify-center gap-2 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-medium py-3.5 rounded-xl transition-colors text-sm"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Solicitar Ajuste
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => agir("feedback")}
                    disabled={enviando || !comentario.trim()}
                    className="flex-1 flex items-center justify-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-50 text-sm"
                  >
                    {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar Feedback
                  </button>
                  <button
                    onClick={() => { setShowFeedback(false); setComentario("") }}
                    className="flex-1 border border-zinc-700 text-zinc-300 font-medium py-3.5 rounded-xl hover:bg-zinc-800 transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                </>
              )}
            </div>

            <p className="text-xs text-zinc-500 text-center">
              Ao clicar em &ldquo;Aprovar&rdquo;, o vídeo seguirá para publicação.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 mt-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-xs text-zinc-500">
          <p>NuFlow — Plataforma de Produção Audiovisual</p>
        </div>
      </footer>
    </div>
  )
}
