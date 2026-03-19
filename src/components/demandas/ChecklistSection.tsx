"use client"

import { useState } from "react"
import useSWR from "swr"
import { CheckSquare, Square, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface ChecklistItemData {
  id: string
  texto: string
  concluido: boolean
  concluidoEm: string | null
  concluidoPor: string | null
  ordem: number
  grupo: string | null
}

const GRUPO_LABELS: Record<string, string> = {
  geral: "Geral",
  videomaker_externo: "Videomaker Externo",
  editor: "Editor (Pós-produção)",
  social: "Social Media",
}

export function ChecklistSection({ demandaId }: { demandaId: string }) {
  const { data, mutate } = useSWR(`/api/demandas/${demandaId}/checklist`, fetcher)
  const [novoTexto, setNovoTexto] = useState("")
  const [novoGrupo, setNovoGrupo] = useState("geral")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  const itens: ChecklistItemData[] = data?.itens ?? []
  const total = data?.total ?? 0
  const concluidos = data?.concluidos ?? 0
  const progresso = total > 0 ? Math.round((concluidos / total) * 100) : 0

  // Agrupar itens
  const grupos: Record<string, ChecklistItemData[]> = {}
  for (const item of itens) {
    const g = item.grupo ?? "geral"
    if (!grupos[g]) grupos[g] = []
    grupos[g].push(item)
  }
  const grupoKeys = Object.keys(grupos).sort()

  async function toggleItem(itemId: string, concluido: boolean) {
    mutate(
      (prev: { itens: ChecklistItemData[]; total: number; concluidos: number }) => ({
        ...prev,
        itens: prev.itens.map(i => i.id === itemId ? { ...i, concluido } : i),
        concluidos: concluido ? prev.concluidos + 1 : prev.concluidos - 1,
      }),
      false
    )

    await fetch(`/api/demandas/${demandaId}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, concluido }),
    })
    mutate()
  }

  async function addItem() {
    if (!novoTexto.trim() || adding) return
    setAdding(true)
    await fetch(`/api/demandas/${demandaId}/checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: novoTexto, grupo: novoGrupo }),
    })
    setNovoTexto("")
    setAdding(false)
    mutate()
  }

  async function deleteItem(itemId: string) {
    mutate(
      (prev: { itens: ChecklistItemData[]; total: number; concluidos: number }) => ({
        ...prev,
        itens: prev.itens.filter(i => i.id !== itemId),
        total: prev.total - 1,
        concluidos: prev.itens.find(i => i.id === itemId)?.concluido ? prev.concluidos - 1 : prev.concluidos,
      }),
      false
    )

    await fetch(`/api/demandas/${demandaId}/checklist`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    })
    mutate()
  }

  function toggleCollapse(grupo: string) {
    setCollapsed(prev => ({ ...prev, [grupo]: !prev[grupo] }))
  }

  if (total === 0 && !showAddForm) {
    return (
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-zinc-300 flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-purple-400" /> Checklist
          </h2>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1.5 rounded-lg"
          >
            <Plus className="w-3 h-3" /> Adicionar
          </button>
        </div>
        <p className="text-xs text-zinc-500">Nenhum item no checklist. Adicione itens ou aplique um template.</p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
      {/* Header com progresso */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-zinc-300 flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-purple-400" /> Checklist
          <span className="text-xs font-normal text-zinc-500">
            {concluidos}/{total}
          </span>
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
        >
          <Plus className="w-3 h-3" /> Adicionar
        </button>
      </div>

      {/* Barra de progresso */}
      <div className="w-full h-2 bg-zinc-800 rounded-full mb-4 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            progresso === 100 ? "bg-green-500" : "bg-purple-500"
          )}
          style={{ width: `${progresso}%` }}
        />
      </div>

      {/* Itens agrupados */}
      <div className="space-y-3">
        {grupoKeys.map(grupo => {
          const itensGrupo = grupos[grupo]
          const concluidosGrupo = itensGrupo.filter(i => i.concluido).length
          const isCollapsed = collapsed[grupo]

          return (
            <div key={grupo}>
              {grupoKeys.length > 1 && (
                <button
                  onClick={() => toggleCollapse(grupo)}
                  className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 mb-1.5 w-full"
                >
                  {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {GRUPO_LABELS[grupo] ?? grupo}
                  <span className="text-zinc-600 font-normal">({concluidosGrupo}/{itensGrupo.length})</span>
                </button>
              )}

              {!isCollapsed && (
                <div className="space-y-1">
                  {itensGrupo.map(item => (
                    <div key={item.id} className="flex items-center gap-2 group py-1 px-1 rounded hover:bg-zinc-800/50">
                      <button
                        onClick={() => toggleItem(item.id, !item.concluido)}
                        className="shrink-0"
                      >
                        {item.concluido ? (
                          <CheckSquare className="w-4 h-4 text-green-500" />
                        ) : (
                          <Square className="w-4 h-4 text-zinc-600 hover:text-purple-400" />
                        )}
                      </button>
                      <span className={cn(
                        "text-sm flex-1",
                        item.concluido ? "line-through text-zinc-600" : "text-zinc-300"
                      )}>
                        {item.texto}
                      </span>
                      {item.concluidoPor && (
                        <span className="text-[10px] text-zinc-600 hidden sm:inline">
                          {item.concluidoPor}
                        </span>
                      )}
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Form para adicionar */}
      {showAddForm && (
        <div className="mt-3 pt-3 border-t border-zinc-800 flex gap-2">
          <input
            value={novoTexto}
            onChange={e => setNovoTexto(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addItem()}
            placeholder="Novo item..."
            className="flex-1 text-sm bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200 placeholder:text-zinc-500"
          />
          <select
            value={novoGrupo}
            onChange={e => setNovoGrupo(e.target.value)}
            className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-300 outline-none"
          >
            <option value="geral">Geral</option>
            <option value="videomaker_externo">VM Externo</option>
            <option value="editor">Editor</option>
            <option value="social">Social</option>
          </select>
          <button
            onClick={addItem}
            disabled={adding || !novoTexto.trim()}
            className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {adding ? "..." : "Adicionar"}
          </button>
        </div>
      )}
    </div>
  )
}
