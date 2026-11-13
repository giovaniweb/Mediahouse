"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import type { StatusInterno } from "@prisma/client"

/**
 * O que faz quem a empresa parceira escolheu para a gravação (o X da GH):
 * iniciar e finalizar a captação e entregar o material por link — como o
 * videomaker faz pelo link do convite. Aceitar ou recusar a gravação e mandar
 * a nota ficam com quem foi escalado por quem pediu.
 */
export function AcoesDoExecutor({
  jobId,
  statusInterno,
  captacaoIniciada,
  pedeVideo,
  temBrutos,
  temVideo,
  onExecutado,
}: {
  jobId: string
  statusInterno: StatusInterno
  captacaoIniciada: boolean
  /** A edição é do videomaker: além dos brutos, ele manda o vídeo pronto. */
  pedeVideo: boolean
  temBrutos: boolean
  temVideo: boolean
  onExecutado: () => void
}) {
  const [emCurso, setEmCurso] = useState<string | null>(null)
  const [erro, setErro] = useState("")
  const [brutos, setBrutos] = useState("")
  const [video, setVideo] = useState("")

  async function chamar(chave: string, url: string, init: RequestInit) {
    setErro("")
    setEmCurso(chave)
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `Não foi possível concluir (${res.status})`)
      setBrutos("")
      setVideo("")
      onExecutado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de conexão")
    } finally {
      setEmCurso(null)
    }
  }

  const aguardaConfirmacao = statusInterno === "videomaker_notificado" || statusInterno === "planejamento" || statusInterno === "aguardando_triagem" || statusInterno === "pedido_criado"
  const podeIniciar = statusInterno === "videomaker_aceitou" && !captacaoIniciada
  const podeFinalizar = (statusInterno === "videomaker_aceitou" && captacaoIniciada) || statusInterno === "captacao_agendada"
  const podeEntregar = statusInterno === "captacao_realizada" || ((statusInterno === "videomaker_aceitou" || statusInterno === "captacao_agendada") && captacaoIniciada) || statusInterno === "brutos_enviados"
  const faltaBrutos = !temBrutos
  const faltaVideo = pedeVideo && !temVideo

  const botao = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-[#7c5cff] hover:bg-[#6a4cf0] text-white disabled:opacity-50"
  const campo = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200"

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <p className="text-sm font-medium text-zinc-200">Sua parte nesta gravação</p>
      {aguardaConfirmacao && <p className="text-xs text-zinc-400">Aguardando a confirmação da gravação por quem foi escalado.</p>}
      <div className="flex flex-wrap gap-2">
        {podeIniciar && (
          <button className={botao} disabled={!!emCurso} onClick={() => void chamar("iniciar", `/api/jobs/${jobId}/captacao`, { method: "POST" })}>
            {emCurso === "iniciar" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Iniciar captação
          </button>
        )}
        {podeFinalizar && (
          <button className={botao} disabled={!!emCurso} onClick={() => void chamar("finalizar", `/api/demandas/${jobId}/status`, { method: "PATCH", body: JSON.stringify({ statusInterno: "captacao_realizada", origem: "manual" }) })}>
            {emCurso === "finalizar" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Finalizar captação
          </button>
        )}
      </div>
      {podeEntregar && (faltaBrutos || faltaVideo) && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            const corpo: Record<string, string> = {}
            if (faltaBrutos && brutos.trim()) corpo.linkBrutos = brutos.trim()
            if (faltaVideo && video.trim()) corpo.linkVideo = video.trim()
            void chamar("entregar", `/api/jobs/${jobId}/entrega`, { method: "POST", body: JSON.stringify(corpo) })
          }}
        >
          {faltaBrutos && <input aria-label="Link dos brutos" className={campo} placeholder="Link do drive com os brutos (https://…)" value={brutos} onChange={(e) => setBrutos(e.target.value)} />}
          {faltaVideo && <input aria-label="Link do vídeo pronto" className={campo} placeholder="Link do vídeo pronto (https://…)" value={video} onChange={(e) => setVideo(e.target.value)} />}
          <button type="submit" className={botao} disabled={!!emCurso || (!brutos.trim() && !video.trim())}>
            {emCurso === "entregar" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Entregar material
          </button>
        </form>
      )}
      {!faltaBrutos && !faltaVideo && temBrutos && <p className="text-xs text-emerald-400">Material entregue. Obrigado!</p>}
      {erro && <p className="text-xs text-red-400" role="alert">{erro}</p>}
    </div>
  )
}
