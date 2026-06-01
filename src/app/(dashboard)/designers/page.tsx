"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { PenTool, Plus, Search, Loader2, X, Phone, Mail, MapPin } from "lucide-react"
import { toast } from "sonner"

type Designer = {
  id: string; nome: string; cidade: string | null; estado: string | null
  telefone: string | null; email: string | null; status: string
  tipoContrato: string; especialidade: string[]; _count: { demandas: number }
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"

export default function DesignersPage() {
  const [search, setSearch] = useState("")
  const [showCriar, setShowCriar] = useState(false)
  const { data, mutate, isLoading } = useSWR<{ designers: Designer[] }>("/api/designers", fetcher)
  const designers = (data?.designers ?? []).filter((d) =>
    !search || d.nome.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2"><PenTool className="w-6 h-6 text-purple-400" /> Designers</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Cadastro de designers (artes digitais e impressas).</p>
        </div>
        <button onClick={() => setShowCriar(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg"><Plus className="w-4 h-4" /> Novo</button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar designer…" className={inputCls + " pl-9"} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
      ) : designers.length === 0 ? (
        <div className="text-center py-16 text-zinc-500"><PenTool className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Nenhum designer cadastrado.</p></div>
      ) : (
        <div className="grid gap-2">
          {designers.map((d) => (
            <Link key={d.id} href={`/designers/${d.id}`} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between hover:border-zinc-700 transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-zinc-100 truncate">{d.nome}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${d.tipoContrato === "interno" ? "bg-blue-600/20 text-blue-300" : "bg-amber-600/20 text-amber-300"}`}>{d.tipoContrato}</span>
                  {d.status === "inativo" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/50 text-red-300">inativo</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 flex-wrap">
                  {d.telefone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {d.telefone}</span>}
                  {d.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {d.email}</span>}
                  {d.cidade && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {d.cidade}{d.estado ? `/${d.estado}` : ""}</span>}
                  <span>{d._count.demandas} arte(s)</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCriar && <CriarDesignerModal onClose={() => setShowCriar(false)} onCreated={() => { setShowCriar(false); mutate() }} />}
    </div>
  )
}

function CriarDesignerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ nome: "", tipoContrato: "externo", telefone: "", email: "", cidade: "", estado: "", valorDiaria: "", especialidade: "" })
  const [saving, setSaving] = useState(false)
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function salvar() {
    if (!form.nome.trim()) { toast.error("Nome obrigatório"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/designers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, especialidade: form.especialidade ? form.especialidade.split(",").map((s) => s.trim()).filter(Boolean) : [] }),
      })
      if (!res.ok) throw new Error("Erro ao criar")
      toast.success("Designer cadastrado!"); onCreated()
    } catch { toast.error("Erro ao cadastrar designer") } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-100">Novo Designer</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Nome *</label><input value={form.nome} onChange={(e) => upd("nome", e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-zinc-500 mb-1">Contrato</label>
              <select value={form.tipoContrato} onChange={(e) => upd("tipoContrato", e.target.value)} className={inputCls}>
                <option value="externo">Externo (freelance)</option>
                <option value="interno">Interno (fulltime)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Telefone</label><input value={form.telefone} onChange={(e) => upd("telefone", e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-zinc-500 mb-1">E-mail</label><input value={form.email} onChange={(e) => upd("email", e.target.value)} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Cidade</label><input value={form.cidade} onChange={(e) => upd("cidade", e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-zinc-500 mb-1">Estado</label><input value={form.estado} onChange={(e) => upd("estado", e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-zinc-500 mb-1">Diária (R$)</label><input type="number" value={form.valorDiaria} onChange={(e) => upd("valorDiaria", e.target.value)} className={inputCls} /></div>
          </div>
          <div><label className="block text-xs text-zinc-500 mb-1">Especialidades (vírgula)</label><input value={form.especialidade} onChange={(e) => upd("especialidade", e.target.value)} placeholder="Social, Impresso, Motion" className={inputCls} /></div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="flex-1 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Cadastrar
          </button>
        </div>
      </div>
    </div>
  )
}
