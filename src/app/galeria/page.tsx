"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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

// Extrai ID do YouTube de várias formas de URL
function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v") || u.pathname.split("/").filter(Boolean).pop() || null
    }
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "").split("?")[0] || null
    }
  } catch { /* invalid url */ }
  return null
}

// Detecta tipo e monta embed URL
function parseVideoUrl(url: string): {
  tipo: "youtube" | "drive" | "video" | "external"
  embedUrl: string
  youtubeId: string | null
} {
  try {
    const u = new URL(url)
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const vid = extractYoutubeId(url) ?? ""
      return { tipo: "youtube", embedUrl: `https://www.youtube.com/embed/${vid}?rel=0&autoplay=1`, youtubeId: vid }
    }
    if (u.hostname.includes("drive.google.com")) {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/)
      if (match) {
        return { tipo: "drive", embedUrl: `https://drive.google.com/file/d/${match[1]}/preview`, youtubeId: null }
      }
    }
    if (/\.(mp4|webm|mov|avi)(\?|$)/i.test(url)) {
      return { tipo: "video", embedUrl: url, youtubeId: null }
    }
  } catch { /* invalid url */ }
  return { tipo: "external", embedUrl: url, youtubeId: null }
}

function fmtDate(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
}

function VideoCard({ video, onHide }: { video: Video; onHide: (id: string) => void }) {
  const [playing, setPlaying] = useState(false)
  const { tipo, embedUrl, youtubeId } = parseVideoUrl(video.linkFinal)
  const badgeClass = TIPO_COLOR[video.tipoVideo] ?? "bg-zinc-700/50 text-zinc-300 border-zinc-600"
  const finDate = fmtDate(video.finalizadaEm ?? video.updatedAt)

  // Thumbnail: YouTube usa a API de imagem; outros usam placeholder
  const thumbnailUrl = youtubeId
    ? `https://i3.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
    : null

  // Se a thumbnail do YouTube falhar → vídeo não existe, esconder card
  function handleThumbError() {
    if (tipo === "youtube") onHide(video.id)
  }

  return (
    <div className="break-inside-avoid mb-3 group">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-600 transition-all duration-200 hover:shadow-xl hover:shadow-black/50">
        {/* Player ou Thumbnail */}
        {playing ? (
          <div className="relative" style={{ paddingBottom: video.tipoVideo === "reels" ? "177.7%" : "56.25%", height: 0 }}>
            {tipo === "video" ? (
              <video
                src={embedUrl}
                controls
                autoPlay
                className="absolute inset-0 w-full h-full object-cover bg-black"
              />
            ) : tipo === "external" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900 p-4 text-center">
                <ExternalLink className="w-8 h-8 text-zinc-400" />
                <a
                  href={video.linkFinal}
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
            )}
          </div>
        ) : (
          /* Thumbnail com overlay de play */
          <div className="relative cursor-pointer overflow-hidden" onClick={() => setPlaying(true)}>
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={video.titulo}
                className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={handleThumbError}
              />
            ) : (
              /* Placeholder para Drive / mp4 / outros */
              <div className="aspect-video bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                <Film className="w-10 h-10 text-zinc-600" />
              </div>
            )}
            {/* Overlay de play */}
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center group-hover:scale-110 group-hover:bg-white/25 transition-all duration-200">
                <Play className="w-6 h-6 text-white fill-white ml-1" />
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="p-3">
          <p className="text-sm font-medium text-zinc-200 leading-snug line-clamp-2 mb-2">
            {video.titulo}
          </p>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${badgeClass}`}>
              {TIPO_LABEL[video.tipoVideo] ?? video.tipoVideo}
            </span>
            {finDate && <span className="text-[10px] text-zinc-500">{finDate}</span>}
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
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchVideos = useCallback(async (p: number, append = false, q = search, t = tipo) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: "24" })
      if (q) params.set("search", q)
      if (t) params.set("tipo", t)
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

  // Debounced search
  function handleSearch(v: string) {
    setSearch(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      setHiddenIds(new Set())
      fetchVideos(1, false, v, tipo)
    }, 400)
  }

  function handleTipo(v: string) {
    setTipo(v)
    setPage(1)
    setHiddenIds(new Set())
    fetchVideos(1, false, search, v)
  }

  function hideCard(id: string) {
    setHiddenIds((prev) => new Set([...prev, id]))
  }

  function loadMore() {
    const next = page + 1
    setPage(next)
    fetchVideos(next, true)
  }

  useEffect(() => {
    fetchVideos(1, false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleVideos = allVideos.filter((v) => !hiddenIds.has(v.id))
  const hasMore = page < totalPages

  // Tipos presentes nos vídeos para o filtro
  const tiposDisponiveis = Object.entries(TIPO_LABEL).filter(([k]) =>
    allVideos.some((v) => v.tipoVideo === k) || tipo === k
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
          {/* Logo + contador */}
          <div className="flex items-center gap-3 mr-auto">
            <a href="/sobre" className="flex items-center gap-2">
              <img src="/logo.png" alt="NuFlow" className="w-8 h-8 rounded-lg" />
              <div>
                <span className="text-sm font-bold text-white leading-none">NuFlow</span>
                <p className="text-xs text-zinc-500 leading-none mt-0.5">Galeria</p>
              </div>
            </a>
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-300">
                {initialLoad ? "…" : `${total.toLocaleString("pt-BR")} vídeos`}
              </span>
            </div>
          </div>

          {/* Busca + filtro */}
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar vídeo…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-200 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <select
              value={tipo}
              onChange={(e) => handleTipo(e.target.value)}
              className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Todos os tipos</option>
              {tiposDisponiveis.map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Grid masonry Pinterest */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-6">
        {initialLoad ? (
          <div className="flex items-center justify-center py-40">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
          </div>
        ) : visibleVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 text-center">
            <Film className="w-12 h-12 text-zinc-700 mb-3" />
            <p className="text-zinc-400 text-lg font-medium">Nenhum vídeo encontrado</p>
            {(search || tipo) && (
              <button
                onClick={() => { handleSearch(""); handleTipo("") }}
                className="mt-3 text-sm text-purple-400 hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Masonry: CSS columns */}
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-3">
              {allVideos.map((v) =>
                hiddenIds.has(v.id) ? null : (
                  <VideoCard key={v.id} video={v} onHide={hideCard} />
                )
              )}
            </div>

            {/* Carregar mais */}
            {hasMore && (
              <div className="flex justify-center mt-8 mb-4">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {loading ? "Carregando…" : `Carregar mais (${total - allVideos.length} restantes)`}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-zinc-800 py-6 text-center">
        <p className="text-xs text-zinc-600">
          NuFlow · {total.toLocaleString("pt-BR")} vídeos produzidos
        </p>
      </footer>
    </div>
  )
}
