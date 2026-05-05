"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { KanbanBoard } from "@/components/kanban/KanbanBoard"
import { Header } from "@/components/layout/Header"
import { NovaDemandaModal } from "@/components/demandas/NovaDemandaModal"
import { Plus, Search, SlidersHorizontal, XCircle } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Videomaker { id: string; nome: string }
interface Editor { id: string; nome: string }
interface Produto { id: string; nome: string }

export default function DemandasPage() {
  const [search, setSearch] = useState("")
  const [filtroDepto, setFiltroDepto] = useState("")
  const [filtroVM, setFiltroVM] = useState("")
  const [filtroEditor, setFiltroEditor] = useState("")
  const [filtroProduto, setFiltroProduto] = useState("")
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null)
  const [showNovaDemandaModal, setShowNovaDemandaModal] = useState(false)

  // Dados para filtros
  const { data: dataVMs } = useSWR<{ videomakers: Videomaker[] }>("/api/videomakers?status=ativo&limit=200", fetcher)
  const { data: dataEds } = useSWR<{ editores: Editor[] }>("/api/editores?status=ativo&limit=200", fetcher)
  const { data: dataProdutos } = useSWR<{ produtos: Produto[] }>("/api/produtos?limit=200", fetcher)

  const videomakers = dataVMs?.videomakers ?? []
  const editores = dataEds?.editores ?? []
  const produtos = dataProdutos?.produtos ?? []

  const temFiltrosAtivos = !!(filtroDepto || filtroVM || filtroEditor || filtroProduto)

  function limparFiltros() {
    setFiltroDepto("")
    setFiltroVM("")
    setFiltroEditor("")
    setFiltroProduto("")
  }

  const params = new URLSearchParams()
  if (search) params.set("search", search)
  if (filtroDepto) params.set("departamento", filtroDepto)
  if (filtroVM) params.set("videomakerId", filtroVM)
  if (filtroEditor) params.set("editorId", filtroEditor)
  if (filtroProduto) params.set("produtoId", filtroProduto)
  const url = `/api/demandas?${params}`

  const { data, mutate } = useSWR(url, fetcher, { refreshInterval: 15000 })
  const demandas = data?.demandas ?? []

  // Mapeamento coluna → statusInterno representativo (dispara notificações WhatsApp)
  const COLUNA_PARA_STATUS: Record<string, string> = {
    entrada: "aguardando_triagem",
    producao: "planejamento",
    edicao: "editando",
    aprovacao: "revisao_pendente",
    para_postar: "postagem_pendente",
    finalizado: "entregue_cliente",
  }

  function showToast(msg: string, tipo: "ok" | "erro") {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  const handleMove = useCallback(
    async (demandaId: string, novoStatusVisivel: string) => {
      const statusInterno = COLUNA_PARA_STATUS[novoStatusVisivel]
      if (!statusInterno) return

      // Salvar estado anterior para rollback
      const estadoAnterior = data

      // Optimistic update
      mutate(
        (prev: { demandas: Array<{ id: string; statusVisivel: string }> }) => ({
          ...prev,
          demandas: prev.demandas.map((d: { id: string; statusVisivel: string }) =>
            d.id === demandaId ? { ...d, statusVisivel: novoStatusVisivel } : d
          ),
        }),
        false
      )

      try {
        const res = await fetch(`/api/demandas/${demandaId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statusInterno, origem: "kanban" }),
        })

        if (!res.ok) {
          const erro = await res.json().catch(() => ({ error: "Erro desconhecido" }))
          // Rollback optimistic update
          mutate(estadoAnterior, false)
          showToast(erro.error || `Erro ao mover (${res.status})`, "erro")
          return
        }

        showToast("Card movido com sucesso", "ok")
        mutate()
      } catch (e) {
        // Rollback on network error
        mutate(estadoAnterior, false)
        showToast("Erro de conexão ao mover card", "erro")
      }
    },
    [mutate, data] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleDelete = useCallback(
    async (demandaId: string) => {
      if (!confirm("Tem certeza que deseja excluir esta demanda?")) return

      try {
        const res = await fetch(`/api/demandas/${demandaId}`, { method: "DELETE" })
        if (!res.ok) {
          const erro = await res.json().catch(() => ({ error: "Erro desconhecido" }))
          showToast(erro.error || "Erro ao excluir", "erro")
          return
        }
        showToast("Demanda excluída", "ok")
        mutate()
      } catch {
        showToast("Erro de conexão ao excluir", "erro")
      }
    },
    [mutate] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleDuplicate = useCallback(
    async (demandaId: string) => {
      try {
        const res = await fetch(`/api/demandas/${demandaId}/duplicate`, { method: "POST" })
        if (!res.ok) {
          const erro = await res.json().catch(() => ({ error: "Erro ao duplicar" }))
          showToast(erro.error || "Erro ao duplicar", "erro")
          return
        }
        showToast("Demanda duplicada! ✅", "ok")
        mutate()
      } catch {
        showToast("Erro de conexão ao duplicar", "erro")
      }
    },
    [mutate] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <>
      <Header
        title="Demandas"
        actions={
          <button
            onClick={() => setShowNovaDemandaModal(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Nova Demanda
          </button>
        }
      />

      {/* Toast de feedback */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white transition-all animate-in fade-in slide-in-from-top-2 ${
            toast.tipo === "ok" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Filtros */}
      <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar demanda..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500 w-56"
          />
        </div>
        <select value={filtroDepto} onChange={(e) => setFiltroDepto(e.target.value)}
          className="text-sm border border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-300">
          <option value="">Todos os departamentos</option>
          <option value="growth">Growth</option>
          <option value="eventos">Eventos</option>
          <option value="institucional">Institucional</option>
          <option value="rh">RH</option>
          <option value="comercial">Comercial</option>
          <option value="social_media">Social Media</option>
        </select>
        <select value={filtroVM} onChange={(e) => setFiltroVM(e.target.value)}
          className="text-sm border border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-300">
          <option value="">Todos videomakers</option>
          {videomakers.map(v => (<option key={v.id} value={v.id}>{v.nome}</option>))}
        </select>
        <select value={filtroEditor} onChange={(e) => setFiltroEditor(e.target.value)}
          className="text-sm border border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-300">
          <option value="">Todos editores</option>
          {editores.map(e => (<option key={e.id} value={e.id}>{e.nome}</option>))}
        </select>
        <select value={filtroProduto} onChange={(e) => setFiltroProduto(e.target.value)}
          className="text-sm border border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-300">
          <option value="">Todos produtos</option>
          {produtos.map(p => (<option key={p.id} value={p.id}>{p.nome}</option>))}
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

      {/* Kanban */}
      <div className="flex-1 p-4 overflow-auto">
        <KanbanBoard demandas={demandas} onMove={handleMove} onDelete={handleDelete} onDuplicate={handleDuplicate} />
      </div>

      {/* Modal Nova Demanda */}
      <NovaDemandaModal
        open={showNovaDemandaModal}
        onClose={() => setShowNovaDemandaModal(false)}
      />
    </>
  )
}
