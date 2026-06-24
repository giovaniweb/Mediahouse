"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { Sparkles, Plus, Loader2, X } from "lucide-react"
import { KanbanBoard } from "@/components/kanban/KanbanBoard"
import { GROWTH_COLUNAS, GROWTH_COLUNA_PARA_STATUS, growthColunaDe, type GrowthColunaId } from "@/lib/growth-kanban"
import { PECAS_DESIGN } from "@/lib/design-pecas"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"

// Growth (gestão de conteúdos). Reutiliza a Demanda (area="design" internamente),
// mas com kanban próprio de 8 colunas e SEM qualquer dependência de Eventos.
export default function GrowthKanbanPage() {
  const { data: session } = useSession()
  const [showNova, setShowNova] = useState(false)
  const { data, mutate } = useSWR(`/api/demandas?area=design`, fetcher, { refreshInterval: 15000 })
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
    if (!confirm("Excluir este conteúdo?")) return
    await fetch(`/api/demandas/${id}`, { method: "DELETE" }); mutate()
  }, [mutate])

  const handleDuplicate = useCallback(async (id: string) => {
    await fetch(`/api/demandas/${id}/duplicate`, { method: "POST" }); mutate()
  }, [mutate])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-400" /> Growth · Conteúdos</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{demandas.length} conteúdos</span>
          <button onClick={() => setShowNova(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"><Plus className="w-4 h-4" /> Novo Conteúdo</button>
        </div>
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
  // Growth não tem cidade física; usa "Remoto" (o schema de demanda exige cidade >= 2 chars).
  const [form, setForm] = useState({ titulo: "", tipoVideo: "post", descricao: "", prioridade: "normal", cidade: "Remoto", responsavelId: "", linhaProjeto: "" })
  const [saving, setSaving] = useState(false)
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function salvar() {
    if (!form.titulo.trim() || form.descricao.trim().length < 10) { toast.error("Título e descrição (mín. 10) obrigatórios"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/demandas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form, area: "design", departamento: "growth",
          responsavelId: form.responsavelId || undefined,
          linhaProjeto: form.linhaProjeto.trim() || undefined,
          ...(form.prioridade === "urgente" ? { motivoUrgencia: "Conteúdo urgente" } : {}),
        }),
      })
      if (!res.ok) throw new Error("Erro ao criar conteúdo")
      toast.success("Conteúdo criado!"); onCreated()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro") } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-100">Novo Conteúdo</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="block text-xs text-zinc-500 mb-1">Título *</label><input value={form.titulo} onChange={(e) => upd("titulo", e.target.value)} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-zinc-500 mb-1">Tipo de conteúdo</label>
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
          <div><label className="block text-xs text-zinc-500 mb-1">Responsável</label>
            <select value={form.responsavelId} onChange={(e) => upd("responsavelId", e.target.value)} className={inputCls}>
              <option value="">— Sem responsável —</option>
              {responsaveis.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-zinc-500 mb-1">Linha / Projeto</label>
            <input value={form.linhaProjeto} onChange={(e) => upd("linhaProjeto", e.target.value)} placeholder="ex.: Médica, Estética, Cliente A, Produto X…" className={inputCls} />
          </div>
          <div><label className="block text-xs text-zinc-500 mb-1">Descrição *</label><textarea value={form.descricao} onChange={(e) => upd("descricao", e.target.value)} rows={3} className={inputCls} /></div>
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
