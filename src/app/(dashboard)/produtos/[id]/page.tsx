"use client"

import { useState, useEffect, use } from "react"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import {
  Package, ArrowLeft, AlertTriangle, TrendingUp, Calendar, Link2, Unlink,
  Search, Sparkles, Loader2, Save, Film, DollarSign, BarChart3, Camera, Users,
  Activity, CheckCircle, Lightbulb, ExternalLink, ArrowRight, Brain,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json() })
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const statusColors: Record<string, string> = {
  entrada: "bg-blue-500/15 text-blue-300 border-blue-700",
  producao: "bg-yellow-500/15 text-yellow-300 border-yellow-700",
  edicao: "bg-purple-500/15 text-purple-300 border-purple-700",
  aprovacao: "bg-orange-500/15 text-orange-300 border-orange-700",
  para_postar: "bg-cyan-500/15 text-cyan-300 border-cyan-700",
  finalizado: "bg-emerald-500/15 text-emerald-300 border-emerald-700",
}
const statusLabel: Record<string, string> = {
  entrada: "Entrada", producao: "Produção", edicao: "Edição",
  aprovacao: "Aprovação", para_postar: "P/ Postar", finalizado: "Finalizado",
}

interface KPI {
  totalVideos: number
  b2cCount: number
  b2bCount: number
  totalCusto: number
  custoMedio: number
  demandasAtivas: number
  demandasConcluidas: number
  tempoMedioConclusao: number
  statusBreakdown: Record<string, number>
  videomakerStats: { id: string; nome: string; count: number; totalCusto: number }[]
  monthlyTimeline: { month: string; count: number }[]
  ideiasTotal: number
  ideiasPendentes: number
  ideiasRealizadas: number
  ideiasRecentes: { id: string; titulo: string; status: string; scoreIA: number | null; origem: string; createdAt: string; linkReferencia: string | null }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProdutoDetail = any

export default function ProdutoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, mutate } = useSWR(`/api/produtos/${id}`, fetcher)
  const produto: ProdutoDetail | null = data?.produto ?? null
  const kpi: KPI | null = produto?.kpi ?? null

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nome: "", descricao: "", categoria: "", peso: 5, alertaDias: 30 })
  const [searchQuery, setSearchQuery] = useState("")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState("")
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    if (produto) setForm({ nome: produto.nome, descricao: produto.descricao ?? "", categoria: produto.categoria ?? "", peso: produto.peso, alertaDias: produto.alertaDias })
  }, [produto])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/produtos/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Produto atualizado!")
      setEditing(false)
      mutate()
    } catch (err) { toast.error(String(err)) }
    finally { setSaving(false) }
  }

  async function searchDemandas() {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/demandas?search=${encodeURIComponent(searchQuery.trim())}&limit=10`)
      const data = await res.json()
      setSearchResults(Array.isArray(data.demandas ?? data) ? (data.demandas ?? data) : [])
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }

  async function linkDemanda(demandaId: string) {
    try {
      const res = await fetch(`/api/produtos/${id}/demandas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demandaId }) })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Demanda vinculada!")
      setSearchQuery(""); setSearchResults([]); mutate()
    } catch (err) { toast.error(String(err)) }
  }

  async function unlinkDemanda(demandaId: string) {
    try {
      const res = await fetch(`/api/produtos/${id}/demandas?demandaId=${demandaId}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Desvinculada!"); mutate()
    } catch (err) { toast.error(String(err)) }
  }

  async function fetchAiSuggestion() {
    setAiLoading(true); setAiSuggestion("")
    try {
      const res = await fetch("/api/produtos/sugestoes")
      const data = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = data.sugestoes?.find((s: any) => s.id === id)
      setAiSuggestion(match?.sugestao || "Nenhuma sugestão disponível.")
    } catch { setAiSuggestion("Erro ao gerar sugestão.") }
    finally { setAiLoading(false) }
  }

  if (!produto) {
    return (<><Header title="Produto" /><main className="flex-1 p-6 flex items-center justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></main></>)
  }

  const linkedIds = new Set(produto.demandas.map((d: { demanda: { id: string } }) => d.demanda.id))
  const inp = "w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500"

  return (
    <>
      <Header
        title={produto.nome}
        actions={
          <div className="flex items-center gap-3">
            {produto.emAlerta && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-3 py-1">
                <AlertTriangle className="w-3 h-3" /> Em Alerta
              </span>
            )}
            <span className={cn(
              "text-xs font-medium px-3 py-1 rounded-full border",
              produto.ativo ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-zinc-800 text-zinc-500 border-zinc-700"
            )}>{produto.ativo ? "Ativo" : "Inativo"}</span>
            <Link href="/produtos" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Link>
          </div>
        }
      />
      <main className="flex-1 p-6 space-y-6">

        {/* ── KPI Cards ── */}
        {kpi && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-500/5 to-blue-600/10 border border-zinc-800 border-l-[3px] border-l-blue-500 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Total Videos</span>
                <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400"><Film className="w-4 h-4" /></div>
              </div>
              <p className="text-3xl font-bold text-white mt-1">{kpi.totalVideos}</p>
              <p className="text-[11px] text-zinc-600 mt-1">{kpi.b2cCount} B2C · {kpi.b2bCount} B2B</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500/5 to-emerald-600/10 border border-zinc-800 border-l-[3px] border-l-emerald-500 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Custo Total</span>
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400"><DollarSign className="w-4 h-4" /></div>
              </div>
              <p className="text-3xl font-bold text-emerald-300 mt-1">{fmt(kpi.totalCusto)}</p>
              <p className="text-[11px] text-zinc-600 mt-1">{kpi.videomakerStats.length} videomakers</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500/5 to-purple-600/10 border border-zinc-800 border-l-[3px] border-l-purple-500 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Custo/Video</span>
                <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400"><BarChart3 className="w-4 h-4" /></div>
              </div>
              <p className="text-3xl font-bold text-purple-300 mt-1">{fmt(kpi.custoMedio)}</p>
              <p className="text-[11px] text-zinc-600 mt-1">media por video</p>
            </div>
            <div className={cn(
              "bg-gradient-to-br border border-zinc-800 border-l-[3px] rounded-xl p-4",
              produto.emAlerta ? "from-red-500/5 to-red-600/10 border-l-red-500" : "from-amber-500/5 to-amber-600/10 border-l-amber-500"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Dias s/ Conteudo</span>
                <div className={cn("p-2 rounded-xl", produto.emAlerta ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400")}>
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <p className={cn("text-3xl font-bold mt-1", produto.emAlerta ? "text-red-300" : "text-amber-300")}>{produto.diasSemConteudo}</p>
              <p className="text-[11px] text-zinc-600 mt-1">limite: {produto.alertaDias} dias</p>
            </div>
          </div>
        )}

        {/* ── KPI Cards Row 2: Ativas, Concluídas, Tempo Médio, Ideias ── */}
        {kpi && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Ativas</span>
              </div>
              <p className="text-2xl font-bold text-white">{kpi.demandasAtivas}</p>
              <p className="text-[10px] text-zinc-600">demandas em andamento</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Concluídas</span>
              </div>
              <p className="text-2xl font-bold text-white">{kpi.demandasConcluidas}</p>
              <p className="text-[10px] text-zinc-600">{kpi.tempoMedioConclusao > 0 ? `~${kpi.tempoMedioConclusao}d p/ concluir` : "—"}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-yellow-400" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Ideias</span>
              </div>
              <p className="text-2xl font-bold text-white">{kpi.ideiasTotal}</p>
              <p className="text-[10px] text-zinc-600">{kpi.ideiasPendentes} pendentes · {kpi.ideiasRealizadas} realizadas</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">B2C / B2B</span>
              </div>
              <p className="text-2xl font-bold text-white">{kpi.b2cCount} / {kpi.b2bCount}</p>
              <p className="text-[10px] text-zinc-600">{kpi.totalVideos > 0 ? `${Math.round((kpi.b2cCount / kpi.totalVideos) * 100)}% B2C` : "—"}</p>
            </div>
          </div>
        )}

        {/* ── B2C/B2B Split + Status Breakdown ── */}
        {kpi && kpi.totalVideos > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* B2C/B2B */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-200 mb-3">Classificacao B2C / B2B</h3>
              <div className="h-4 bg-zinc-800 rounded-full overflow-hidden flex">
                {kpi.b2cCount > 0 && (
                  <div className="h-full bg-cyan-500 transition-all" style={{ width: `${(kpi.b2cCount / kpi.totalVideos) * 100}%` }} />
                )}
                {kpi.b2bCount > 0 && (
                  <div className="h-full bg-orange-500 transition-all" style={{ width: `${(kpi.b2bCount / kpi.totalVideos) * 100}%` }} />
                )}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-xs text-cyan-400 font-medium">B2C: {kpi.b2cCount} ({kpi.totalVideos ? Math.round((kpi.b2cCount / kpi.totalVideos) * 100) : 0}%)</span>
                <span className="text-xs text-orange-400 font-medium">B2B: {kpi.b2bCount} ({kpi.totalVideos ? Math.round((kpi.b2bCount / kpi.totalVideos) * 100) : 0}%)</span>
              </div>
            </div>
            {/* Status Breakdown */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-200 mb-3">Status das Demandas</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(kpi.statusBreakdown).map(([status, count]) => (
                  <span key={status} className={cn("text-xs font-medium px-3 py-1.5 rounded-full border", statusColors[status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700")}>
                    {statusLabel[status] ?? status}: {count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Videomaker Stats ── */}
        {kpi && kpi.videomakerStats.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Camera className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-zinc-200">Videomakers neste Produto</h3>
            </div>
            <div className="space-y-3">
              {kpi.videomakerStats.map((vm) => {
                const pct = kpi.totalVideos ? (vm.count / kpi.totalVideos) * 100 : 0
                return (
                  <Link key={vm.id} href={`/videomakers/${vm.id}`} className="block group">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-zinc-300 font-medium group-hover:text-white transition-colors">{vm.nome}</span>
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span>{vm.count} videos</span>
                        <span className="font-semibold text-zinc-300">{fmt(vm.totalCusto)}</span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Monthly Timeline Chart ── */}
        {kpi && kpi.monthlyTimeline.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4">Producao Mensal</h3>
            <div className="flex items-end gap-2 h-24">
              {kpi.monthlyTimeline.map((m) => {
                const max = Math.max(...kpi.monthlyTimeline.map((x) => x.count), 1)
                const h = Math.max((m.count / max) * 100, 5)
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-zinc-500">{m.count}</span>
                    <div className="w-full bg-purple-500/80 rounded-t transition-all hover:bg-purple-400" style={{ height: `${h}%` }} />
                    <span className="text-[9px] text-zinc-600">{m.month.slice(5)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Ideias deste Produto ── */}
        {kpi && kpi.ideiasRecentes && kpi.ideiasRecentes.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Ideias deste Produto</h3>
                <span className="text-xs text-zinc-500">{kpi.ideiasTotal} total</span>
              </div>
              <Link href="/ideias" className="text-xs text-purple-400 hover:text-purple-300">Ver todas →</Link>
            </div>
            <div className="space-y-2">
              {kpi.ideiasRecentes.map((ideia) => {
                const scoreColor = ideia.scoreIA && ideia.scoreIA >= 70 ? "text-emerald-400 bg-emerald-500/15" : ideia.scoreIA && ideia.scoreIA >= 40 ? "text-amber-400 bg-amber-500/15" : "text-zinc-500 bg-zinc-800"
                return (
                  <div key={ideia.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-zinc-800/50 transition-colors">
                    <Brain className="w-4 h-4 text-purple-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 truncate">{ideia.titulo}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-600 capitalize">{ideia.origem}</span>
                        <span className="text-[10px] text-zinc-600">{new Date(ideia.createdAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                    {ideia.scoreIA !== null && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor}`}>{ideia.scoreIA}</span>
                    )}
                    {ideia.linkReferencia && (
                      <a href={ideia.linkReferencia} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-blue-400">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <Link href="/ideias" className="text-zinc-500 hover:text-purple-400">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Product Info Card ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-400" />
              <h2 className="font-semibold text-zinc-100">Informacoes do Produto</h2>
            </div>
            {!editing ? (
              <button onClick={() => setEditing(true)} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">Editar</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-300">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50">
                  <Save className="w-3 h-3" /> {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="block text-xs text-zinc-400 mb-1">Nome</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inp} /></div>
                <div className="col-span-2"><label className="block text-xs text-zinc-400 mb-1">Descricao</label><textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={3} className={cn(inp, "resize-none")} /></div>
                <div><label className="block text-xs text-zinc-400 mb-1">Categoria</label><input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className={inp} /></div>
                <div><label className="block text-xs text-zinc-400 mb-1">Alerta apos (dias)</label><input type="number" min={1} value={form.alertaDias} onChange={(e) => setForm({ ...form, alertaDias: parseInt(e.target.value) || 30 })} className={inp} /></div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Peso: {form.peso}</label>
                <input type="range" min={1} max={10} step={1} value={form.peso} onChange={(e) => setForm({ ...form, peso: parseInt(e.target.value) })} className="w-full accent-purple-500" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div><p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">Fabricante</p><p className="text-sm text-zinc-200">{produto.fabricante?.nome || produto.categoria || "—"}</p></div>
                <div><p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">Peso</p><div className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-purple-400" /><span className="text-sm font-bold text-zinc-200">{produto.peso}</span></div></div>
                <div><p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">Alerta apos</p><p className="text-sm text-zinc-200">{produto.alertaDias} dias</p></div>
                <div><p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">Score</p><p className="text-sm font-bold text-purple-400">{produto.score?.toFixed(1)}</p></div>
              </div>
              {produto.descricao && (
                <div><p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">Descricao</p><p className="text-sm text-zinc-300 leading-relaxed">{produto.descricao}</p></div>
              )}
              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                  <span>{produto.diasSemConteudo} dias sem conteudo / {produto.alertaDias} dias limite</span>
                  <span className={cn("font-medium", produto.emAlerta ? "text-red-400" : "text-zinc-400")}>
                    {Math.min(Math.round((produto.diasSemConteudo / Math.max(produto.alertaDias, 1)) * 100), 999)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", produto.emAlerta ? "bg-red-500" : produto.diasSemConteudo / Math.max(produto.alertaDias, 1) > 0.7 ? "bg-yellow-500" : "bg-emerald-500")}
                    style={{ width: `${Math.min((produto.diasSemConteudo / Math.max(produto.alertaDias, 1)) * 100, 100)}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── AI Suggestion ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-400" /><h2 className="font-semibold text-zinc-100">Sugestao IA</h2></div>
            <button onClick={fetchAiSuggestion} disabled={aiLoading} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-700 text-purple-300 hover:bg-purple-600/30 transition-colors disabled:opacity-50">
              {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Gerar
            </button>
          </div>
          <p className={cn("text-sm leading-relaxed", aiSuggestion ? "text-zinc-300" : "text-zinc-500")}>{aiSuggestion || "Clique em 'Gerar' para uma sugestao de conteudo."}</p>
        </div>

        {/* ── Linked Demands ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="w-5 h-5 text-purple-400" />
            <h2 className="font-semibold text-zinc-100">Demandas Vinculadas</h2>
            <span className="text-xs text-zinc-500 ml-auto">{produto.demandas.length} vinculadas</span>
          </div>

          {/* Search */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input placeholder="Buscar demanda..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchDemandas()} className={cn(inp, "pl-9")} />
            </div>
            <button onClick={searchDemandas} disabled={searching} className="px-4 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mb-4 space-y-1 bg-zinc-800/50 border border-zinc-700 rounded-lg p-2">
              {searchResults.map((d: { id: string; codigo: string; titulo: string; statusVisivel: string }) => (
                <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-purple-400 shrink-0">{d.codigo}</span>
                    <span className="text-sm text-zinc-300 truncate">{d.titulo}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border shrink-0", statusColors[d.statusVisivel] ?? "bg-zinc-700 text-zinc-400 border-zinc-600")}>{d.statusVisivel}</span>
                  </div>
                  {linkedIds.has(d.id) ? (
                    <span className="text-[10px] text-zinc-500 ml-2 shrink-0">Vinculada</span>
                  ) : (
                    <button onClick={() => linkDemanda(d.id)} className="text-xs text-purple-400 hover:text-purple-300 ml-2 shrink-0">Vincular</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Cards de demandas */}
          {produto.demandas.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {produto.demandas.map((dp: { id: string; createdAt: string; demanda: { id: string; codigo: string; titulo: string; statusVisivel: string; classificacao?: string; videomaker?: { id: string; nome: string } } }) => (
                <div key={dp.id} className="bg-zinc-800/40 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all group">
                  <div className="flex items-start justify-between mb-2">
                    <Link href={`/demandas/${dp.demanda.id}`} className="text-sm font-medium text-zinc-200 hover:text-white transition-colors flex-1 min-w-0">
                      <span className="text-xs font-mono text-purple-400 mr-2">{dp.demanda.codigo}</span>
                      {dp.demanda.titulo}
                    </Link>
                    <button onClick={() => unlinkDemanda(dp.demanda.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all ml-2 shrink-0" title="Desvincular">
                      <Unlink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", statusColors[dp.demanda.statusVisivel] ?? "bg-zinc-700 text-zinc-400 border-zinc-600")}>
                      {statusLabel[dp.demanda.statusVisivel] ?? dp.demanda.statusVisivel}
                    </span>
                    {dp.demanda.classificacao && (
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", dp.demanda.classificacao === "b2c" ? "bg-cyan-500/15 text-cyan-400 border-cyan-700" : "bg-orange-500/15 text-orange-400 border-orange-700")}>
                        {dp.demanda.classificacao.toUpperCase()}
                      </span>
                    )}
                    {dp.demanda.videomaker && (
                      <Link href={`/videomakers/${dp.demanda.videomaker.id}`} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
                        <Users className="w-3 h-3" /> {dp.demanda.videomaker.nome}
                      </Link>
                    )}
                    <span className="text-[10px] text-zinc-600 ml-auto">{new Date(dp.createdAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 text-center py-6">Nenhuma demanda vinculada.</p>
          )}
        </div>
      </main>
    </>
  )
}
