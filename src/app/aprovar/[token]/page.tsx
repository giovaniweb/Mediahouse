"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { Film, CheckCircle2, MessageSquare, ThumbsUp, Send, AlertCircle, Clock, Loader2, Copy, Check, Sparkles, Package, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { ArteViewer } from "@/components/aprovacao/ArteViewer"

interface ArquivoArte { id: string; url: string; nomeArquivo: string; sequencia: number | null }
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
    departamento?: string | null
    area?: string | null
    descricao?: string | null
    detalhesEntrega?: Record<string, unknown> | null
    arquivos?: ArquivoArte[]
    linhaProjetoRef?: { nome: string } | null
    produtos?: { produto: { nome: string } }[]
  }
}

interface VersaoAnterior {
  urlVideo: string
  nomeVideo: string | null
  comentario: string | null
  status: string
  createdAt: string
}

/** Segundos → "1:07". O formato que a equipe de edição já usa para se localizar. */
function timecode(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

// Extrai a copy/legenda dos detalhes de entrega (chaves "Copy", "Copy / legenda"…),
// com fallback para a descrição da demanda.
function extrairCopy(det?: Record<string, unknown> | null, descricao?: string | null): string {
  if (det) {
    for (const [k, v] of Object.entries(det)) {
      if (/copy|legenda|caption/i.test(k) && typeof v === "string" && v.trim()) return v
    }
  }
  return descricao ?? ""
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
  const [copiado, setCopiado] = useState(false)

  // Corte anterior do mesmo vídeo, quando existe. "O que mudou?" é a pergunta
  // que quem aprova faz toda vez, e sem isso a resposta dependia da memória.
  const [versaoAnterior, setVersaoAnterior] = useState<VersaoAnterior | null>(null)
  const [comparando, setComparando] = useState(false)
  // Referência ao <video> para ler o instante em que a pessoa está — é o que
  // permite ancorar o comentário no timecode em vez de "lá pelo meio".
  const videoRef = useRef<HTMLVideoElement | null>(null)

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
        setVersaoAnterior(json.versaoAnterior ?? null)

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
  // Pausa no instante atual e começa uma linha de comentário já marcada com o
  // timecode. Antes só existia a caixa de texto livre, e o ajuste chegava ao
  // editor como "arrumar lá pelo meio" — ele tinha de caçar o ponto.
  function marcarMomento() {
    const v = videoRef.current
    if (!v) return
    v.pause()
    const marca = `[${timecode(v.currentTime)}] `
    setShowFeedback(true)
    setComentario((atual) => (atual.trim() ? `${atual.replace(/\s*$/, "")}\n${marca}` : marca))
    // Foca a caixa para a pessoa já sair digitando o que viu naquele ponto.
    requestAnimationFrame(() => {
      const ta = document.getElementById("campo-feedback") as HTMLTextAreaElement | null
      ta?.focus()
      ta?.setSelectionRange(ta.value.length, ta.value.length)
    })
  }

  // `principal` marca o vídeo que está sendo avaliado — só ele recebe a ref,
  // para o botão de marcar momento ler o tempo do corte certo quando os dois
  // estão lado a lado na comparação.
  function renderPlayer(url: string, principal = false) {
    const isYoutube = url.includes("youtube.com") || url.includes("youtu.be")
    const isVimeo = url.includes("vimeo.com")
    const isDrive = url.includes("drive.google.com")
    const urlLimpa = url.split("?")[0].toLowerCase()
    const isImagem = /\.(jpg|jpeg|png|webp|gif|svg)$/.test(urlLimpa)
    const isPdf = urlLimpa.endsWith(".pdf")

    // Artes: imagem ou PDF
    if (isImagem) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={url} alt="Arte para aprovação" className="w-full rounded-xl max-h-[75vh] object-contain bg-zinc-950" />
    }
    if (isPdf) {
      return <iframe className="w-full rounded-xl h-[75vh] bg-zinc-950" src={url} />
    }

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

    // Vídeo direto (mp4, webm, mov, etc.)
    const isMov = urlLimpa.endsWith(".mov") || urlLimpa.endsWith(".qt")
    return (
      <div className="space-y-3">
        <video
          ref={principal ? videoRef : undefined}
          className="w-full rounded-xl max-h-[70vh] bg-black"
          controls
          playsInline
          preload="metadata"
          src={url}
        >
          Seu navegador não suporta o player de vídeo.
        </video>
        {isMov && (
          <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Este vídeo está em formato <b>.mov</b> (Apple). Em alguns navegadores (ex: Chrome) a imagem pode aparecer preta.
            Use o botão abaixo para abrir ou baixar e assistir no seu dispositivo.
          </p>
        )}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          download
          className="flex items-center justify-center gap-2 w-full border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800/60 font-medium py-3 rounded-xl transition-colors text-sm"
        >
          <Film className="w-4 h-4" />
          Abrir / baixar vídeo
        </a>
      </div>
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

  // ── Growth (design): tela de aprovação de ARTE — carrossel estilo Instagram + copy ──
  // Só a ÁREA decide. O departamento é quem pediu, não quem produz: incluí-lo aqui
  // mandava 104 demandas audiovisuais para a tela de artes, sem player de vídeo.
  const isGrowth = aprovacao.demanda.area === "design"
  if (isGrowth) {
    const artes = (aprovacao.demanda.arquivos && aprovacao.demanda.arquivos.length > 0)
      ? aprovacao.demanda.arquivos.map((a) => a.url)
      : [aprovacao.urlVideo]
    const total = artes.length
    const copyText = extrairCopy(aprovacao.demanda.detalhesEntrega, aprovacao.demanda.descricao)
    const produtoNome = aprovacao.demanda.produtos?.[0]?.produto?.nome
    const linhaNome = aprovacao.demanda.linhaProjetoRef?.nome

    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <header className="border-b border-zinc-800">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-fuchsia-500 to-indigo-500 rounded-md flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold">NuFlow</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-400">{aprovacao.demanda.codigo}</p>
              <p className="text-sm font-medium">{aprovacao.demanda.titulo}</p>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
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
                  <p className="text-xs text-zinc-400 mb-1">Seu comentário:</p>
                  <p className="text-sm text-zinc-300">{aprovacao.comentario}</p>
                </div>
              )}
            </div>
          )}

          <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
            {/* Carrossel estilo Instagram */}
            <ArteViewer artes={artes} />

            {/* Copy + info + ações */}
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold mb-1">{aprovacao.demanda.titulo}</h1>
                <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full bg-zinc-800">{aprovacao.demanda.tipoVideo}</span>
                  {produtoNome && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300"><Package className="w-3 h-3" /> {produtoNome}</span>
                  )}
                  {linhaNome && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300"><Layers className="w-3 h-3" /> {linhaNome}</span>
                  )}
                  {total > 1 && <span>{total} artes</span>}
                  {aprovacao.expiresAt && (
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> expira {new Date(aprovacao.expiresAt).toLocaleDateString("pt-BR")}</span>
                  )}
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
        </main>

        <footer className="border-t border-zinc-800 py-6 mt-8">
          <div className="max-w-5xl mx-auto px-6 text-center text-xs text-zinc-500"><p>NuFlow — Aprovação de criativo</p></div>
        </footer>
      </div>
    )
  }

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

        {/* Player — lado a lado com o corte anterior quando a pessoa pede */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {comparando && versaoAnterior ? (
            <div className="grid gap-3 lg:grid-cols-2 p-3">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2 px-1">
                  Versão anterior · {new Date(versaoAnterior.createdAt).toLocaleDateString("pt-BR")}
                </p>
                {renderPlayer(versaoAnterior.urlVideo)}
                {versaoAnterior.comentario && (
                  <p className="mt-2 px-1 text-xs text-zinc-400 italic">
                    Seu retorno: “{versaoAnterior.comentario}”
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-2 px-1">
                  Versão nova · para aprovar
                </p>
                {renderPlayer(aprovacao.urlVideo, true)}
              </div>
            </div>
          ) : (
            renderPlayer(aprovacao.urlVideo, true)
          )}
        </div>

        {/* Ferramentas de quem avalia. Aparecem só enquanto há decisão a tomar. */}
        {aprovacao.status === "pendente" && !resultado && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={marcarMomento}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 hover:border-zinc-500 transition-colors"
            >
              <Clock className="w-4 h-4" />
              Marcar este momento
            </button>
            {versaoAnterior && (
              <button
                onClick={() => setComparando((v) => !v)}
                className={cn(
                  "flex items-center gap-2 text-sm px-3 py-2 rounded-xl border transition-colors",
                  comparando
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                    : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-500"
                )}
              >
                <Layers className="w-4 h-4" />
                {comparando ? "Ver só a versão nova" : "Comparar com a anterior"}
              </button>
            )}
          </div>
        )}

        {/* Ações (só se pendente). Enquanto é só decidir, o painel fica grudado
            no rodapé — num vídeo alto os botões caíam abaixo da dobra e a pessoa
            assistia sem ver como responder. Ao abrir o campo de ajuste ele solta:
            aberto, o painel é alto e taparia justamente os vídeos que a pessoa
            precisa olhar para escrever. */}
        {aprovacao.status === "pendente" && !resultado && (
          <div className={cn(
            "bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 space-y-4",
            !showFeedback && "sticky bottom-0 z-10 backdrop-blur shadow-2xl shadow-black/50"
          )}>
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
                  id="campo-feedback"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10 resize-none"
                  rows={4}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Ex: Cortar a parte dos 0:30 a 0:45, ajustar a legenda na segunda cena, incluir logo no final..."
                />
                <p className="text-xs text-zinc-500 mt-1.5">
                  Dica: use <b>Marcar este momento</b> enquanto assiste — o instante entra no
                  comentário e o editor vai direto ao ponto.
                </p>
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
