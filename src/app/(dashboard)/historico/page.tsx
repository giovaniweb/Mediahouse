"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Header } from "@/components/layout/Header"
import {
  Search, Archive, ExternalLink, ChevronLeft, ChevronRight,
  Filter, X, CheckCircle2,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Demanda {
  id: string
  codigo: string
  titulo: string
  tipoVideo: string
  departamento: string
  finalizadaEm: string | null
  updatedAt: string
  videomaker?: { nome: string } | null
  editor?: { nome: string } | null
  produtos?: { produto: { nome: string } }[]
}

const TIPOS_VIDEO = [
  "reels", "youtube", "video_institucional", "institucional", "treinamento",
  "apresentacao_equipamento", "depoimento", "ads", "vsl", "tutorial",
  "cobertura_evento", "outro",
]

const TIPO_LABEL: Record<string, string> = {
  reels: "Reels", youtube: "YouTube", video_institucional: "Institucional",
  institucional: "Institucional", treinamento: "Treinamento",
  apresentacao_equipamento: "Apresentação Produto", depoimento: "Depoimento",
  ads: "Ads", vsl: "VSL", tutorial: "Tutorial",
  cobertura_evento: "Cobertura Evento", outro: "Outro",
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

const PAGE_SIZE = 50

export default function HistoricoPage() {
  const [search, setSearch] = useState("")
  const [tipoVideo, setTipoVideo] = useState("")
  const [deDate, setDeDate] = useState("")
  const [ateDate, setAteDate] = useState("")
  const [page, setPage] = useState(1)
  const [showFiltros, setShowFiltros] = useState(false)

  const params = new URLSearchParams()
  params.set("statusVisivel", "finalizado")
  params.set("limit", String(PAGE_SIZE))
  params.set("offset", String((page - 1) * PAGE_SIZE))
  if (search) params.set("search", search)
  if (tipoVideo) params.set("tipoVideo", tipoVideo)
  if (deDate) params.set("de", deDate)
  if (ateDate) params.set("ate", ateDate)

  const url = `/api/demandas?${params}`
  const { data, isLoading } = useSWR(url, fetcher, { keepPreviousData: true })
  const demandas: Demanda[] = data?.demandas ?? []
  const total: number = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const temFiltros = !!(tipoVideo || deDate || ateDate)

  const limparFiltros = useCallback(() => {
    setTipoVideo("")
    setDeDate("")
    setAteDate("")
    setPage(1)
  }, [])

  function handleSearch(v: string) {
    setSearch(v)
    setPage(1)
  }

  return (
    <>
      <Header title="Histórico de Demandas" />

      <main className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Archive className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Histórico Completo</h1>
              <p className="text-sm text-zinc-400">
                {isLoading ? "Carregando…" : `${total.toLocaleString("pt-BR")} demandas concluídas`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/galeria"
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Ver Galeria Pública
            </Link>
          </div>
        </div>

        {/* Barra de busca + filtros */}
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar por título ou código…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={() => setShowFiltros((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${
                temFiltros || showFiltros
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filtros {temFiltros && <span className="bg-purple-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">!</span>}
            </button>
            {temFiltros && (
              <button onClick={limparFiltros} className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                <X className="w-4 h-4" /> Limpar
              </button>
            )}
          </div>

          {showFiltros && (
            <div className="flex gap-3 flex-wrap p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Tipo de vídeo</label>
                <select
                  value={tipoVideo}
                  onChange={(e) => { setTipoVideo(e.target.value); setPage(1) }}
                  className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 outline-none"
                >
                  <option value="">Todos</option>
                  {TIPOS_VIDEO.map((t) => (
                    <option key={t} value={t}>{TIPO_LABEL[t] ?? t}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Finalizado de</label>
                <input
                  type="date"
                  value={deDate}
                  onChange={(e) => { setDeDate(e.target.value); setPage(1) }}
                  className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Até</label>
                <input
                  type="date"
                  value={ateDate}
                  onChange={(e) => { setAteDate(e.target.value); setPage(1) }}
                  className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Tabela */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3">Código</th>
                <th className="text-left px-4 py-3">Título</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Tipo</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Videomaker</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Editor</th>
                <th className="text-left px-4 py-3">Concluído em</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-zinc-500">Carregando…</td>
                </tr>
              )}
              {!isLoading && demandas.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <CheckCircle2 className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <p className="text-zinc-400">Nenhuma demanda encontrada</p>
                    {temFiltros && (
                      <button onClick={limparFiltros} className="mt-2 text-sm text-purple-400 hover:underline">
                        Limpar filtros
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {demandas.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link href={`/demandas/${d.id}`} className="font-mono text-xs text-zinc-400 hover:text-purple-400 transition-colors">
                      {d.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/demandas/${d.id}`} className="text-zinc-200 hover:text-white font-medium transition-colors line-clamp-1">
                      {d.titulo}
                    </Link>
                    {d.produtos?.[0]?.produto?.nome && (
                      <span className="text-xs text-zinc-500">{d.produtos[0].produto.nome}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700">
                      {TIPO_LABEL[d.tipoVideo] ?? d.tipoVideo}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-zinc-400 text-xs">
                    {d.videomaker?.nome ?? <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-zinc-400 text-xs">
                    {d.editor?.nome ?? <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                    {fmtDate(d.finalizadaEm ?? d.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-zinc-500">
              Página {page} de {totalPages} · {total} demandas
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Próxima <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
