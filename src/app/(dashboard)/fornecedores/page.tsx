"use client"

import { useState } from "react"
import useSWR from "swr"
import { Truck, Plus, Search, Loader2, X, Phone, Mail, MapPin, Trash2, Link2 } from "lucide-react"
import { toast } from "sonner"

type Fornecedor = {
  id: string; nome: string; contato: string | null; cnpj: string | null
  telefone: string | null; email: string | null; cidade: string | null; estado: string | null
  categoria: string; status: string; portalToken: string; _count: { produtos: number; custos: number }
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"

export const CAT_FORNECEDOR: Record<string, string> = {
  montadora: "Montadora", grafica: "Gráfica", audiovisual: "Audiovisual", som: "Som", iluminacao: "Iluminação",
  buffet: "Buffet", restaurante: "Restaurante", hotel: "Hotel", transporte: "Transporte", brindes: "Brindes",
  decoracao: "Decoração", agencia: "Agência", designer: "Designer", fotografo: "Fotógrafo", videomaker: "Videomaker",
  seguranca: "Segurança", limpeza: "Limpeza", internet: "Internet", energia: "Energia", palestrante: "Palestrante",
  medico: "Médico", influenciador: "Influenciador", espaco: "Espaço de Evento", outros: "Outros",
}

export default function FornecedoresPage() {
  const [search, setSearch] = useState("")
  const [filtroCat, setFiltroCat] = useState("")
  const [showCriar, setShowCriar] = useState(false)

  const qs = new URLSearchParams()
  if (search) qs.set("search", search)
  if (filtroCat) qs.set("categoria", filtroCat)
  const { data, mutate, isLoading } = useSWR<{ fornecedores: Fornecedor[] }>(`/api/fornecedores?${qs}`, fetcher)
  const fornecedores = data?.fornecedores ?? []

  async function remover(id: string) {
    if (!confirm("Remover fornecedor?")) return
    await fetch(`/api/fornecedores/${id}`, { method: "DELETE" })
    mutate(); toast.success("Fornecedor removido")
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2"><Truck className="w-6 h-6 text-purple-400" /> Fornecedores</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Cadastro de fornecedores de eventos (montadora, buffet, gráfica…).</p>
        </div>
        <button onClick={() => setShowCriar(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg"><Plus className="w-4 h-4" /> Novo</button>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar fornecedor…" className={inputCls + " pl-9"} />
        </div>
        <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} className={inputCls + " w-auto"}>
          <option value="">Todas categorias</option>
          {Object.entries(CAT_FORNECEDOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
      ) : fornecedores.length === 0 ? (
        <div className="text-center py-16 text-zinc-500"><Truck className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Nenhum fornecedor cadastrado.</p></div>
      ) : (
        <div className="grid gap-2">
          {fornecedores.map((f) => (
            <div key={f.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between group">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100 truncate">{f.nome}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{CAT_FORNECEDOR[f.categoria] ?? f.categoria}</span>
                  {f.status === "inativo" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/50 text-red-300">inativo</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 flex-wrap">
                  {f.contato && <span>{f.contato}</span>}
                  {f.telefone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {f.telefone}</span>}
                  {f.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {f.email}</span>}
                  {f.cidade && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {f.cidade}{f.estado ? `/${f.estado}` : ""}</span>}
                  <span>{f._count.custos} lançamento(s)</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/fornecedor/${f.portalToken}`); toast.success("Link do portal copiado!") }}
                  title="Copiar link do portal" className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-purple-400 p-1"><Link2 className="w-4 h-4" /></button>
                <button onClick={() => remover(f.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCriar && <CriarFornecedorModal onClose={() => setShowCriar(false)} onCreated={() => { setShowCriar(false); mutate() }} />}
    </div>
  )
}

function CriarFornecedorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ nome: "", categoria: "montadora", contato: "", cnpj: "", telefone: "", email: "", cidade: "", estado: "", pixKey: "", dadosBancarios: "", observacoes: "" })
  const [saving, setSaving] = useState(false)
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function salvar() {
    if (!form.nome.trim()) { toast.error("Nome obrigatório"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/fornecedores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error("Erro ao criar")
      toast.success("Fornecedor cadastrado!"); onCreated()
    } catch { toast.error("Erro ao cadastrar fornecedor") } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-100">Novo Fornecedor</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Nome *</label><input value={form.nome} onChange={(e) => upd("nome", e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-zinc-500 mb-1">Categoria</label>
              <select value={form.categoria} onChange={(e) => upd("categoria", e.target.value)} className={inputCls}>
                {Object.entries(CAT_FORNECEDOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Contato</label><input value={form.contato} onChange={(e) => upd("contato", e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-zinc-500 mb-1">CNPJ</label><input value={form.cnpj} onChange={(e) => upd("cnpj", e.target.value)} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Telefone</label><input value={form.telefone} onChange={(e) => upd("telefone", e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-zinc-500 mb-1">E-mail</label><input value={form.email} onChange={(e) => upd("email", e.target.value)} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Cidade</label><input value={form.cidade} onChange={(e) => upd("cidade", e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-zinc-500 mb-1">Estado</label><input value={form.estado} onChange={(e) => upd("estado", e.target.value)} className={inputCls} /></div>
          </div>
          <div><label className="block text-xs text-zinc-500 mb-1">Chave PIX</label><input value={form.pixKey} onChange={(e) => upd("pixKey", e.target.value)} className={inputCls} /></div>
          <div><label className="block text-xs text-zinc-500 mb-1">Observações</label><textarea value={form.observacoes} onChange={(e) => upd("observacoes", e.target.value)} rows={2} className={inputCls} /></div>
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
