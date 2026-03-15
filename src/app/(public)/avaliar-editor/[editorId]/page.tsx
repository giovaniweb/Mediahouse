"use client"

import { useState, useEffect } from "react"
import { Star, CheckCircle2, Smile, ThumbsUp, Send, Loader2 } from "lucide-react"
import Image from "next/image"

interface Editor {
  id: string
  nome: string
  avatarUrl?: string
  avaliacao?: number
  especialidade: string[]
}

export default function AvaliarEditorPage({ params }: { params: Promise<{ editorId: string }> }) {
  const [editorId, setEditorId] = useState("")
  const [editor, setEditor] = useState<Editor | null>(null)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState("")

  const [nota, setNota] = useState(0)
  const [hoveredNota, setHoveredNota] = useState(0)
  const [comentario, setComentario] = useState("")
  const [atendeuDemandas, setAtendeuDemandas] = useState<boolean | null>(null)
  const [foiAtencioso, setFoiAtencioso] = useState<boolean | null>(null)
  const [contratariaNovamente, setContratariaNovamente] = useState<boolean | null>(null)

  useEffect(() => {
    params.then(({ editorId: id }) => {
      setEditorId(id)
      fetch(`/api/editores/${id}/avaliar`)
        .then(r => r.json())
        .then(data => {
          if (data.editor) setEditor(data.editor)
          else setErro("Videomaker não encontrado")
        })
        .catch(() => setErro("Erro ao carregar dados"))
        .finally(() => setLoading(false))
    })
  }, [params])

  async function enviar() {
    if (nota === 0) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/editores/${editorId}/avaliar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nota,
          comentario: comentario || undefined,
          atendeuDemandas: atendeuDemandas ?? undefined,
          foiAtencioso: foiAtencioso ?? undefined,
          contratariaNovamente: contratariaNovamente ?? undefined,
          origem: "qr_publico",
        }),
      })
      if (!res.ok) throw new Error("Erro ao enviar avaliação")
      setEnviado(true)
    } catch {
      setErro("Erro ao enviar avaliação. Tente novamente.")
    } finally {
      setEnviando(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
    </div>
  )

  if (erro && !editor) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div className="text-center">
        <p className="text-red-400 text-lg">{erro}</p>
      </div>
    </div>
  )

  if (enviado) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div className="text-center space-y-4">
        <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
        <h2 className="text-2xl font-bold text-white">Obrigado pela avaliação!</h2>
        <p className="text-zinc-400">Sua opinião ajuda a melhorar nosso time.</p>
        {editor && (
          <p className="text-zinc-500 text-sm">Avaliação registrada para <strong className="text-zinc-300">{editor.nome}</strong></p>
        )}
      </div>
    </div>
  )

  const estrelaAtiva = hoveredNota || nota

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5 text-xs text-zinc-400">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Videomaker Int — NuFlow
          </div>

          {/* Avatar */}
          <div className="flex justify-center">
            {editor?.avatarUrl ? (
              <Image
                src={editor.avatarUrl}
                alt={editor.nome}
                width={80}
                height={80}
                className="w-20 h-20 rounded-full object-cover border-2 border-zinc-700"
                unoptimized
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center text-2xl font-bold text-white">
                {editor?.nome?.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white">{editor?.nome}</h1>
            {editor?.especialidade && editor.especialidade.length > 0 && (
              <p className="text-zinc-400 text-sm mt-1">{editor.especialidade.join(" · ")}</p>
            )}
          </div>

          <p className="text-zinc-400 text-sm">Como foi sua experiência com este profissional?</p>
        </div>

        {/* Card de avaliação */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">

          {/* Estrelas */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-300 text-center">Nota geral</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onMouseEnter={() => setHoveredNota(s)}
                  onMouseLeave={() => setHoveredNota(0)}
                  onClick={() => setNota(s)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      s <= estrelaAtiva ? "text-amber-400 fill-amber-400" : "text-zinc-600"
                    }`}
                  />
                </button>
              ))}
            </div>
            {nota > 0 && (
              <p className="text-center text-sm text-zinc-400">
                {nota === 1 ? "😞 Muito ruim" : nota === 2 ? "😕 Ruim" : nota === 3 ? "😐 Regular" : nota === 4 ? "😊 Bom" : "🤩 Excelente!"}
              </p>
            )}
          </div>

          {/* Checklist */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-zinc-300">Avaliação detalhada</p>

            {[
              { label: "Atendeu todas as demandas?", icon: CheckCircle2, value: atendeuDemandas, set: setAtendeuDemandas },
              { label: "Foi atencioso e comunicativo?", icon: Smile, value: foiAtencioso, set: setFoiAtencioso },
              { label: "Contrataria novamente?", icon: ThumbsUp, value: contratariaNovamente, set: setContratariaNovamente },
            ].map(({ label, icon: Icon, value, set }) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <Icon className="w-4 h-4 text-zinc-400" />
                  {label}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => set(true)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      value === true ? "bg-green-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    Sim
                  </button>
                  <button
                    onClick={() => set(false)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      value === false ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    Não
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Comentário */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-300">Comentário (opcional)</label>
            <textarea
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              rows={3}
              placeholder="Compartilhe sua experiência..."
              className="w-full border border-zinc-700 bg-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          {/* Botão enviar */}
          <button
            onClick={enviar}
            disabled={nota === 0 || enviando}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {enviando ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            {enviando ? "Enviando..." : "Enviar Avaliação"}
          </button>
        </div>

        <p className="text-center text-xs text-zinc-600">
          Sua avaliação é anônima e ajuda a melhorar a qualidade do time.
        </p>
      </div>
    </div>
  )
}
