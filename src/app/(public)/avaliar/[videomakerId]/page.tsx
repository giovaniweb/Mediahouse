"use client"

import { useState, use } from "react"
import { Star, Send, CheckCircle2, AlertCircle, Film } from "lucide-react"
import { cn } from "@/lib/utils"

interface Params {
  videomakerId: string
}

export default function AvaliarVideomakerPage({ params }: { params: Promise<Params> }) {
  const { videomakerId } = use(params)

  const [nota, setNota] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comentario, setComentario] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<"ok" | "erro" | null>(null)
  const [errorMsg, setErrorMsg] = useState("")

  const starLabels = ["", "Ruim", "Regular", "Bom", "Muito bom", "Excelente"]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (nota === 0) return

    setEnviando(true)
    try {
      const res = await fetch("/api/publico/avaliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videomakerId, nota, comentario }),
      })

      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || "Erro ao enviar avaliação")
        setResultado("erro")
      } else {
        setResultado("ok")
      }
    } catch {
      setErrorMsg("Erro de conexão. Tente novamente.")
      setResultado("erro")
    } finally {
      setEnviando(false)
    }
  }

  if (resultado === "ok") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 shadow-2xl">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Obrigado!</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Sua avaliação foi registrada com sucesso.{" "}
              <br />Sua opinião é muito importante para nós.
            </p>
            <div className="mt-8 flex justify-center gap-1">
              {Array.from({ length: nota }).map((_, i) => (
                <Star
                  key={i}
                  className="h-6 w-6 text-yellow-400 fill-yellow-400"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-white mb-3">
            <Film className="h-6 w-6" />
            <span className="text-xl font-bold tracking-tight">VideoOps</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Avalie o Profissional</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Sua avaliação nos ajuda a garantir qualidade nos nossos projetos
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Stars */}
            <div className="text-center">
              <p className="text-sm text-zinc-400 mb-4 font-medium uppercase tracking-wider">
                Sua avaliação
              </p>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => setNota(star)}
                    className="transition-transform hover:scale-110 focus:outline-none"
                  >
                    <Star
                      className={cn(
                        "h-10 w-10 transition-colors",
                        (hovered || nota) >= star
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-zinc-700"
                      )}
                    />
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm font-medium text-zinc-300 h-5">
                {starLabels[hovered || nota] || ""}
              </p>
            </div>

            {/* Comment */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Comentário <span className="text-zinc-500">(opcional)</span>
              </label>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Conte um pouco sobre sua experiência com este profissional..."
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 transition-colors"
                maxLength={500}
              />
              <div className="flex justify-end mt-1">
                <span className="text-xs text-zinc-600">{comentario.length}/500</span>
              </div>
            </div>

            {resultado === "erro" && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={nota === 0 || enviando}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all",
                nota > 0 && !enviando
                  ? "bg-white text-zinc-900 hover:bg-zinc-100 shadow-lg shadow-white/10"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              )}
            >
              {enviando ? (
                <>
                  <div className="h-4 w-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar Avaliação
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-6">
          Sistema de Gestão Audiovisual — VideoOps
        </p>
      </div>
    </div>
  )
}
