"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { Header } from "@/components/layout/Header"
import {
  Package, Plus, Pencil, Power, PowerOff, Search, X, Loader2,
  ArrowUpDown, ChevronUp, ChevronDown, AlertTriangle, Check, BarChart3
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error("Erro ao carregar")
  return r.json()
})

interface Fabricante {
  id: string
  nome: string
  _count?: { produtos: number }
}

interface Produto {
  id: string
  nome: string
  descricao: string | null
  categoria: string | null
  fabricanteId: string | null
  fabricante: { id: string; nome: string } | null
  peso: number
  ativo: boolean
  alertaDias: number
  ultimoConteudo: string | null
  totalConteudos: number
  createdAt: string
  diasSemConteudo: number
  emAlerta: boolean
  score: number
  _count: { demandas: number }
}

type SortKey = "nome" | "fabricante" | "peso" | "alertaDias" | "score"
type SortDir = "asc" | "desc"

export default function ProdutosPage() {
  const { data: session } = useSession()
  const userTipo = (session?.user as { tipo?: string })?.tipo
  const canEdit = userTipo === "admin" || userTipo === "gestor"

  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Produto | null>(null)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("score")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [confirmToggle, setConfirmToggle] = useState<Produto | null>(null)
  const [toggling, setToggling] = useState(false)

  const { data, mutate } = useSWR("/api/produtos?all=true", fetcher)
  const { data: fabData } = useSWR("/api/fabricantes", fetcher)
  const { data: kpiData } = useSWR("/api/kpi/b2c-b2b", fetcher)
  const produtos: Produto[] = data?.produtos ?? []
  const fabricantes: Fabricante[] = fabData ?? []

  const filtered = useMemo(() => {
    let list = produtos
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.nome.toLowerCase().includes(q) ||
          (p.fabricante?.nome ?? p.categoria ?? "").toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "nome": cmp = a.nome.localeCompare(b.nome, "pt-BR"); break
        case "fabricante": cmp = (a.fabricante?.nome ?? a.categoria ?? "").localeCompare(b.fabricante?.nome ?? b.categoria ?? "", "pt-BR"); break
        case "peso": cmp = a.peso - b.peso; break
        case "alertaDias": cmp = a.alertaDias - b.alertaDias; break
        case "score": cmp = a.score - b.score; break
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return list
  }, [produtos, search, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir(key === "nome" || key === "fabricante" ? "asc" : "desc") }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-zinc-600" />
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-purple-400" /> : <ChevronDown className="w-3 h-3 text-purple-400" />
  }

  async function toggleAtivo(p: Produto) {
    setToggling(true)
    try {
      const res = await fetch(`/api/produtos/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !p.ativo }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(p.ativo ? `"${p.nome}" desativado` : `"${p.nome}" ativado`)
      mutate()
    } catch (err) { toast.error(String(err)) }
    finally { setToggling(false); setConfirmToggle(null) }
  }

  // ── Inline quick-update ──────────────────────────────────────────────
  async function quickUpdate(id: string, field: string, value: unknown) {
    try {
      const res = await fetch(`/api/produtos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Atualizado!")
      mutate()
    } catch (err) { toast.error(String(err)) }
  }

  function pesoColor(peso: number) {
    if (peso <= 3) return "bg-green-500/20 text-green-400 border-green-500/30"
    if (peso <= 6) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    return "bg-red-500/20 text-red-400 border-red-500/30"
  }

  function pesoDot(peso: number) {
    if (peso <= 3) return "bg-green-500"
    if (peso <= 6) return "bg-yellow-500"
    return "bg-red-500"
  }

  const totalAtivos = produtos.filter((p) => p.ativo).length
  const totalInativos = produtos.filter((p) => !p.ativo).length
  const totalAlerta = produtos.filter((p) => p.emAlerta && p.ativo).length

  return (
    <>
      <Header
        title="Produtos"
        actions={
          canEdit ? (
            <button
              onClick={() => { setEditingProduct(null); setShowForm(true) }}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Novo Produto
            </button>
          ) : undefined
        }
      />
      <main className="flex-1 p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total</p>
            <p className="text-2xl font-bold text-zinc-200">{produtos.length}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Ativos</p>
            <p className="text-2xl font-bold text-green-400">{totalAtivos}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Em Alerta</p>
            <p className="text-2xl font-bold text-red-400">{totalAlerta}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Inativos</p>
            <p className="text-2xl font-bold text-zinc-500">{totalInativos}</p>
          </div>
        </div>

        {/* B2C/B2B Ratio */}
        {kpiData && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" /> Classificação B2C / B2B
              </h3>
              {kpiData.alerta && (
                <span className="flex items-center gap-1 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2.5 py-1">
                  <AlertTriangle className="w-3 h-3" /> Meta B2C abaixo de {kpiData.meta?.b2c_target ?? 70}%
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {/* B2C */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-cyan-400">B2C</span>
                  <span className="text-xs text-zinc-400">{kpiData.b2c?.count ?? 0} ({kpiData.b2c?.percent ?? 0}%)</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${kpiData.b2c?.percent ?? 0}%` }} />
                </div>
              </div>
              {/* B2B */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-orange-400">B2B</span>
                  <span className="text-xs text-zinc-400">{kpiData.b2b?.count ?? 0} ({kpiData.b2b?.percent ?? 0}%)</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${kpiData.b2b?.percent ?? 0}%` }} />
                </div>
              </div>
              {/* Sem classificação */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-500">Sem classif.</span>
                  <span className="text-xs text-zinc-400">{kpiData.sem_classificacao?.count ?? 0} ({kpiData.sem_classificacao?.percent ?? 0}%)</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-600 rounded-full transition-all" style={{ width: `${kpiData.sem_classificacao?.percent ?? 0}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            placeholder="Buscar por nome ou fabricante..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Hint */}
        <p className="text-xs text-zinc-600">
          Ordenado por prioridade (score = peso x dias sem conteúdo). {canEdit && "Clique nos campos para edição rápida."}
        </p>

        {/* Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort("nome")}>
                    <span className="flex items-center gap-1.5">Nome do Produto <SortIcon col="nome" /></span>
                  </th>
                  <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort("fabricante")}>
                    <span className="flex items-center gap-1.5">Fabricante <SortIcon col="fabricante" /></span>
                  </th>
                  <th className="text-center px-4 py-3 font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort("peso")}>
                    <span className="flex items-center justify-center gap-1.5">Peso <SortIcon col="peso" /></span>
                  </th>
                  <th className="text-center px-4 py-3 font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort("alertaDias")}>
                    <span className="flex items-center justify-center gap-1.5">Recorrência <SortIcon col="alertaDias" /></span>
                  </th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  {canEdit && <th className="text-center px-4 py-3 font-medium">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filtered.map((p) => (
                  <tr key={p.id} className={cn("hover:bg-zinc-800/50 transition-colors", !p.ativo && "opacity-50")}>
                    {/* Nome */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <Link href={`/produtos/${p.id}`} className="font-medium text-zinc-100 hover:text-purple-400 transition-colors">
                            {p.nome}
                          </Link>
                          {p.emAlerta && p.ativo && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-red-400 mt-0.5">
                              <AlertTriangle className="w-3 h-3" /> {p.diasSemConteudo} dias sem conteúdo
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Fabricante — inline dropdown */}
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <InlineFabricante
                          produto={p}
                          fabricantes={fabricantes}
                          onUpdate={(fabId) => quickUpdate(p.id, "fabricanteId", fabId)}
                        />
                      ) : (
                        <span className="text-xs text-zinc-400">
                          {p.fabricante?.nome ?? p.categoria ?? "--"}
                        </span>
                      )}
                    </td>

                    {/* Peso — inline select */}
                    <td className="px-4 py-3 text-center">
                      {canEdit ? (
                        <InlinePeso peso={p.peso} onUpdate={(v) => quickUpdate(p.id, "peso", v)} />
                      ) : (
                        <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-md border", pesoColor(p.peso))}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", pesoDot(p.peso))} />
                          {p.peso}
                        </span>
                      )}
                    </td>

                    {/* Recorrência — inline number */}
                    <td className="px-4 py-3 text-center">
                      {canEdit ? (
                        <InlineDias dias={p.alertaDias} onUpdate={(v) => quickUpdate(p.id, "alertaDias", v)} />
                      ) : (
                        <span className="text-xs text-zinc-300 font-mono">{p.alertaDias} dias</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      {canEdit ? (
                        <button
                          onClick={() => setConfirmToggle(p)}
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border cursor-pointer transition-all hover:scale-105",
                            p.ativo
                              ? "bg-green-500/15 text-green-400 border-green-500/20 hover:bg-green-500/25"
                              : "bg-zinc-700/50 text-zinc-500 border-zinc-700 hover:bg-zinc-700"
                          )}
                        >
                          <span className={cn("w-1.5 h-1.5 rounded-full", p.ativo ? "bg-green-500" : "bg-zinc-600")} />
                          {p.ativo ? "Ativo" : "Inativo"}
                        </button>
                      ) : (
                        <span className={cn(
                          "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border",
                          p.ativo ? "bg-green-500/15 text-green-400 border-green-500/20" : "bg-zinc-700/50 text-zinc-500 border-zinc-700"
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", p.ativo ? "bg-green-500" : "bg-zinc-600")} />
                          {p.ativo ? "Ativo" : "Inativo"}
                        </span>
                      )}
                    </td>

                    {/* Ações */}
                    {canEdit && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/produtos/${p.id}`}
                            title="Ver dashboard"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          >
                            <BarChart3 className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => { setEditingProduct(p); setShowForm(true) }}
                            title="Editar detalhes"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-zinc-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
              <p className="text-lg font-medium mb-1">Nenhum produto encontrado</p>
              <p className="text-sm">{search ? "Nenhum resultado para esta busca." : 'Clique em "Novo Produto" para cadastrar o primeiro.'}</p>
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <p className="text-xs text-zinc-600 text-right">
            {filtered.length} produto{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </main>

      {/* Toggle Confirmation */}
      {confirmToggle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-zinc-100 mb-2">
              {confirmToggle.ativo ? "Desativar" : "Ativar"} produto
            </h3>
            <p className="text-sm text-zinc-400 mb-6">
              Tem certeza que deseja {confirmToggle.ativo ? "desativar" : "ativar"}{" "}
              <span className="font-medium text-zinc-200">&ldquo;{confirmToggle.nome}&rdquo;</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmToggle(null)} disabled={toggling} className="px-4 py-2 text-sm border border-zinc-700 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors disabled:opacity-60">
                Cancelar
              </button>
              <button
                onClick={() => toggleAtivo(confirmToggle)}
                disabled={toggling}
                className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-60",
                  confirmToggle.ativo ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"
                )}
              >
                {toggling ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : confirmToggle.ativo ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Form Modal */}
      {showForm && (
        <ProdutoFormModal produto={editingProduct} fabricantes={fabricantes} onClose={() => { setShowForm(false); setEditingProduct(null); mutate() }} />
      )}
    </>
  )
}

/* ─── Inline Peso Selector ─── */
function InlinePeso({ peso, onUpdate }: { peso: number; onUpdate: (v: number) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  function pesoColor(p: number) {
    if (p <= 3) return "bg-green-500/20 text-green-400 border-green-500/30"
    if (p <= 6) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    return "bg-red-500/20 text-red-400 border-red-500/30"
  }
  function pesoDot(p: number) {
    if (p <= 3) return "bg-green-500"
    if (p <= 6) return "bg-yellow-500"
    return "bg-red-500"
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-md border cursor-pointer transition-all hover:scale-105 hover:ring-1 hover:ring-purple-500/50",
          pesoColor(peso)
        )}
      >
        <span className={cn("w-1.5 h-1.5 rounded-full", pesoDot(peso))} />
        {peso}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 p-1.5 min-w-[120px]">
          <div className="grid grid-cols-5 gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
              <button
                key={v}
                onClick={() => { onUpdate(v); setOpen(false) }}
                className={cn(
                  "w-8 h-8 rounded text-xs font-bold flex items-center justify-center transition-all",
                  v === peso ? "ring-2 ring-purple-500" : "",
                  v <= 3 ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" :
                  v <= 6 ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30" :
                  "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Inline Dias Editor ─── */
function InlineDias({ dias, onUpdate }: { dias: number; onUpdate: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(dias)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setValue(dias) }, [dias])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  function save() {
    setEditing(false)
    if (value !== dias && value > 0) onUpdate(value)
    else setValue(dias)
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-zinc-300 font-mono cursor-pointer hover:text-purple-400 hover:underline transition-colors"
      >
        {dias} dias
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      type="number"
      min={1}
      max={365}
      value={value}
      onChange={(e) => setValue(parseInt(e.target.value) || 0)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setValue(dias); setEditing(false) } }}
      className="w-16 text-center text-xs font-mono bg-zinc-800 border border-purple-500 rounded px-1.5 py-1 text-zinc-200 outline-none"
    />
  )
}

/* ─── Inline Fabricante Selector ─── */
function InlineFabricante({
  produto, fabricantes, onUpdate
}: { produto: Produto; fabricantes: Fabricante[]; onUpdate: (fabId: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const currentName = produto.fabricante?.nome ?? produto.categoria ?? ""

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-block text-xs px-2 py-0.5 rounded border transition-all cursor-pointer",
          currentName
            ? "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-purple-500/50 hover:text-zinc-200"
            : "bg-zinc-800/50 border-dashed border-zinc-700 text-zinc-600 hover:border-purple-500/50 hover:text-zinc-400"
        )}
      >
        {currentName || "+ Fabricante"}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 min-w-[180px] max-h-[200px] overflow-y-auto">
          <button
            onClick={() => { onUpdate(null); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-700/50 transition-colors"
          >
            — Nenhum —
          </button>
          {fabricantes.map((f) => (
            <button
              key={f.id}
              onClick={() => { onUpdate(f.id); setOpen(false) }}
              className={cn(
                "w-full text-left px-3 py-2 text-xs hover:bg-zinc-700/50 transition-colors flex items-center justify-between",
                produto.fabricanteId === f.id ? "text-purple-400 bg-purple-500/10" : "text-zinc-300"
              )}
            >
              {f.nome}
              {produto.fabricanteId === f.id && <Check className="w-3 h-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Product Form Modal ─── */
function ProdutoFormModal({
  produto, fabricantes, onClose
}: { produto: Produto | null; fabricantes: Fabricante[]; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [novoFab, setNovoFab] = useState("")
  const [form, setForm] = useState({
    nome: produto?.nome ?? "",
    descricao: produto?.descricao ?? "",
    fabricanteId: produto?.fabricanteId ?? "",
    peso: produto?.peso ?? 5,
    alertaDias: produto?.alertaDias ?? 30,
  })

  async function criarFabricante() {
    if (!novoFab.trim()) return
    try {
      const res = await fetch("/api/fabricantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoFab.trim() }),
      })
      const fab = await res.json()
      setForm({ ...form, fabricanteId: fab.id })
      setNovoFab("")
      toast.success(`Fabricante "${fab.nome}" criado!`)
    } catch { toast.error("Erro ao criar fabricante") }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const url = produto ? `/api/produtos/${produto.id}` : "/api/produtos"
      const method = produto ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(produto ? "Produto atualizado!" : "Produto criado!")
      onClose()
    } catch (err) { toast.error(String(err)) }
    finally { setLoading(false) }
  }

  function pesoLabel(p: number) {
    if (p <= 3) return "Baixo"
    if (p <= 6) return "Médio"
    return "Alto"
  }
  function pesoLabelColor(p: number) {
    if (p <= 3) return "text-green-400"
    if (p <= 6) return "text-yellow-400"
    return "text-red-400"
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="font-semibold text-white">{produto ? "Editar Produto" : "Novo Produto"}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Nome *</label>
            <input required placeholder="Nome do produto" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inp} />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Descrição</label>
            <textarea placeholder="Descrição do produto..." value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} className={cn(inp, "resize-none")} />
          </div>

          {/* Fabricante dropdown + criar novo */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Fabricante</label>
            <select
              value={form.fabricanteId}
              onChange={(e) => setForm({ ...form, fabricanteId: e.target.value })}
              className={inp}
            >
              <option value="">— Selecionar —</option>
              {fabricantes.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
            <div className="flex items-center gap-2 mt-2">
              <input
                placeholder="Novo fabricante..."
                value={novoFab}
                onChange={(e) => setNovoFab(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); criarFabricante() } }}
                className={cn(inp, "flex-1 text-xs")}
              />
              <button type="button" onClick={criarFabricante} disabled={!novoFab.trim()} className="px-3 py-2 text-xs bg-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-600 disabled:opacity-40 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Peso (Prioridade): <span className={cn("font-bold", pesoLabelColor(form.peso))}>{form.peso} - {pesoLabel(form.peso)}</span>
              </label>
              <input type="range" min={1} max={10} step={1} value={form.peso} onChange={(e) => setForm({ ...form, peso: parseInt(e.target.value) })} className="w-full accent-purple-500" />
              <div className="flex justify-between text-[10px] text-zinc-600 mt-0.5">
                <span>1</span><span>5</span><span>10</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Recorrência (dias)</label>
              <input type="number" min={1} max={365} value={form.alertaDias} onChange={(e) => setForm({ ...form, alertaDias: parseInt(e.target.value) || 30 })} className={inp} />
              <p className="text-[10px] text-zinc-600 mt-0.5">Alerta se sem conteúdo há mais de {form.alertaDias} dias</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-zinc-700 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60">
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inp = "w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500"
