"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { Palette, Plus, Loader2, X } from "lucide-react"
import { KanbanBoard } from "@/components/kanban/KanbanBoard"
import { PECAS_DESIGN } from "@/lib/design-pecas"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"

// Rótulos das colunas no contexto de Design
const LABELS_DESIGN = {
  entrada: "Briefing", producao: "Criação", edicao: "Ajustes",
  aprovacao: "Aprovação", para_postar: "Entrega", finalizado: "Concluído",
}
const COLUNA_PARA_STATUS: Record<string, string> = {
  entrada: "aguardando_triagem", producao: "planejamento", edicao: "editando",
  aprovacao: "revisao_pendente", para_postar: "postagem_pendente", finalizado: "entregue_cliente",
}

export default function DesignKanbanPage() {
  const { data: session } = useSession()
  const [showNova, setShowNova] = useState(false)
  const [filtroEvento, setFiltroEvento] = useState("")
  const { data: dataEventos } = useSWR<{ eventos: { id: string; nome: string }[] }>("/api/eventos", fetcher)
  const eventos = dataEventos?.eventos ?? []
  const { data, mutate } = useSWR(`/api/demandas?area=design${filtroEvento ? `&eventoGestaoId=${filtroEvento}` : ""}`, fetcher, { refreshInterval: 15000 })
  const demandasAll = data?.demandas ?? []

  const TRINTA = 30 * 24 * 60 * 60 * 1000
  const agora = Date.now()
  const demandas = demandasAll.filter((d: { statusVisivel: string; finalizadaEm?: string | null }) => {
    if (d.statusVisivel !== "finalizado") return true
    const ref = d.finalizadaEm ? new Date(d.finalizadaEm).getTime() : 0
    return agora - ref <= TRINTA
  })

  const handleMove = useCallback(async (demandaId: string, novo: string) => {
    const statusInterno = COLUNA_PARA_STATUS[novo]
    if (!statusInterno) return
    mutate((prev: { demandas: Array<{ id: string; statusVisivel: string }> }) => ({
      ...prev,
      demandas: prev.demandas.map((d) => d.id === demandaId ? { ...d, statusVisivel: novo } : d),
    }), false)
    const res = await fetch(`/api/demandas/${demandaId}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusInterno, origem: "kanban" }),
    })
    if (!res.ok) { mutate(); toast.error("Erro ao mover") } else mutate()
  }, [mutate])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Excluir esta arte?")) return
    await fetch(`/api/demandas/${id}`, { method: "DELETE" }); mutate()
  }, [mutate])

  const handleDuplicate = useCallback(async (id: string) => {
    await fetch(`/api/demandas/${id}/duplicate`, { method: "POST" }); mutate()
  }, [mutate])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2"><Palette className="w-5 h-5 text-purple-400" /> Artes</h1>
        <div className="flex items-center gap-3">
          <select value={filtroEvento} onChange={(e) => setFiltroEvento(e.target.value)}
            className="text-sm border border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-300">
            <option value="">Todos eventos</option>
            {eventos.map(ev => (<option key={ev.id} value={ev.id}>{ev.nome}</option>))}
          </select>
          <span className="text-xs text-zinc-500">{demandas.length} artes</span>
          <button onClick={() => setShowNova(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"><Plus className="w-4 h-4" /> Nova Arte</button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <KanbanBoard demandas={demandas} onMove={handleMove} onDelete={handleDelete} onDuplicate={handleDuplicate} userTipo={session?.user?.tipo} labels={LABELS_DESIGN} />
      </div>

      {showNova && <NovaArteModal onClose={() => setShowNova(false)} onCreated={() => { setShowNova(false); mutate() }} />}
    </div>
  )
}

function NovaArteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: dData } = useSWR<{ designers: { id: string; nome: string }[] }>("/api/designers?status=ativo", fetcher)
  const designers = dData?.designers ?? []
  const [form, setForm] = useState({ titulo: "", tipoVideo: "post", descricao: "", prioridade: "normal", cidade: "—", designerId: "" })
  const [saving, setSaving] = useState(false)
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function salvar() {
    if (!form.titulo.trim() || form.descricao.trim().length < 10) { toast.error("Título e descrição (mín. 10) obrigatórios"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/demandas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form, area: "design", departamento: "eventos",
          designerId: form.designerId || undefined,
          ...(form.prioridade === "urgente" ? { motivoUrgencia: "Arte urgente" } : {}),
        }),
      })
      if (!res.ok) throw new Error("Erro ao criar arte")
      toast.success("Arte criada!"); onCreated()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro") } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-100">Nova Arte</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="block text-xs text-zinc-500 mb-1">Título *</label><input value={form.titulo} onChange={(e) => upd("titulo", e.target.value)} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Tipo de arte</label>
              <select value={form.tipoVideo} onChange={(e) => upd("tipoVideo", e.target.value)} className={inputCls}>
                {PECAS_DESIGN.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-zinc-500 mb-1">Prioridade</label>
              <select value={form.prioridade} onChange={(e) => upd("prioridade", e.target.value)} className={inputCls}>
                <option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
          <div><label className="block text-xs text-zinc-500 mb-1">Designer</label>
            <select value={form.designerId} onChange={(e) => upd("designerId", e.target.value)} className={inputCls}>
              <option value="">— Sem designer —</option>
              {designers.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-zinc-500 mb-1">Descrição *</label><textarea value={form.descricao} onChange={(e) => upd("descricao", e.target.value)} rows={3} className={inputCls} /></div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="flex-1 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar
          </button>
        </div>
      </div>
    </div>
  )
}
