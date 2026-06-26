"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { Sparkles, Plus, Loader2, X, Search, SlidersHorizontal, XCircle } from "lucide-react"
import { KanbanBoard } from "@/components/kanban/KanbanBoard"
import { GROWTH_COLUNAS, GROWTH_COLUNA_PARA_STATUS, growthColunaDe, type GrowthColunaId } from "@/lib/growth-kanban"
import { TIPOS_CONTEUDO, tipoConteudoDe } from "@/lib/growth-conteudo"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
const selCls = "text-sm border border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-zinc-800 text-zinc-300"

// Growth (gestão de conteúdos). Reutiliza a Demanda (area="design" internamente),
// mas com kanban próprio de 8 colunas e SEM qualquer dependência de Eventos.
export default function GrowthKanbanPage() {
  const { data: session } = useSession()
  const [showNova, setShowNova] = useState(false)

  // Filtros — adaptados às peculiaridades do Growth (pessoas/responsável,
  // linha/projeto, tipo de conteúdo, produto) em vez de videomaker/editor.
  const [search, setSearch] = useState("")
  const [filtroResp, setFiltroResp] = useState("")
  const [filtroLinha, setFiltroLinha] = useState("")
  const [filtroTipo, setFiltroTipo] = useState("")
  const [filtroProduto, setFiltroProduto] = useState("")

  // Dados que alimentam os selects dos filtros
  const { data: rData } = useSWR<{ responsaveis: Responsavel[] }>("/api/growth/responsaveis", fetcher)
  const responsaveis = rData?.responsaveis ?? []
  const { data: lData } = useSWR<{ linhas: { id: string; nome: string }[] }>("/api/growth/linhas-projetos", fetcher)
  const linhas = lData?.linhas ?? []
  const { data: pData } = useSWR<{ produtos: { id: string; nome: string }[] }>("/api/produtos?limit=200", fetcher)
  const produtos = pData?.produtos ?? []

  const temFiltrosAtivos = !!(filtroResp || filtroLinha || filtroTipo || filtroProduto)
  function limparFiltros() {
    setFiltroResp(""); setFiltroLinha(""); setFiltroTipo(""); setFiltroProduto("")
  }

  const params = new URLSearchParams()
  params.set("area", "design")
  if (search) params.set("search", search)
  if (filtroResp) params.set("responsavelId", filtroResp)
  if (filtroLinha) params.set("linhaProjetoId", filtroLinha)
  if (filtroTipo) params.set("tipoVideo", filtroTipo)
  if (filtroProduto) params.set("produtoId", filtroProduto)

  const { data, mutate } = useSWR(`/api/demandas?${params}`, fetcher, { refreshInterval: 15000 })
  const demandasAll = data?.demandas ?? []

  // Esconde finalizados com mais de 30 dias (mantém o board enxuto)
  const TRINTA = 30 * 24 * 60 * 60 * 1000
  const agora = Date.now()
  const demandas = demandasAll.filter((d: { statusInterno: string; finalizadaEm?: string | null }) => {
    if (growthColunaDe(d.statusInterno) !== "finalizado") return true
    const ref = d.finalizadaEm ? new Date(d.finalizadaEm).getTime() : 0
    return agora - ref <= TRINTA
  })

  const handleMove = useCallback(async (demandaId: string, novaColuna: string) => {
    const statusInterno = GROWTH_COLUNA_PARA_STATUS[novaColuna as GrowthColunaId]
    if (!statusInterno) return
    mutate((prev: { demandas: Array<{ id: string; statusInterno: string }> }) => ({
      ...prev,
      demandas: prev.demandas.map((d) => d.id === demandaId ? { ...d, statusInterno } : d),
    }), false)
    const res = await fetch(`/api/demandas/${demandaId}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusInterno, origem: "kanban" }),
    })
    if (!res.ok) { mutate(); toast.error("Erro ao mover") } else mutate()
  }, [mutate])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Excluir esta demanda?")) return
    await fetch(`/api/demandas/${id}`, { method: "DELETE" }); mutate()
  }, [mutate])

  const handleDuplicate = useCallback(async (id: string) => {
    await fetch(`/api/demandas/${id}/duplicate`, { method: "POST" }); mutate()
  }, [mutate])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-400" /> Growth · Demandas</h1>
        <button onClick={() => setShowNova(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"><Plus className="w-4 h-4" /> Nova Demanda</button>
      </div>

      {/* Filtros — pessoas/responsável, linha/projeto, tipo de conteúdo e produto */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar demanda..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500 w-56"
          />
        </div>
        <select value={filtroResp} onChange={(e) => setFiltroResp(e.target.value)} className={selCls}>
          <option value="">Todos responsáveis</option>
          {responsaveis.map((r) => (<option key={r.id} value={r.id}>{r.label ?? r.nome}</option>))}
        </select>
        <select value={filtroLinha} onChange={(e) => setFiltroLinha(e.target.value)} className={selCls}>
          <option value="">Todas linhas/projetos</option>
          {linhas.map((l) => (<option key={l.id} value={l.id}>{l.nome}</option>))}
        </select>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className={selCls}>
          <option value="">Todos os tipos</option>
          {TIPOS_CONTEUDO.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
        </select>
        <select value={filtroProduto} onChange={(e) => setFiltroProduto(e.target.value)} className={selCls}>
          <option value="">Todos produtos</option>
          {produtos.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
        </select>
        {temFiltrosAtivos && (
          <button onClick={limparFiltros}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-2 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
            <XCircle className="w-3.5 h-3.5" /> Limpar filtros
          </button>
        )}
        <SlidersHorizontal className="w-4 h-4 text-zinc-600" />
        <span className="text-xs text-zinc-500 ml-auto">{demandas.length} demandas</span>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <KanbanBoard
          demandas={demandas}
          onMove={handleMove}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          userTipo={session?.user?.tipo}
          colunas={GROWTH_COLUNAS}
          getColuna={(d) => growthColunaDe(d.statusInterno)}
        />
      </div>

      {showNova && <NovoConteudoModal onClose={() => setShowNova(false)} onCreated={() => { setShowNova(false); mutate() }} />}
    </div>
  )
}

type Responsavel = { id: string; nome: string; email: string | null; tipo: string; label: string }

function NovoConteudoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: rData } = useSWR<{ responsaveis: Responsavel[] }>("/api/growth/responsaveis", fetcher)
  const responsaveis = rData?.responsaveis ?? []
  const { data: lData } = useSWR<{ linhas: { id: string; nome: string }[] }>("/api/growth/linhas-projetos", fetcher)
  const linhas = lData?.linhas ?? []
  const { data: pData } = useSWR<{ produtos: { id: string; nome: string }[] }>("/api/produtos", fetcher)
  const produtos = pData?.produtos ?? []
  // Growth não tem cidade física; usa "Remoto" (o schema de demanda exige cidade >= 2 chars).
  const [form, setForm] = useState({ titulo: "", tipoVideo: "post", descricao: "", prioridade: "normal", cidade: "Remoto", linhaProjetoId: "", dataLimite: "", classificacao: "" })
  const [produtoIds, setProdutoIds] = useState<string[]>([])
  const [responsavelIds, setResponsavelIds] = useState<string[]>([])
  const [detalhes, setDetalhes] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const tipo = tipoConteudoDe(form.tipoVideo)
  const toggleProduto = (id: string) => setProdutoIds((cur) => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
  const toggleResponsavel = (id: string) => setResponsavelIds((cur) => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
  const setDetalhe = (k: string, v: string) => setDetalhes((d) => ({ ...d, [k]: v }))

  async function salvar() {
    if (!form.titulo.trim() || form.descricao.trim().length < 10) { toast.error("Título e observação (mín. 10) obrigatórios"); return }
    setSaving(true)
    try {
      // detalhesEntrega keyed por label amigável (exibido no detalhe da demanda)
      const detalhesEntrega: Record<string, string> = {}
      for (const c of tipo?.campos ?? []) {
        const v = detalhes[c.key]
        if (v !== undefined && v !== "") detalhesEntrega[c.label] = v
      }
      const res = await fetch("/api/demandas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form, area: "design", departamento: "growth",
          linhaProjetoId: form.linhaProjetoId || undefined,
          dataLimite: form.dataLimite || undefined,
          classificacao: form.classificacao || undefined,
          responsavelIds,
          produtoIds,
          ...(Object.keys(detalhesEntrega).length ? { detalhesEntrega } : {}),
          ...(form.prioridade === "urgente" ? { motivoUrgencia: "Demanda urgente" } : {}),
        }),
      })
      if (!res.ok) throw new Error("Erro ao criar demanda")
      toast.success("Demanda criada!"); onCreated()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro") } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-100">Nova Demanda</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="block text-xs text-zinc-500 mb-1">Título *</label><input value={form.titulo} onChange={(e) => upd("titulo", e.target.value)} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Tipo de demanda</label>
              <select value={form.tipoVideo} onChange={(e) => { upd("tipoVideo", e.target.value); setDetalhes({}) }} className={inputCls}>
                {TIPOS_CONTEUDO.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-zinc-500 mb-1">Prioridade</label>
              <select value={form.prioridade} onChange={(e) => upd("prioridade", e.target.value)} className={inputCls}>
                <option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
              </select>
            </div>
          </div>

          {/* Campos condicionais por tipo de demanda */}
          {(tipo?.campos.length ?? 0) > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-indigo-300">Detalhes — {tipo?.label}</p>
              <div className="grid grid-cols-2 gap-2">
                {tipo?.campos.map((c) => (
                  <div key={c.key} className={c.tipo === "textarea" ? "col-span-2" : ""}>
                    <label className="block text-[11px] text-zinc-500 mb-1">{c.label}</label>
                    {c.tipo === "bool" ? (
                      <select value={detalhes[c.key] ?? ""} onChange={(e) => setDetalhe(c.key, e.target.value)} className={inputCls}>
                        <option value="">—</option><option value="Sim">Sim</option><option value="Não">Não</option>
                      </select>
                    ) : c.tipo === "textarea" ? (
                      <textarea value={detalhes[c.key] ?? ""} onChange={(e) => setDetalhe(c.key, e.target.value)} rows={2} className={inputCls} />
                    ) : (
                      <input type={c.tipo === "number" ? "number" : "text"} value={detalhes[c.key] ?? ""} onChange={(e) => setDetalhe(c.key, e.target.value)} className={inputCls} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Responsáveis — múltiplas pessoas; selecionados viram chips removíveis */}
          <div><label className="block text-xs text-zinc-500 mb-1">Responsáveis</label>
            {responsavelIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {responsavelIds.map((id) => {
                  const r = responsaveis.find((x) => x.id === id)
                  return (
                    <span key={id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-indigo-500/15 text-indigo-300 border-indigo-500/30">
                      {r?.label ?? r?.nome ?? id}
                      <button type="button" onClick={() => toggleResponsavel(id)} className="text-indigo-300/70 hover:text-white leading-none">×</button>
                    </span>
                  )
                })}
              </div>
            )}
            <select value="" onChange={(e) => { if (e.target.value) toggleResponsavel(e.target.value) }} className={inputCls}>
              <option value="">+ Adicionar responsável…</option>
              {responsaveis.filter((r) => !responsavelIds.includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Data de entrega</label>
              <input type="date" value={form.dataLimite} onChange={(e) => upd("dataLimite", e.target.value)} className={inputCls} />
            </div>
            <div><label className="block text-xs text-zinc-500 mb-1">Classificação</label>
              <div className="flex gap-2">
                {(["b2c", "b2b"] as const).map((c) => (
                  <button key={c} type="button"
                    onClick={() => upd("classificacao", form.classificacao === c ? "" : c)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors uppercase ${
                      form.classificacao === c
                        ? (c === "b2c" ? "bg-purple-600/20 border-purple-500 text-purple-300" : "bg-blue-600/20 border-blue-500 text-blue-300")
                        : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600"
                    }`}>
                    {c.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div><label className="block text-xs text-zinc-500 mb-1">Linha / Projeto</label>
            <select value={form.linhaProjetoId} onChange={(e) => upd("linhaProjetoId", e.target.value)} className={inputCls}>
              <option value="">— Sem linha/projeto —</option>
              {linhas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            {linhas.length === 0 && (
              <p className="text-[11px] text-zinc-600 mt-1">Nenhuma linha/projeto cadastrada. Cadastre em Configurações → Linhas / Projetos.</p>
            )}
          </div>

          {/* Equipamento / Produto — multi-seleção; selecionados viram chips removíveis */}
          <div><label className="block text-xs text-zinc-500 mb-1">Equipamento / Produto</label>
            {produtoIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {produtoIds.map((id) => {
                  const p = produtos.find((x) => x.id === id)
                  return (
                    <span key={id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-sky-500/15 text-sky-300 border-sky-500/30">
                      {p?.nome ?? id}
                      <button type="button" onClick={() => toggleProduto(id)} className="text-sky-300/70 hover:text-white leading-none">×</button>
                    </span>
                  )
                })}
              </div>
            )}
            <select value="" onChange={(e) => { if (e.target.value) toggleProduto(e.target.value) }} className={inputCls} disabled={produtos.length === 0}>
              <option value="">+ Adicionar equipamento/produto…</option>
              {produtos.filter((p) => !produtoIds.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            {produtos.length === 0 && (
              <p className="text-[11px] text-zinc-600 mt-1">Nenhum produto cadastrado. Cadastre em Produtos.</p>
            )}
          </div>

          <div><label className="block text-xs text-zinc-500 mb-1">Observação *</label><textarea value={form.descricao} onChange={(e) => upd("descricao", e.target.value)} rows={3} className={inputCls} /></div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="flex-1 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar
          </button>
        </div>
      </div>
    </div>
  )
}
