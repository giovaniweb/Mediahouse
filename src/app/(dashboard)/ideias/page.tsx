"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Lightbulb,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Calendar,
  CheckCircle,
  ExternalLink,
  ArrowRight,
  Trash2,
  Brain,
  X,
  Instagram,
  Package,
  MessageCircle,
  Filter,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface IdeiaVideo {
  id: string
  titulo: string
  descricao: string | null
  linkReferencia: string | null
  mediaUrl: string | null
  origem: string
  plataforma: string | null
  status: string
  classificacao: string | null
  scoreIA: number | null
  analiseIA: string | null
  sugestaoTipo: string | null
  sugestaoPrioridade: string | null
  analisadoEm: string | null
  enviadoPor: string | null
  tags: string[]
  createdAt: string
  produto: { id: string; nome: string } | null
  demanda: { id: string; codigo: string; statusVisivel: string } | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  nova: { label: "Nova", color: "text-blue-400", bg: "bg-blue-500/15" },
  em_analise: { label: "Em Análise", color: "text-amber-400", bg: "bg-amber-500/15" },
  aprovada: { label: "Aprovada", color: "text-green-400", bg: "bg-green-500/15" },
  em_producao: { label: "Em Produção", color: "text-purple-400", bg: "bg-purple-500/15" },
  realizada: { label: "Realizada", color: "text-emerald-400", bg: "bg-emerald-500/15" },
  descartada: { label: "Descartada", color: "text-zinc-500", bg: "bg-zinc-500/15" },
}

const ORIGEM_ICONS: Record<string, typeof Instagram> = {
  instagram: Instagram,
  whatsapp: MessageCircle,
  tiktok: ExternalLink,
  youtube: ExternalLink,
  manual: Lightbulb,
  outro: ExternalLink,
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[10px] text-zinc-600">Sem score</span>
  const color = score >= 70 ? "text-emerald-400 bg-emerald-500/15" : score >= 40 ? "text-amber-400 bg-amber-500/15" : "text-red-400 bg-red-500/15"
  return <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", color)}>{score}</span>
}

export default function IdeiasPage() {
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [sortBy, setSortBy] = useState("createdAt")
  const [produtoFilter, setProdutoFilter] = useState("")
  const [origemFilter, setOrigemFilter] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showNewModal, setShowNewModal] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // Debounce search
  const searchTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null }
  const handleSearch = (v: string) => {
    setSearch(v)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => setSearchDebounced(v), 300)
  }

  const params = new URLSearchParams()
  if (statusFilter) params.set("status", statusFilter)
  if (searchDebounced) params.set("search", searchDebounced)
  if (sortBy) params.set("sortBy", sortBy)
  if (produtoFilter) params.set("produtoId", produtoFilter)
  if (origemFilter) params.set("origem", origemFilter)

  const { data, mutate } = useSWR(`/api/ideias?${params}`, fetcher)
  const { data: kpi } = useSWR("/api/ideias/kpi", fetcher)
  const { data: produtos } = useSWR("/api/produtos?all=true", fetcher)

  const ideias: IdeiaVideo[] = data?.ideias ?? []
  const statusCounts: Record<string, number> = data?.statusCounts ?? {}

  async function handleBulkAction(action: string) {
    if (selected.size === 0) return
    await fetch("/api/ideias/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), action }),
    })
    setSelected(new Set())
    mutate()
  }

  async function handleAnalyzeBatch() {
    setAnalyzing(true)
    await fetch("/api/ideias/analisar-batch", { method: "POST" })
    setAnalyzing(false)
    mutate()
  }

  async function handleAnalyzeOne(id: string) {
    await fetch(`/api/ideias/${id}/analisar`, { method: "POST" })
    mutate()
  }

  async function handleConvert(id: string) {
    const res = await fetch(`/api/ideias/${id}/converter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const data = await res.json()
    if (data.codigo) {
      mutate()
      setDetailId(null)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/ideias/${id}`, { method: "DELETE" })
    mutate()
    if (detailId === id) setDetailId(null)
  }

  async function handleUpdateStatus(id: string, status: string) {
    await fetch(`/api/ideias/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    mutate()
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const detailIdeia = ideias.find((i) => i.id === detailId)

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Lightbulb className="w-7 h-7 text-yellow-400" />
            Banco de Ideias
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Capture, analise e transforme ideias em demandas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAnalyzeBatch}
            disabled={analyzing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-600 text-sm transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {analyzing ? "Analisando..." : "Analisar Novas"}
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Ideia
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpi && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard icon={Lightbulb} iconColor="text-yellow-400" label="Total Ideias" value={kpi.totalIdeias} sub={`${kpi.novas} novas`} />
          <KPICard icon={CheckCircle} iconColor="text-green-400" label="Aprovadas" value={kpi.aprovadas + kpi.emProducao + kpi.realizadas} sub={`${kpi.realizadas} realizadas`} />
          <KPICard icon={TrendingUp} iconColor="text-purple-400" label="Taxa Conversão" value={`${kpi.taxaConversao}%`} sub={kpi.mediaScoreIA ? `Score médio: ${kpi.mediaScoreIA}` : "Sem análises"} />
          <KPICard icon={Calendar} iconColor="text-blue-400" label="Este Mês" value={kpi.ideiasEsteMes} sub={`${kpi.porOrigem?.find((o: { origem: string }) => o.origem === "whatsapp")?.count || 0} via WhatsApp`} />
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar ideias..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-purple-500/30"
            />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 outline-none"
            >
              <option value="createdAt">Mais recentes</option>
              <option value="scoreIA">Score IA</option>
              <option value="produto">Produto</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors",
              showFilters ? "bg-purple-500/10 border-purple-500/30 text-purple-400" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-300"
            )}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
        </div>

        {/* Extended filters */}
        {showFilters && (
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={produtoFilter}
              onChange={(e) => setProdutoFilter(e.target.value)}
              className="pl-3 pr-8 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 outline-none"
            >
              <option value="">Todos produtos</option>
              {produtos?.produtos?.map((p: { id: string; nome: string }) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
            <select
              value={origemFilter}
              onChange={(e) => setOrigemFilter(e.target.value)}
              className="pl-3 pr-8 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 outline-none"
            >
              <option value="">Todas origens</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        )}

        {/* Status chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter("")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              !statusFilter ? "bg-white text-zinc-900" : "bg-zinc-800 text-zinc-400 hover:text-white"
            )}
          >
            Todas {data?.total ? `(${data.total})` : ""}
          </button>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? "" : key)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                statusFilter === key ? `${cfg.bg} ${cfg.color}` : "bg-zinc-800 text-zinc-400 hover:text-white"
              )}
            >
              {cfg.label} {statusCounts[key] ? `(${statusCounts[key]})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/30 rounded-lg px-4 py-2.5">
          <span className="text-sm text-purple-300 font-medium">{selected.size} selecionadas</span>
          <div className="flex-1" />
          <button onClick={() => handleBulkAction("aprovar")} className="text-xs px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700">Aprovar</button>
          <button onClick={() => handleBulkAction("em_analise")} className="text-xs px-3 py-1 rounded bg-amber-600 text-white hover:bg-amber-700">Em Análise</button>
          <button onClick={() => handleBulkAction("descartar")} className="text-xs px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700">Descartar</button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-400 hover:text-white ml-2">Limpar</button>
        </div>
      )}

      {/* Ideas Grid */}
      {ideias.length === 0 ? (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center">
          <Lightbulb className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-zinc-400 mb-2">Nenhuma ideia encontrada</h3>
          <p className="text-sm text-zinc-600 mb-4">Comece adicionando ideias manualmente ou via WhatsApp</p>
          <button onClick={() => setShowNewModal(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
            <Plus className="w-4 h-4 inline mr-1" /> Nova Ideia
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ideias.map((ideia) => {
            const OrigemIcon = ORIGEM_ICONS[ideia.origem] || ExternalLink
            const statusCfg = STATUS_CONFIG[ideia.status] || STATUS_CONFIG.nova

            return (
              <div
                key={ideia.id}
                className={cn(
                  "bg-zinc-900/50 border rounded-xl p-4 transition-all hover:border-zinc-600 cursor-pointer group",
                  selected.has(ideia.id) ? "border-purple-500/50 bg-purple-500/5" : "border-zinc-800"
                )}
                onClick={() => setDetailId(ideia.id)}
              >
                {/* Top row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selected.has(ideia.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(ideia.id) }}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 accent-purple-500"
                    />
                    <h3 className="text-sm font-medium text-zinc-200 truncate">{ideia.titulo}</h3>
                  </div>
                  <ScoreBadge score={ideia.scoreIA} />
                </div>

                {/* Description */}
                {ideia.descricao && (
                  <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{ideia.descricao}</p>
                )}

                {/* Link preview */}
                {ideia.linkReferencia && (
                  <a
                    href={ideia.linkReferencia}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mb-3 truncate"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="truncate">{ideia.linkReferencia}</span>
                  </a>
                )}

                {/* Badges */}
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", statusCfg.bg, statusCfg.color)}>
                    {statusCfg.label}
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
                    <OrigemIcon className="w-2.5 h-2.5" />
                    {ideia.origem}
                  </span>
                  {ideia.classificacao && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400 uppercase">
                      {ideia.classificacao}
                    </span>
                  )}
                  {ideia.produto && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
                      <Package className="w-2.5 h-2.5" />
                      {ideia.produto.nome}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-600">
                    {new Date(ideia.createdAt).toLocaleDateString("pt-BR")}
                    {ideia.enviadoPor && ` · ${ideia.enviadoPor}`}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {ideia.status !== "realizada" && ideia.status !== "em_producao" && !ideia.demanda && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAnalyzeOne(ideia.id) }}
                          className="p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10"
                          title="Analisar com IA"
                        >
                          <Brain className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleConvert(ideia.id) }}
                          className="p-1 rounded text-zinc-500 hover:text-purple-400 hover:bg-purple-500/10"
                          title="Converter em Demanda"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(ideia.id) }}
                      className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                      title="Descartar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Linked demand */}
                {ideia.demanda && (
                  <div className="mt-2 pt-2 border-t border-zinc-800">
                    <a
                      href={`/demandas/${ideia.demanda.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300"
                    >
                      <ArrowRight className="w-3 h-3" />
                      {ideia.demanda.codigo}
                      <span className="text-zinc-600">({ideia.demanda.statusVisivel})</span>
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Detail Slide-over */}
      {detailIdeia && (
        <DetailModal
          ideia={detailIdeia}
          onClose={() => setDetailId(null)}
          onAnalyze={() => handleAnalyzeOne(detailIdeia.id)}
          onConvert={() => handleConvert(detailIdeia.id)}
          onDelete={() => handleDelete(detailIdeia.id)}
          onUpdateStatus={(s) => handleUpdateStatus(detailIdeia.id, s)}
          produtos={produtos?.produtos || []}
          onUpdate={async (data) => {
            await fetch(`/api/ideias/${detailIdeia.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            })
            mutate()
          }}
        />
      )}

      {/* New Idea Modal */}
      {showNewModal && (
        <NewIdeaModal
          onClose={() => setShowNewModal(false)}
          produtos={produtos?.produtos || []}
          onCreated={() => { setShowNewModal(false); mutate() }}
        />
      )}
    </div>
  )
}

function KPICard({ icon: Icon, iconColor, label, value, sub }: {
  icon: typeof Lightbulb; iconColor: string; label: string; value: string | number; sub: string
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4", iconColor)} />
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>
    </div>
  )
}

function DetailModal({ ideia, onClose, onAnalyze, onConvert, onDelete, onUpdateStatus, produtos, onUpdate }: {
  ideia: IdeiaVideo
  onClose: () => void
  onAnalyze: () => void
  onConvert: () => void
  onDelete: () => void
  onUpdateStatus: (s: string) => void
  produtos: { id: string; nome: string }[]
  onUpdate: (data: Record<string, unknown>) => void
}) {
  const statusCfg = STATUS_CONFIG[ideia.status] || STATUS_CONFIG.nova
  const canConvert = !ideia.demanda && ideia.status !== "realizada" && ideia.status !== "descartada"

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg bg-zinc-900 border-l border-zinc-800 h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-white">{ideia.titulo}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusCfg.bg, statusCfg.color)}>
                  {statusCfg.label}
                </span>
                <ScoreBadge score={ideia.scoreIA} />
              </div>
            </div>
            <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Description */}
          {ideia.descricao && (
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Descrição</label>
              <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap">{ideia.descricao}</p>
            </div>
          )}

          {/* Link */}
          {ideia.linkReferencia && (
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Referência</label>
              <a href={ideia.linkReferencia} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 mt-1"
              >
                <ExternalLink className="w-4 h-4" />
                {ideia.linkReferencia}
              </a>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Origem</label>
              <p className="text-sm text-zinc-300 mt-1 capitalize">{ideia.origem}</p>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Plataforma</label>
              <p className="text-sm text-zinc-300 mt-1 capitalize">{ideia.plataforma || "—"}</p>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Enviado por</label>
              <p className="text-sm text-zinc-300 mt-1">{ideia.enviadoPor || "—"}</p>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Data</label>
              <p className="text-sm text-zinc-300 mt-1">{new Date(ideia.createdAt).toLocaleDateString("pt-BR")}</p>
            </div>
          </div>

          {/* Product assignment */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Produto</label>
            <select
              value={ideia.produto?.id || ""}
              onChange={(e) => onUpdate({ produtoId: e.target.value || null })}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none"
            >
              <option value="">Sem produto</option>
              {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>

          {/* Classification */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Classificação</label>
            <div className="flex gap-2 mt-1">
              {["b2c", "b2b"].map((c) => (
                <button
                  key={c}
                  onClick={() => onUpdate({ classificacao: ideia.classificacao === c ? null : c })}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
                    ideia.classificacao === c
                      ? "bg-purple-500/15 border-purple-500/30 text-purple-400"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
                  )}
                >
                  {c.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* AI Analysis */}
          {ideia.analiseIA && (
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-medium text-purple-400">Análise IA</span>
                <span className="text-[10px] text-zinc-600 ml-auto">
                  Score: <span className="font-bold text-white">{ideia.scoreIA}</span>/100
                </span>
              </div>
              <p className="text-sm text-zinc-300">{ideia.analiseIA}</p>
              {ideia.sugestaoTipo && (
                <p className="text-xs text-zinc-500 mt-2">Tipo sugerido: <span className="text-zinc-300">{ideia.sugestaoTipo}</span></p>
              )}
              {ideia.sugestaoPrioridade && (
                <p className="text-xs text-zinc-500">Prioridade: <span className="text-zinc-300 capitalize">{ideia.sugestaoPrioridade}</span></p>
              )}
            </div>
          )}

          {/* Linked demand */}
          {ideia.demanda && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
              <p className="text-xs text-green-400 font-medium mb-1">Convertida em Demanda</p>
              <a href={`/demandas/${ideia.demanda.id}`} className="text-sm text-white hover:text-purple-400">
                {ideia.demanda.codigo} — {ideia.demanda.statusVisivel}
              </a>
            </div>
          )}

          {/* Status change */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 block">Alterar Status</label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(STATUS_CONFIG).filter(([k]) => k !== ideia.status && k !== "descartada").map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => onUpdateStatus(key)}
                  className={cn("px-3 py-1 rounded-lg text-xs border transition-colors", cfg.bg, cfg.color, "border-transparent hover:border-current")}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-zinc-800">
            {!ideia.analiseIA && (
              <button onClick={onAnalyze} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 text-white text-sm hover:bg-amber-700">
                <Brain className="w-4 h-4" /> Analisar com IA
              </button>
            )}
            {canConvert && (
              <button onClick={onConvert} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700">
                <ArrowRight className="w-4 h-4" /> Converter em Demanda
              </button>
            )}
            <button onClick={onDelete} className="px-4 py-2.5 rounded-lg bg-red-600/10 text-red-400 text-sm hover:bg-red-600/20 border border-red-500/20">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NewIdeaModal({ onClose, produtos, onCreated }: {
  onClose: () => void
  produtos: { id: string; nome: string }[]
  onCreated: () => void
}) {
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [link, setLink] = useState("")
  const [produtoId, setProdutoId] = useState("")
  const [classificacao, setClassificacao] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!titulo.trim() || saving) return
    setSaving(true)
    await fetch("/api/ideias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo,
        descricao: descricao || null,
        linkReferencia: link || null,
        produtoId: produtoId || null,
        classificacao: classificacao || null,
      }),
    })
    setSaving(false)
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-400" /> Nova Ideia
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Título *</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Vídeo de unboxing inspirado no reels da Apple"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500/30 placeholder:text-zinc-600"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Descrição</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              placeholder="Contexto da ideia, por que é relevante..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500/30 placeholder:text-zinc-600 resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Link de referência</label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://instagram.com/reel/..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500/30 placeholder:text-zinc-600"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Produto</label>
              <select
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none"
              >
                <option value="">Nenhum</option>
                {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Classificação</label>
              <select
                value={classificacao}
                onChange={(e) => setClassificacao(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none"
              >
                <option value="">Nenhuma</option>
                <option value="b2c">B2C</option>
                <option value="b2b">B2B</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={!titulo.trim() || saving}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Criar Ideia"}
          </button>
        </div>
      </div>
    </div>
  )
}
