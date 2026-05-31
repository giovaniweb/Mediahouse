"use client"

import { useState } from "react"
import useSWR from "swr"
import { Boxes, Plus, Search, Loader2, X, Trash2 } from "lucide-react"
import { toast } from "sonner"

type Item = {
  id: string; nome: string; categoria: string | null; valorUnitario: number | null
  unidadeMedida: string; prazoMedioDias: number | null
  fornecedor: { id: string; nome: string } | null
}
type Fornecedor = { id: string; nome: string }

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"

const UNIDADE_LABEL: Record<string, string> = {
  unidade: "Unidade", metro_quadrado: "m²", diaria: "Diária", hora: "Hora", pacote: "Pacote",
  pessoa: "Pessoa", evento_fechado: "Evento Fechado", lote: "Lote", impressao: "Impressão", servico: "Serviço",
}
const fmtMoney = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`

export default function ProdutosServicoPage() {
  const [search, setSearch] = useState("")
  const [showCriar, setShowCriar] = useState(false)
  const { data, mutate, isLoading } = useSWR<{ itens: Item[] }>(`/api/produtos-servico?${search ? `search=${search}` : ""}`, fetcher)
  const itens = data?.itens ?? []

  async function remover(id: string) {
    if (!confirm("Remover item do catálogo?")) return
    await fetch(`/api/produtos-servico/${id}`, { method: "DELETE" }); mutate(); toast.success("Removido")
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2"><Boxes className="w-6 h-6 text-purple-400" /> Produtos & Serviços</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Catálogo de itens usados nos eventos, com preço e unidade.</p>
        </div>
        <button onClick={() => setShowCriar(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg"><Plus className="w-4 h-4" /> Novo</button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar item…" className={inputCls + " pl-9"} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
      ) : itens.length === 0 ? (
        <div className="text-center py-16 text-zinc-500"><Boxes className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Catálogo vazio.</p></div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
          {itens.map((it) => (
            <div key={it.id} className="flex items-center gap-3 p-4 group">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">{it.nome}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {it.categoria ? `${it.categoria} · ` : ""}{it.fornecedor?.nome ?? "Sem fornecedor"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm text-zinc-200">{it.valorUnitario != null ? fmtMoney(it.valorUnitario) : "—"}</p>
                <p className="text-[10px] text-zinc-500">/ {UNIDADE_LABEL[it.unidadeMedida] ?? it.unidadeMedida}</p>
              </div>
              <button onClick={() => remover(it.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      {showCriar && <CriarItemModal onClose={() => setShowCriar(false)} onCreated={() => { setShowCriar(false); mutate() }} />}
    </div>
  )
}

function CriarItemModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: fData } = useSWR<{ fornecedores: Fornecedor[] }>("/api/fornecedores", fetcher)
  const fornecedores = fData?.fornecedores ?? []
  const [form, setForm] = useState({ nome: "", categoria: "", fornecedorId: "", valorUnitario: "", unidadeMedida: "unidade", prazoMedioDias: "" })
  const [saving, setSaving] = useState(false)
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function salvar() {
    if (!form.nome.trim()) { toast.error("Nome obrigatório"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/produtos-servico", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error("Erro")
      toast.success("Item adicionado!"); onCreated()
    } catch { toast.error("Erro ao adicionar item") } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-100">Novo Item</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="block text-xs text-zinc-500 mb-1">Nome *</label><input value={form.nome} onChange={(e) => upd("nome", e.target.value)} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Categoria</label><input value={form.categoria} onChange={(e) => upd("categoria", e.target.value)} placeholder="Ex: Brinde" className={inputCls} /></div>
            <div><label className="block text-xs text-zinc-500 mb-1">Fornecedor</label>
              <select value={form.fornecedorId} onChange={(e) => upd("fornecedorId", e.target.value)} className={inputCls}>
                <option value="">—</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Valor unit. (R$)</label><input type="number" value={form.valorUnitario} onChange={(e) => upd("valorUnitario", e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-zinc-500 mb-1">Unidade</label>
              <select value={form.unidadeMedida} onChange={(e) => upd("unidadeMedida", e.target.value)} className={inputCls}>
                {Object.entries(UNIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-zinc-500 mb-1">Prazo (dias)</label><input type="number" value={form.prazoMedioDias} onChange={(e) => upd("prazoMedioDias", e.target.value)} className={inputCls} /></div>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="flex-1 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
          </button>
        </div>
      </div>
    </div>
  )
}
