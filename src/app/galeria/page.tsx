"use client"

import { useState, useEffect, useCallback } from "react"
import { Search, Film, Play, ExternalLink, Loader2 } from "lucide-react"

interface Video {
  id: string
  codigo: string
  titulo: string
  tipoVideo: string
  linkFinal: string
  finalizadaEm: string | null
  updatedAt: string
}

interface GaleriaData {
  total: number
  page: number
  totalPages: number
  videos: Video[]
}

const TIPO_LABEL: Record<string, string> = {
  reels: "Reels",
  youtube: "YouTube",
  video_institucional: "Institucional",
  institucional: "Institucional",
  treinamento: "Treinamento",
  apresentacao_equipamento: "Produto",
  depoimento: "Depoimento",
  ads: "Ads",
  vsl: "VSL",
  tutorial: "Tutorial",
  cobertura_evento: "Cobertura",
  outro: "Outro",
}

const TIPO_COLOR: Record<string, string> = {
  reels: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  youtube: "bg-red-500/20 text-red-300 border-red-500/30",
  video_institucional: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  institucional: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  cobertura_evento: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  ads: "bg-purple-500/20 text-purple-300 border-purple-500/30",
}

// Detecta tipo de link e retorna { tipo, embedUrl }
function parseVideoUrl(url: string): { tipo: "youtube" | "drive" | "video" | "external"; embedUrl: string } {
  try {
    const u = new URL(url)
    // YouTube
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const vid =
        u.searchParams.get("v") ||
        u.pathname.split("/").filter(Boolean).pop() ||
        ""
      return { tipo: "youtube", embedUrl: `https://www.youtube.com/embed/${vid}?rel=0` }
    }
    // Google Drive
    if (u.hostname.includes("drive.google.com")) {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/)
      if (match) {
        return { tipo: "drive", embedUrl: `https://drive.google.com/file/d/${match[1]}/preview` }
      }
    }
    // Vídeo direto (mp4, webm, mov, etc.)
    if (/\.(mp4|webm|mov|avi)(\?|$)/i.test(url)) {
      return { tipo: "video", embedUrl: url }
    }
  } catch {
    // invalid url
  }
  return { tipo: "external", embedUrl: url }
}

function fmtDate(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
}

function VideoCard({ video }: { video: Video }) {
  const [playing, setPlaying] = useState(false)
  const { tipo, embedUrl } = parseVideoUrl(video.linkFinal)
  const badgeClass = TIPO_COLOR[video.tipoVideo] ?? "bg-zinc-700/50 text-zinc-300 border-zinc-600"
  const finDate = fmtDate(video.finalizadaEm ?? video.updatedAt)

  return (
    <div className="break-inside-avoid mb-4 group">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-600 transition-all duration-200 hover:shadow-xl hover:shadow-black/40">
        {/* Player / Thumbnail */}
        <div className="relative bg-black" style={{ aspectRatio: video.tipoVideo === "reels" ? "9/16" : "16/9" }}>
          {playing ? (
            tipo === "video" ? (
              <video
                src={embedUrl}
                controls
                autoPlay
                className="w-full h-full object-cover"
              />
            ) : tipo === "external" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                <ExternalLink className="w-8 h-8 text-zinc-400" />
                <p className="text-xs text-zinc-400">Link externo</p>
                <a
                  href={embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                >
                  Abrir vídeo
                </a>
              </div>
            ) : (
              <iframe
                src={embedUrl}
                className="absolute inset-0 w-full h-full"
                allowFullScreen
                allow="autoplay; encrypted-media"
                title={video.titulo}
              />
            )
          ) : (
            /* Placeholder com botão play */
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer bg-gradient-to-br from-zinc-800 to-zinc-900"
              onClick={() => setPlaying(true)}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <Film className="w-12 h-12 text-zinc-700" />
              </div>
              <div className="relative z-10 w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <Play className="w-6 h-6 text-white ml-1 fill-white" />
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-sm font-medium text-zinc-200 leading-tight line-clamp-2 flex-1">
              {video.titulo}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 mt-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${badgeClass}`}>
              {TIPO_LABEL[video.tipoVideo] ?? video.tipoVideo}
            </span>
            {finDate && (
              <span className="text-[10px] text-zinc-500">{finDate}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GaleriaPage() {
  const [search, setSearch] = useState("")
  const [tipo, setTipo] = useState("")
  const [page, setPage] = useState(1)
  const [allVideos, setAllVideos] = useState<Video[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)

  const fetchVideos = useCallback(async (p: number, append = false) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: "24" })
      if (search) params.set("search", search)
      if (tipo) params.set("tipo", tipo)
      const res = await fetch(`/api/publico/galeria?${params}`)
      const data: GaleriaData = await res.json()
      setTotal(data.total)
      setTotalPages(data.totalPages)
      setAllVideos((prev) => (append ? [...prev, ...data.videos] : data.videos))
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }, [search, tipo])

  // Reset e rebusca quando mudam filtros
  useEffect(() => {
    setPage(1)
    setAllVideos([])
    fetchVideos(1, false)
  }, [search, tipo]) // eslint-disable-line react-hooks/exhaustive-deps

  function loadMore() {
    const next = page + 1
    setPage(next)
    fetchVideos(next, true)
  }

  const hasMore = page < totalPages

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-3 mr-auto">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <Film className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">NuFlow · Galeria</h1>
              <p className="text-xs text-zinc-400 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {initialLoad ? "…" : `${total.toLocaleString("pt-BR")} vídeos finalizados`}
              </p>
            </div>
          </div>

          {/* Busca */}
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar vídeo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Todos os tipos</option>
              {Object.entries(TIPO_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Grid masonry */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {initialLoad ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
          </div>
        ) : allVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <Film className="w-12 h-12 text-zinc-700 mb-3" />
            <p className="text-zinc-400 text-lg font-medium">Nenhum vídeo encontrado</p>
            <p className="text-zinc-600 text-sm mt-1">Tente buscar por outro termo ou tipo</p>
          </div>
        ) : (
          <>
            {/* Masonry Pinterest */}
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-4">
              {allVideos.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </div>

            {/* Carregar mais */}
            {hasMore && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {loading ? "Carregando…" : `Carregar mais (${total - allVideos.length} restantes)`}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 text-center">
        <p className="text-xs text-zinc-600">
          NuFlow · {total.toLocaleString("pt-BR")} vídeos produzidos
        </p>
      </footer>
    </div>
  )
}
