"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import {
  Download, Play, X, Lock, CalendarRange, MapPin, Clock,
  Film, Loader2, ChevronDown, ChevronUp, CheckCircle2
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Upload {
  id: string
  dia: number
  tipo: string
  momento: string
  titulo: string | null
  url: string
  thumbnailUrl: string | null
  duracao: number | null
}

interface CoberturaPublica {
  id: string
  titulo: string
  tipo: string
  status: string
  descricao: string | null
  cliente: string | null
  local: string | null
  cidade: string | null
  dataInicio: string
  dataFim: string
  totalDias: number
  linkDownloadPublico: boolean
  uploads: Upload[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  congresso:         "Congresso",
  feira:             "Feira",
  evento_corporativo:"Corporativo",
  show:              "Show",
  lancamento:        "Lançamento",
  outro:             "Outro",
}

const MOMENTO_LABEL: Record<string, string> = {
  abertura:     "Abertura",
  palestra:     "Palestra",
  workshop:     "Workshop",
  coquetel:     "Coquetel",
  exposicao:    "Exposição",
  bastidores:   "Bastidores",
  encerramento: "Encerramento",
  outro:        "Outro",
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function formatarDuracao(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, "0")}`
}

function parseVideoUrl(url: string): { tipo: "youtube" | "drive" | "video"; embedUrl: string } {
  // YouTube
  try {
    const u = new URL(url)
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const id = u.searchParams.get("v") || u.pathname.replace("/", "").split("?")[0]
      return { tipo: "youtube", embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1` }
    }
    // Drive
    const driveMatch = url.match(/\/file\/d\/([^/]+)/)
    if (driveMatch) {
      return { tipo: "drive", embedUrl: `https://drive.google.com/file/d/${driveMatch[1]}/preview?autoplay=1` }
    }
  } catch { /* ok */ }
  return { tipo: "video", embedUrl: url }
}

function getDownloadUrl(url: string): string {
  const driveMatch = url.match(/\/file\/d\/([^/]+)/)
  if (driveMatch) return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}download=true`
}

// ─── VideoCard ────────────────────────────────────────────────────────────────

function VideoCard({ upload, onPlay }: { upload: Upload; onPlay: (upload: Upload) => void }) {
  const hasThumbnail = !!upload.thumbnailUrl
  const videoRef = useRef<HTMLVideoElement>(null)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden group">
      {/* Thumbnail / Preview */}
      <div
        className="relative aspect-video bg-zinc-800 cursor-pointer overflow-hidden"
        onClick={() => onPlay(upload)}
      >
        {hasThumbnail ? (
          <img
            src={upload.thumbnailUrl!}
            alt={upload.titulo ?? "Vídeo"}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : upload.tipo === "video" ? (
          <video
            ref={videoRef}
            src={upload.url}
            preload="metadata"
            muted
            playsInline
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget
              v.currentTime = Math.min(1, (v.duration || 2) * 0.1)
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-10 h-10 text-zinc-600" />
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* Duration badge */}
        {upload.duracao && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
            {formatarDuracao(upload.duracao)}
          </div>
        )}

        {/* Momento badge */}
        {upload.momento && upload.momento !== "outro" && (
          <div className="absolute top-2 left-2 bg-black/60 text-zinc-300 text-[10px] px-1.5 py-0.5 rounded-full">
            {MOMENTO_LABEL[upload.momento] ?? upload.momento}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm text-zinc-200 font-medium leading-snug line-clamp-2 mb-2">
          {upload.titulo ?? `Vídeo — Dia ${upload.dia}`}
        </p>
        <div className="flex items-center justify-end">
          <a
            href={getDownloadUrl(upload.url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Baixar vídeo"
            className="flex items-center gap-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <Download className="w-3 h-3" />
            Baixar
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── VideoPlayer ──────────────────────────────────────────────────────────────

function VideoPlayer({ upload, onClose }: { upload: Upload; onClose: () => void }) {
  const { tipo, embedUrl } = parseVideoUrl(upload.url)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors"
        >
          <X className="w-4 h-4" /> Fechar
        </button>

        {upload.titulo && (
          <p className="text-white/70 text-sm mb-2 truncate">{upload.titulo}</p>
        )}

        {tipo === "video" ? (
          <video
            src={embedUrl}
            controls
            autoPlay
            playsInline
            className="w-full rounded-xl max-h-[80vh] bg-black"
          />
        ) : (
          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black">
            <iframe
              src={embedUrl}
              title={upload.titulo ?? "Vídeo"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DiaSection ──────────────────────────────────────────────────────────────

function DiaSection({
  dia,
  uploads,
  totalDias,
  dataInicio,
  onPlay,
}: {
  dia: number
  uploads: Upload[]
  totalDias: number
  dataInicio: string
  onPlay: (u: Upload) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  const dataRef = new Date(dataInicio)
  dataRef.setDate(dataRef.getDate() + (dia - 1))
  const dataLabel = dataRef.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })

  return (
    <div className="mb-10">
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="flex items-center gap-3 w-full text-left mb-4 group"
      >
        <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center shrink-0">
          <CalendarRange className="w-5 h-5 text-purple-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
            Dia {dia}{totalDias > 1 ? ` de ${totalDias}` : ""}
          </h2>
          <p className="text-xs text-zinc-500 capitalize">{dataLabel} · {uploads.length} vídeo(s)</p>
        </div>
        {collapsed
          ? <ChevronDown className="w-4 h-4 text-zinc-500" />
          : <ChevronUp className="w-4 h-4 text-zinc-500" />
        }
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {uploads.map((u) => (
            <VideoCard key={u.id} upload={u} onPlay={onPlay} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EventoPublicoPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [senha, setSenha] = useState("")
  const [senhaDigitada, setSenhaDigitada] = useState("")
  const [requireSenha, setRequireSenha] = useState(false)
  const [senhaErro, setSenhaErro] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cobertura, setCobertura] = useState<CoberturaPublica | null>(null)
  const [playerUpload, setPlayerUpload] = useState<Upload | null>(null)
  const [showQR, setShowQR] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadDone, setDownloadDone] = useState(false)
  const [pageUrl, setPageUrl] = useState("")

  useEffect(() => {
    setPageUrl(window.location.href)
  }, [])

  const fetchData = async (senhaParam?: string) => {
    setLoading(true)
    setSenhaErro(false)
    try {
      const q = senhaParam ? `?senha=${encodeURIComponent(senhaParam)}` : ""
      const res = await fetch(`/api/publico/cobertura/${slug}${q}`)
      const json = await res.json()

      if (res.status === 401 && json.requireSenha) {
        setRequireSenha(true)
        if (senhaParam) setSenhaErro(true)
        setLoading(false)
        return
      }
      if (!res.ok) {
        setError(json.error ?? "Evento não encontrado")
        setLoading(false)
        return
      }
      setCobertura(json.cobertura)
      setRequireSenha(false)
    } catch {
      setError("Erro ao carregar o evento")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (slug) fetchData()
  }, [slug])

  const handleSenhaSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSenha(senhaDigitada)
    fetchData(senhaDigitada)
  }

  const handleDownloadZip = async () => {
    if (!slug) return
    setDownloading(true)
    try {
      const q = senha ? `?senha=${encodeURIComponent(senha)}` : ""
      window.location.href = `/api/publico/cobertura/${slug}/zip${q}`
      setTimeout(() => {
        setDownloadDone(true)
        setDownloading(false)
      }, 2000)
    } catch {
      setDownloading(false)
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Carregando evento...</p>
        </div>
      </div>
    )
  }

  // ── Senha ──
  if (requireSenha) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-purple-400" />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Acesso Protegido</h2>
          <p className="text-zinc-400 text-sm mb-6">Digite a senha para acessar os vídeos deste evento.</p>
          <form onSubmit={handleSenhaSubmit} className="space-y-3">
            <input
              type="password"
              value={senhaDigitada}
              onChange={(e) => { setSenhaDigitada(e.target.value); setSenhaErro(false) }}
              placeholder="Senha..."
              className={`w-full bg-zinc-800 border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 ${senhaErro ? "border-red-500" : "border-zinc-700"}`}
              autoFocus
            />
            {senhaErro && <p className="text-xs text-red-400">Senha incorreta. Tente novamente.</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Acessar →
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Error ──
  if (error || !cobertura) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <Film className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Evento não encontrado</h2>
          <p className="text-zinc-400 text-sm">{error ?? "Este link pode ter expirado ou ser inválido."}</p>
        </div>
      </div>
    )
  }

  // ── Group uploads by day ──
  const diasMap: Record<number, Upload[]> = {}
  for (const u of cobertura.uploads) {
    if (!diasMap[u.dia]) diasMap[u.dia] = []
    diasMap[u.dia].push(u)
  }
  const diasOrdenados = Object.keys(diasMap).map(Number).sort((a, b) => a - b)
  const totalVideos = cobertura.uploads.length

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Player modal */}
      {playerUpload && (
        <VideoPlayer upload={playerUpload} onClose={() => setPlayerUpload(null)} />
      )}

      {/* QR Modal */}
      {showQR && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-white rounded-2xl p-8 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-zinc-800 font-semibold mb-4 text-sm">Leia o QR Code para acessar</p>
            <QRCodeSVG value={pageUrl || "https://nuflow.space"} size={220} />
            <p className="text-zinc-500 text-xs mt-4 max-w-[220px] break-all">{pageUrl}</p>
            <button
              onClick={() => setShowQR(false)}
              className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 flex items-center justify-center shrink-0">
              <CalendarRange className="w-5 h-5 text-purple-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-white truncate">{cobertura.titulo}</h1>
              <p className="text-xs text-zinc-500">{totalVideos} vídeo(s)</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowQR(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
              title="QR Code"
            >
              QR Code
            </button>
            <button
              onClick={handleDownloadZip}
              disabled={downloading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg transition-colors"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : downloadDone ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {downloadDone ? "Iniciado!" : "Baixar Todos"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Event Info ── */}
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-6">
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-600/20 text-purple-300 border border-purple-600/30 font-medium">
              {TIPO_LABEL[cobertura.tipo] ?? cobertura.tipo}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{cobertura.titulo}</h2>
          {cobertura.descricao && (
            <p className="text-zinc-400 text-sm mb-3 max-w-2xl">{cobertura.descricao}</p>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {formatarData(cobertura.dataInicio)}
              {cobertura.dataInicio !== cobertura.dataFim && (
                <> — {formatarData(cobertura.dataFim)}</>
              )}
            </span>
            {(cobertura.local || cobertura.cidade) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {[cobertura.local, cobertura.cidade].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>

        {/* ── Download Banner ── */}
        <div className="bg-purple-600/10 border border-purple-600/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-8">
          <div>
            <p className="text-sm font-medium text-purple-300">📥 Download completo disponível</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Baixe todos os {totalVideos} vídeos em um único arquivo ZIP organizado por dia.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQR(true)}
              className="px-3 py-2 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
            >
              QR Code
            </button>
            <button
              onClick={handleDownloadZip}
              disabled={downloading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg transition-colors"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloadDone ? "Download iniciado!" : "Baixar ZIP"}
            </button>
          </div>
        </div>

        {/* ── Videos by Day ── */}
        {diasOrdenados.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <Film className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum vídeo disponível ainda.</p>
          </div>
        ) : (
          diasOrdenados.map((dia) => (
            <DiaSection
              key={dia}
              dia={dia}
              uploads={diasMap[dia]}
              totalDias={cobertura.totalDias}
              dataInicio={cobertura.dataInicio}
              onPlay={(u) => setPlayerUpload(u)}
            />
          ))
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-800 py-6 mt-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-xs text-zinc-600">
          Disponibilizado por <span className="text-zinc-400">NuFlow</span> · {cobertura.cliente ?? ""}
        </div>
      </footer>
    </div>
  )
}
