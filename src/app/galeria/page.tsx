"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Search, Play, ExternalLink, Loader2, Download, Sparkles, Film } from "lucide-react"

interface Video {
  id: string
  demandaId?: string   // pode diferir de id quando há múltiplos vídeos por demanda
  codigo: string
  titulo: string
  tipoVideo: string
  departamento: string | null
  linkFinal: string
  thumbnailUrl: string | null
  finalizadaEm: string | null
  updatedAt: string
  produto: string | null
  produtoId: string | null
  sequencia?: number | null
}

interface GaleriaData {
  total: number
  page: number
  totalPages: number
  videos: Video[]
}

interface Produto {
  id: string
  nome: string
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
  reels:                   "bg-pink-500/20 text-pink-300 border-pink-500/30",
  youtube:                 "bg-red-500/20 text-red-300 border-red-500/30",
  video_institucional:     "bg-blue-500/20 text-blue-300 border-blue-500/30",
  institucional:           "bg-blue-500/20 text-blue-300 border-blue-500/30",
  cobertura_evento:        "bg-amber-500/20 text-amber-300 border-amber-500/30",
  ads:                     "bg-purple-500/20 text-purple-300 border-purple-500/30",
  treinamento:             "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  depoimento:              "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  apresentacao_equipamento:"bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
}

// Tipos que usam formato vertical (9:16)
const PORTRAIT_TIPOS = new Set(["reels", "ads"])

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function parseVideoUrl(url: string): {
  tipo: "youtube" | "drive" | "video" | "external"
  embedUrl: string
  youtubeId: string | null
  isYoutubeShorts: boolean
} {
  try {
    const u = new URL(url)
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const vid = extractYoutubeId(url) ?? ""
      const isShorts = u.hostname.includes("youtube.com") && u.pathname.includes("/shorts/")
      return { tipo: "youtube", embedUrl: `https://www.youtube.com/embed/${vid}?rel=0&autoplay=1`, youtubeId: vid, isYoutubeShorts: isShorts }
    }
    if (u.hostname.includes("drive.google.com")) {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/)
      if (match) {
        return { tipo: "drive", embedUrl: `https://drive.google.com/file/d/${match[1]}/preview`, youtubeId: null, isYoutubeShorts: false }
      }
    }
    if (/\.(mp4|webm|mov|avi)(\?|$)/i.test(url)) {
      return { tipo: "video", embedUrl: url, youtubeId: null, isYoutubeShorts: false }
    }
  } catch { /* invalid url */ }
  return { tipo: "external", embedUrl: url, youtubeId: null, isYoutubeShorts: false }
}

function getDriveThumbnail(url: string): string | null {
  const match = url.match(/\/file\/d\/([^/]+)/)
  // Usa proxy server-side com service account — evita problema de autenticação do Drive
  if (match) return `/api/publico/drive-thumbnail?fileId=${match[1]}`
  return null
}

function getDownloadUrl(url: string): string {
  const match = url.match(/\/file\/d\/([^/]+)/)
  if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`
  return url // Supabase / direto: URL serve diretamente
}

// Gradiente de fundo único por vídeo (para cards sem thumbnail)
function getPlaceholderGradient(id: string): string {
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const gs = [
    "from-purple-900 via-indigo-900 to-zinc-900",
    "from-blue-900 via-cyan-900 to-zinc-900",
    "from-rose-900 via-pink-900 to-zinc-900",
    "from-emerald-900 via-teal-900 to-zinc-900",
    "from-amber-900 via-orange-900 to-zinc-900",
    "from-violet-900 via-purple-900 to-zinc-900",
    "from-sky-900 via-blue-900 to-zinc-900",
  ]
  return gs[hash % gs.length]
}

function fmtDate(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
}

// Contador animado de 0 → value
function AnimatedCounter({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (!value || started.current) return
    started.current = true
    const steps = 50
    const increment = value / steps
    let current = 0
    const timer = setInterval(() => {
      current = Math.min(current + increment, value)
      setDisplayed(Math.floor(current))
      if (current >= value) clearInterval(timer)
    }, 20)
    return () => clearInterval(timer)
  }, [value])

  return <span>{displayed.toLocaleString("pt-BR")}</span>
}

// ─── VideoCard ─────────────────────────────────────────────────────────────────

function VideoCard({ video, onHide }: { video: Video; onHide: (id: string) => void }) {
  const [playing, setPlaying] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)
  const { tipo, embedUrl, youtubeId, isYoutubeShorts } = parseVideoUrl(video.linkFinal)
  const badgeClass = TIPO_COLOR[video.tipoVideo] ?? "bg-zinc-700/50 text-zinc-300 border-zinc-600"
  const finDate = fmtDate(video.finalizadaEm ?? video.updatedAt)
  const isPortrait = PORTRAIT_TIPOS.has(video.tipoVideo) || isYoutubeShorts
  const gradient = getPlaceholderGradient(video.id)

  // Prioridade: 1) Supabase JPEG salvo, 2) YouTube mqdefault (16:9 real), 3) Drive thumbnail (via proxy)
  // Para Supabase sem thumbnail salva: elemento <video preload="metadata"> mostra o 1º frame nativamente
  // (sem canvas — evita problema de CORS com toDataURL)
  // mqdefault.jpg (320x180) é genuinamente 16:9; hqdefault.jpg (480x360) tem barras pretas e parece quadrado
  const thumbnailUrl = video.thumbnailUrl
    ?? (youtubeId ? `https://i3.ytimg.com/vi/${youtubeId}/mqdefault.jpg` : null)
    ?? (tipo === "drive" ? getDriveThumbnail(video.linkFinal) : null)

  // YouTube: esconde card se vídeo indisponível (404 ou placeholder cinza 120px)
  // Drive/outro: ao falhar, cai no gradiente (não esconde o card)
  function handleThumbError() {
    if (tipo === "youtube") {
      onHide(video.id)
    } else {
      setThumbFailed(true)
    }
  }
  function handleThumbLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (tipo === "youtube" && e.currentTarget.naturalWidth <= 120) {
      onHide(video.id)
    }
  }

  const paddingBottom = isPortrait ? "177.7%" : "56.25%"

  return (
    <div className="break-inside-avoid mb-3 group">
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl overflow-hidden transition-all duration-300 hover:border-zinc-600/60 hover:shadow-2xl hover:shadow-black/60 hover:-translate-y-0.5">

        {/* ── Player ── */}
        {playing ? (
          <div className="relative" style={{ paddingBottom, height: 0 }}>
            {tipo === "video" ? (
              <video
                src={embedUrl}
                controls
                autoPlay
                className="absolute inset-0 w-full h-full object-cover bg-black"
              />
            ) : tipo === "external" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900 p-6 text-center">
                <ExternalLink className="w-8 h-8 text-zinc-500" />
                <p className="text-sm text-zinc-400 mb-1">Vídeo externo</p>
                <a
                  href={video.linkFinal}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-xl transition-colors"
                >
                  Abrir vídeo ↗
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
          /* ── Thumbnail ── */
          <div
            className={`relative cursor-pointer overflow-hidden ${isPortrait ? "aspect-[9/16]" : "aspect-video"}`}
            onClick={() => setPlaying(true)}
          >
            {thumbnailUrl && !thumbFailed ? (
              /* Thumbnail salvo (Supabase JPEG) ou YouTube ou Drive via proxy */
              <img
                src={thumbnailUrl}
                alt={video.titulo}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={handleThumbError}
                onLoad={handleThumbLoad}
              />
            ) : tipo === "video" && !thumbFailed ? (
              /* Vídeos Supabase sem thumbnail salva: exibe 1º frame via <video preload="metadata">
                 — sem canvas, sem CORS, o browser mostra o frame pausado nativamente */
              <video
                src={embedUrl}
                preload="metadata"
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  v.currentTime = Math.min(1, (v.duration || 2) * 0.1)
                }}
                onError={() => setThumbFailed(true)}
              />
            ) : (
              /* Gradiente com ícone — thumbnail falhou ou tipo externo sem thumbnail */
              <div className={`absolute inset-0 bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-3`}>
                <Film className="w-8 h-8 text-white/20" />
                <p className="text-white/70 text-xs font-medium px-4 text-center leading-snug line-clamp-3">
                  {video.titulo}
                </p>
              </div>
            )}

            {/* Gradient overlay (bottom) */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

            {/* Produto badge — topo esquerdo */}
            {video.produto && (
              <div className="absolute top-2.5 left-2.5 z-10 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white/90 text-[10px] font-medium max-w-[110px] truncate">
                {video.produto}
              </div>
            )}

            {/* Download button — topo direito (aparece no hover) */}
            {tipo !== "youtube" && (
              <a
                href={getDownloadUrl(video.linkFinal)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Baixar vídeo"
                className="absolute top-2.5 right-2.5 z-10 p-2 rounded-xl bg-black/60 hover:bg-black/90 text-white transition-all backdrop-blur-sm border border-white/10 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            )}

            {/* Play button — centro */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:bg-white/25">
                <Play className="w-6 h-6 text-white fill-white ml-0.5" />
              </div>
            </div>
          </div>
        )}

        {/* ── Info ── */}
        <div className="px-3 pt-2.5 pb-3">
          <p className="text-sm font-medium text-zinc-200 leading-snug line-clamp-2 mb-2">
            {video.titulo}
          </p>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${badgeClass}`}>
              {TIPO_LABEL[video.tipoVideo] ?? video.tipoVideo}
            </span>
            {finDate && (
              <span className="text-[10px] text-zinc-600 ml-auto flex-shrink-0">{finDate}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function GaleriaPage() {
  const [search, setSearch] = useState("")
  const [tipo, setTipo] = useState("")
  const [produtoId, setProdutoId] = useState("")
  const [page, setPage] = useState(1)
  const [allVideos, setAllVideos] = useState<Video[]>([])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Buscar produtos para o filtro (público)
  useEffect(() => {
    fetch("/api/publico/produtos")
      .then((r) => r.json())
      .then((d) => setProdutos(d.produtos ?? []))
      .catch(() => {})
  }, [])

  const fetchVideos = useCallback(async (
    p: number,
    append = false,
    q = search,
    t = tipo,
    pid = produtoId
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: "24" })
      if (q) params.set("search", q)
      if (t) params.set("tipo", t)
      if (pid) params.set("produtoId", pid)
      const res = await fetch(`/api/publico/galeria?${params}`)
      const data: GaleriaData = await res.json()
      setTotal(data.total)
      setTotalPages(data.totalPages)
      setAllVideos((prev) => (append ? [...prev, ...data.videos] : data.videos))
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }, [search, tipo, produtoId])

  function handleSearch(v: string) {
    setSearch(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      setHiddenIds(new Set())
      fetchVideos(1, false, v, tipo, produtoId)
    }, 400)
  }

  function handleTipo(v: string) {
    setTipo(v)
    setPage(1)
    setHiddenIds(new Set())
    fetchVideos(1, false, search, v, produtoId)
  }

  function handleProduto(v: string) {
    setProdutoId(v)
    setPage(1)
    setHiddenIds(new Set())
    fetchVideos(1, false, search, tipo, v)
  }

  function clearFilters() {
    setSearch("")
    setTipo("")
    setProdutoId("")
    setPage(1)
    setHiddenIds(new Set())
    fetchVideos(1, false, "", "", "")
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
  const hasFilters = !!(search || tipo || produtoId)

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* ── Header fixo ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <a href="/sobre" className="flex items-center gap-2 flex-shrink-0">
            <img src="/logo.png" alt="NuFlow" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-lg tracking-tight text-white">NuFlow</span>
          </a>

          {/* Nav links */}
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <a href="/sobre#como-funciona" className="hover:text-white transition-colors hidden md:block">Como funciona</a>
            <a href="/sobre#seja-parceiro" className="hover:text-white transition-colors hidden md:block">Seja Parceiro</a>
            <a href="/galeria" className="text-white font-medium hidden md:block">Galeria</a>
            <a href="/cadastrar-demanda" className="hover:text-white transition-colors hidden md:block">Abrir Demanda</a>
            <a
              href="/login"
              className="bg-white text-zinc-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              Acessar Sistema
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-16 sm:py-24 px-4 text-center">
        {/* Background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(139,92,246,0.18),transparent)] pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-zinc-800/60 to-transparent" />

        <div className="relative max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Portfólio de Vídeos NuFlow
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-5">
            Veja tudo que{" "}
            <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
              fizemos até agora
            </span>
          </h1>

          {/* Subline */}
          <p className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-3">
            O café e o energético não foram à toa.
          </p>
          <p className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-10">
            Já finalizamos{" "}
            <strong className="text-2xl sm:text-3xl font-bold text-white">
              {initialLoad ? "…" : <AnimatedCounter value={total} />}
            </strong>{" "}
            vídeos{" "}
            <span className="text-zinc-500">e ainda estamos planejando entregar muito mais.</span>
          </p>
        </div>
      </section>

      {/* ── Filtros sticky ────────────────────────────────────────── */}
      <div className="sticky top-[65px] z-40 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap gap-2 items-center">
          {/* Busca */}
          <div className="relative flex-1 min-w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por título, equipamento, código…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-200 placeholder-zinc-600 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/40 transition-all"
            />
          </div>

          {/* Tipo */}
          <select
            value={tipo}
            onChange={(e) => handleTipo(e.target.value)}
            className="px-3 py-2.5 text-sm bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 outline-none focus:ring-2 focus:ring-purple-500/50 min-w-32 cursor-pointer"
          >
            <option value="">Todos os tipos</option>
            {Object.entries(TIPO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          {/* Equipamento / Produto */}
          {produtos.length > 0 && (
            <select
              value={produtoId}
              onChange={(e) => handleProduto(e.target.value)}
              className="px-3 py-2.5 text-sm bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 outline-none focus:ring-2 focus:ring-purple-500/50 min-w-40 cursor-pointer"
            >
              <option value="">Todos os equipamentos</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          )}

          {/* Limpar filtros */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2.5 text-xs text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-xl border border-zinc-700/50 hover:border-zinc-600 transition-all"
            >
              Limpar ×
            </button>
          )}

          {/* Contador de resultados */}
          {!initialLoad && (
            <span className="text-xs text-zinc-600 ml-auto flex-shrink-0 hidden sm:block">
              {total.toLocaleString("pt-BR")} {hasFilters ? "resultados" : "vídeos"}
            </span>
          )}
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-8">
        {initialLoad ? (
          <div className="flex flex-col items-center justify-center py-40 gap-4">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            <p className="text-zinc-600 text-sm">Carregando galeria…</p>
          </div>
        ) : visibleVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 text-center">
            <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
              <Play className="w-8 h-8 text-zinc-700" />
            </div>
            <p className="text-zinc-300 text-xl font-semibold mb-2">
              {hasFilters ? "Nenhum resultado" : "Sem vídeos ainda"}
            </p>
            <p className="text-zinc-600 text-sm mb-6">
              {hasFilters ? "Tente outros termos ou remova os filtros" : "Os vídeos aparecerão aqui quando finalizados"}
            </p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-5 py-2.5 text-sm text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-xl transition-colors"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Masonry CSS columns */}
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-3">
              {visibleVideos.map((v) => (
                <VideoCard key={v.id} video={v} onHide={hideCard} />
              ))}
            </div>

            {/* Carregar mais */}
            {hasMore && (
              <div className="flex justify-center mt-12 mb-6">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="flex items-center gap-2 px-7 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 hover:border-zinc-600 text-zinc-300 hover:text-white rounded-2xl text-sm font-medium transition-all disabled:opacity-50 shadow-lg shadow-black/30"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {loading
                    ? "Carregando…"
                    : `Carregar mais (${(total - allVideos.length).toLocaleString("pt-BR")} restantes)`}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900/80 py-10 text-center mt-8">
        <a href="/" className="inline-flex items-center gap-2 mb-3 opacity-40 hover:opacity-70 transition-opacity">
          <img src="/logo.png" alt="NuFlow" className="w-5 h-5 rounded" />
          <span className="text-xs font-semibold text-zinc-400">NuFlow</span>
        </a>
        <p className="text-xs text-zinc-700">
          {total.toLocaleString("pt-BR")} vídeos produzidos
        </p>
      </footer>
    </div>
  )
}
