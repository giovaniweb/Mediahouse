"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, MessageSquare, ThumbsUp, Send, AlertCircle, Clock, Loader2, Copy, Check, Package, Layers } from "lucide-react"
import { ArteViewer } from "./ArteViewer"
import { extrairCopy } from "@/lib/copy-criativo"

interface ArquivoArte { id: string; url: string; nomeArquivo: string; sequencia: number | null }
export interface AprovacaoData {
  id: string
  status: string
  urlVideo: string
  nomeVideo: string
  expiresAt: string | null
  aprovadoPor: string | null
  comentario: string | null
  demanda: {
    codigo: string
    titulo: string
    tipoVideo: string
    departamento?: string | null
    area?: string | null
    descricao?: string | null
    detalhesEntrega?: Record<string, unknown> | null
    arquivos?: ArquivoArte[]
    linhaProjetoRef?: { nome: string } | null
    produtos?: { produto: { nome: string } }[]
  }
}

// Tela de aprovação de arte (Growth) — carrossel + copy + Aprovar/Solicitar ajuste.
// Self-contida: busca pelo token (ou usa initialAprovacao) e responde via POST.
// Renderiza só o corpo (banners + grid); o container (página ou modal) é do consumidor.
export function AprovacaoCriativo({ token, initialAprovacao, onAprovado }: {
  token: string
  initialAprovacao?: AprovacaoData
  onAprovado?: () => void
}) {
  const [aprovacao, setAprovacao] = useState<AprovacaoData | null>(initialAprovacao ?? null)
  const [loading, setLoading] = useState(!initialAprovacao)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<"aprovado" | "feedback" | null>(
    initialAprovacao && initialAprovacao.status !== "pendente"
      ? (initialAprovacao.status === "aprovado" ? "aprovado" : "feedback") : null
  )
  const [nome, setNome] = useState("")
  const [comentario, setComentario] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)
  const [copiado, setCopiado] = useState(false)
  // Link vencido para o cliente. A equipe continua vendo e decidindo (a API libera
  // quem está logado na empresa) — este aviso só oferece a renovação do link público.
  const [expirado, setExpirado] = useState(false)
  const [renovando, setRenovando] = useState(false)

  useEffect(() => {
    if (initialAprovacao) return
    let vivo = true
    ;(async () => {
      try {
        const res = await fetch(`/api/aprovacao-video/${token}`)
        const json = await res.json()
        if (!res.ok) { if (vivo) setErro(json.error ?? "Link inválido"); return }
        if (!vivo) return
        setAprovacao(json.aprovacao)
        setExpirado(!!json.expirado)
        if (json.aprovacao.status !== "pendente") setResultado(json.aprovacao.status === "aprovado" ? "aprovado" : "feedback")
      } catch {
        if (vivo) setErro("Erro ao carregar a aprovação")
      } finally {
        if (vivo) setLoading(false)
      }
    })()
    return () => { vivo = false }
  }, [token, initialAprovacao])

  async function renovarLink() {
    setRenovando(true)
    try {
      const res = await fetch(`/api/aprovacao-video/${token}`, { method: "PATCH" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setExpirado(false)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Não foi possível renovar o link")
    } finally {
      setRenovando(false)
    }
  }

  async function agir(acao: "aprovar" | "feedback") {
    if (acao === "feedback" && !comentario.trim()) return alert("Descreva o que precisa ser ajustado.")
    setEnviando(true)
    try {
      const res = await fetch(`/api/aprovacao-video/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, aprovadoPor: nome || undefined, comentario: comentario || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setResultado(acao === "aprovar" ? "aprovado" : "feedback")
      onAprovado?.()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao enviar resposta")
    } finally {
      setEnviando(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-zinc-500 animate-spin" /></div>
  if (erro) return (
    <div className="text-center py-12 px-6">
      <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
      <h2 className="text-lg font-bold text-white mb-1">Link inválido</h2>
      <p className="text-zinc-400 text-sm">{erro}</p>
    </div>
  )
  if (!aprovacao) return null

  const artes = (aprovacao.demanda.arquivos && aprovacao.demanda.arquivos.length > 0)
    ? aprovacao.demanda.arquivos.map((a) => a.url)
    : [aprovacao.urlVideo]
  const total = artes.length
  const copyText = extrairCopy(aprovacao.demanda.detalhesEntrega, aprovacao.demanda.descricao)
  const produtoNome = aprovacao.demanda.produtos?.[0]?.produto?.nome
  const linhaNome = aprovacao.demanda.linhaProjetoRef?.nome

  return (
    <div className="space-y-6">
      {expirado && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200 flex-1 min-w-[16rem]">
            O link enviado ao cliente venceu. Você continua vendo e decidindo por aqui — para o cliente abrir, renove.
          </p>
          <button
            onClick={renovarLink}
            disabled={renovando}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-100 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-50 transition-colors"
          >
            {renovando ? "Renovando…" : "Renovar por 30 dias"}
          </button>
        </div>
      )}
      {resultado === "aprovado" && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-green-300 mb-2">Arte aprovada! 🎉</h2>
          <p className="text-green-400/80">{aprovacao.aprovadoPor ? `${aprovacao.aprovadoPor} aprovou.` : "Aprovado."} Seguiremos com a publicação.</p>
        </div>
      )}
      {resultado === "feedback" && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6 text-center">
          <MessageSquare className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-yellow-300 mb-2">Feedback enviado!</h2>
          <p className="text-yellow-400/80">Recebemos suas observações e faremos os ajustes.</p>
          {aprovacao.comentario && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mt-4 text-left">
              <p className="text-xs text-zinc-400 mb-1">Comentário:</p>
              <p className="text-sm text-zinc-300">{aprovacao.comentario}</p>
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <ArteViewer artes={artes} />

        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold mb-1">{aprovacao.demanda.titulo}</h1>
            <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-zinc-800">{aprovacao.demanda.tipoVideo}</span>
              {produtoNome && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300"><Package className="w-3 h-3" /> {produtoNome}</span>}
              {linhaNome && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300"><Layers className="w-3 h-3" /> {linhaNome}</span>}
              {total > 1 && <span>{total} artes</span>}
              {aprovacao.expiresAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> expira {new Date(aprovacao.expiresAt).toLocaleDateString("pt-BR")}</span>}
            </div>
          </div>

          {copyText && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Copy / legenda</p>
                <button onClick={() => { navigator.clipboard.writeText(copyText); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }}
                  className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1">
                  {copiado ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                </button>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap max-h-[40vh] overflow-y-auto">{copyText}</p>
            </div>
          )}

          {aprovacao.status === "pendente" && !resultado && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <h2 className="font-semibold text-sm">O que você acha da arte?</h2>
              <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome (opcional)" />
              {showFeedback && (
                <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10 resize-none"
                  rows={4} value={comentario} onChange={(e) => setComentario(e.target.value)}
                  placeholder="Ex: trocar a cor do título no 2º slide, ajustar a copy, corrigir o logo…" />
              )}
              <div className="flex flex-col gap-2">
                {!showFeedback ? (
                  <>
                    <button onClick={() => agir("aprovar")} disabled={enviando}
                      className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 font-semibold py-3 rounded-xl disabled:opacity-50 text-sm">
                      {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />} Aprovar arte
                    </button>
                    <button onClick={() => setShowFeedback(true)}
                      className="w-full flex items-center justify-center gap-2 border border-zinc-700 text-zinc-300 hover:text-white font-medium py-3 rounded-xl text-sm">
                      <MessageSquare className="w-4 h-4" /> Solicitar ajuste
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => agir("feedback")} disabled={enviando || !comentario.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-yellow-600 hover:bg-yellow-700 font-semibold py-3 rounded-xl disabled:opacity-50 text-sm">
                      {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar feedback
                    </button>
                    <button onClick={() => { setShowFeedback(false); setComentario("") }} className="w-full border border-zinc-700 text-zinc-300 py-3 rounded-xl hover:bg-zinc-800 text-sm">Cancelar</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
