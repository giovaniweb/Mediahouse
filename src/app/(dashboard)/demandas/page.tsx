"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { KanbanBoard } from "@/components/kanban/KanbanBoard"
import { Header } from "@/components/layout/Header"
import { Plus, Search, SlidersHorizontal } from "lucide-react"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function DemandasPage() {
  const [search, setSearch] = useState("")
  const [filtroDepto, setFiltroDepto] = useState("")

  const params = new URLSearchParams()
  if (search) params.set("search", search)
  if (filtroDepto) params.set("departamento", filtroDepto)
  const url = `/api/demandas?${params}`

  const { data, mutate } = useSWR(url, fetcher, { refreshInterval: 15000 })
  const demandas = data?.demandas ?? []

  const handleMove = useCallback(
    async (demandaId: string, novoStatus: string) => {
      // Optimistic update
      mutate(
        (prev: { demandas: Array<{ id: string; statusVisivel: string }> }) => ({
          ...prev,
          demandas: prev.demandas.map((d: { id: string; statusVisivel: string }) =>
            d.id === demandaId ? { ...d, statusVisivel: novoStatus } : d
          ),
        }),
        false
      )

      await fetch(`/api/demandas/${demandaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusVisivel: novoStatus }),
      })

      mutate()
    },
    [mutate]
  )

  return (
    <>
      <Header
        title="Demandas"
        actions={
          <Link href="/demandas/nova">
            <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Nova Demanda
            </button>
          </Link>
        }
      />

      {/* Filtros */}
      <div className="px-6 py-3 border-b bg-white flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar demanda..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-purple-200 w-56"
          />
        </div>
        <select
          value={filtroDepto}
          onChange={(e) => setFiltroDepto(e.target.value)}
          className="text-sm border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-purple-200 text-zinc-600"
        >
          <option value="">Todos os departamentos</option>
          <option value="growth">Growth</option>
          <option value="eventos">Eventos</option>
          <option value="institucional">Institucional</option>
          <option value="rh">RH</option>
          <option value="comercial">Comercial</option>
          <option value="social_media">Social Media</option>
        </select>
        <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
        <span className="text-xs text-zinc-500 ml-auto">{demandas.length} demandas</span>
      </div>

      {/* Kanban */}
      <div className="flex-1 p-4 overflow-auto">
        <KanbanBoard demandas={demandas} onMove={handleMove} />
      </div>
    </>
  )
}
