"use client"

import { useState } from "react"
import useSWR from "swr"
import { Layers, Plus, Loader2, Check, X, Pencil } from "lucide-react"
import { toast } from "sonner"

type Linha = { id: string; nome: string; descricao: string | null; ativo: boolean }

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"

export default function LinhasProjetosPage() {
  // Mostra ativas e inativas: a API só lista ativas, então pedimos todas via ?incluirInativas
  const { data, mutate } = useSWR<{ linhas: Linha[] }>("/api/growth/linhas-projetos?incluirInativas=1", fetcher)
  const linhas = data?.linhas ?? []
  const [nome, setNome] = useState("")
  const [descricao, setDescricao] = useState("")
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState("")

  async function criar() {
    if (!nome.trim()) { toast.error("Nome obrigatório"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/growth/linhas-projetos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, descricao: descricao || undefined }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erro ao criar")
      toast.success("Linha/projeto salva!"); setNome(""); setDescricao(""); mutate()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro") } finally { setSaving(false) }
  }

  async function patch(id: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/growth/linhas-projetos/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})); toast.error(b.error || "Erro"); return }
    mutate()
  }

  async function remover(id: string) {
    if (!confirm("Desativar/remover esta linha/projeto?")) return
    const res = await fetch(`/api/growth/linhas-projetos/${id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Erro ao remover"); return }
    const b = await res.json()
    toast.success(b.hardDelete ? "Removida." : `Desativada (${b.demandasVinculadas} demanda(s) vinculada(s)).`)
    mutate()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2"><Layers className="w-6 h-6 text-indigo-400" /> Linhas / Projetos</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Segmentação do Growth por organização (ex.: Médica, Estética, Cliente A, Produto X).</p>
      </div>

      {/* Criar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div><label className="block text-xs text-zinc-500 mb-1">Nome *</label><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Médica" className={inputCls} /></div>
          <div><label className="block text-xs text-zinc-500 mb-1">Descrição</label><input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="opcional" className={inputCls} /></div>
          <button onClick={criar} disabled={saving} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {linhas.length === 0 && <p className="text-sm text-zinc-600">Nenhuma linha/projeto cadastrada ainda.</p>}
        {linhas.map((l) => (
          <div key={l.id} className={`flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 ${!l.ativo && "opacity-60"}`}>
            {editId === l.id ? (
              <>
                <input value={editNome} onChange={(e) => setEditNome(e.target.value)} className={inputCls + " flex-1"} />
                <button onClick={async () => { await patch(l.id, { nome: editNome }); setEditId(null) }} className="p-1.5 rounded hover:bg-zinc-800 text-emerald-400"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditId(null)} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400"><X className="w-4 h-4" /></button>
              </>
            ) : (
              <>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">{l.nome}</p>
                  {l.descricao && <p className="text-xs text-zinc-500">{l.descricao}</p>}
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${l.ativo ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-zinc-700/40 text-zinc-400 border-zinc-600/40"}`}>{l.ativo ? "Ativo" : "Inativo"}</span>
                <button onClick={() => { setEditId(l.id); setEditNome(l.nome) }} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => patch(l.id, { ativo: !l.ativo })} className="text-xs text-zinc-400 hover:text-zinc-200 px-2">{l.ativo ? "Desativar" : "Ativar"}</button>
                <button onClick={() => remover(l.id)} className="p-1.5 rounded hover:bg-zinc-800 text-rose-400"><X className="w-4 h-4" /></button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
