"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { CalendarRange, Plus, Search, Users, Upload, CheckSquare, MapPin, Clock, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

type Cobertura = {
  id: string
  titulo: string
  slug: string
  tipo: string
  status: string
  cliente: string | null
  local: string | null
  cidade: string | null
  dataInicio: string
  dataFim: string
  totalDias: number
  produto: { id: string; nome: string } | null
  _count: { uploads: number; equipe: number; checklist: number }
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const TIPO_LABEL: Record<string, string> = {
  congresso: "Congresso",
  feira: "Feira",
  evento_corporativo: "Corporativo",
  show: "Show",
  lancamento: "Lançamento",
  outro: "Outro",
}

const STATUS_STYLE: Record<string, string> = {
  planejamento: "bg-zinc-700 text-zinc-300",
  em_andamento: "bg-blue-900/60 text-blue-300 border border-blue-700/50",
  concluido: "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50",
  cancelado: "bg-red-900/40 text-red-400",
}

const STATUS_LABEL: Record<string, string> = {
  planejamento: "Planejamento",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
}

function NovaCoberturaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    titulo: "",
    tipo: "outro",
    cliente: "",
    local: "",
    cidade: "",
    dataInicio: "",
    dataFim: "",
    totalDias: 1,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/coberturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao criar" }))
        throw new Error(err.error ?? "Erro ao criar")
      }
      onCreated()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao criar evento")
      setSaving(false)
    }
  }

  const inputClass =
    "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white">Novo Evento de Cobertura</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Título *</label>
            <input
              required
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder="Ex: Congresso Nacional de Cardiologia 2026"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                className={inputClass}
              >
                {Object.entries(TIPO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Nº de Dias</label>
              <input
                type="number"
                min={1}
                max={30}
                value={form.totalDias}
                onChange={(e) => setForm((f) => ({ ...f, totalDias: parseInt(e.target.value) || 1 }))}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Cliente</label>
            <input
              value={form.cliente}
              onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
              placeholder="Nome do cliente ou contratante"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Local / Espaço</label>
              <input
                value={form.local}
                onChange={(e) => setForm((f) => ({ ...f, local: e.target.value }))}
                placeholder="Centro de Convenções"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Cidade</label>
              <input
                value={form.cidade}
                onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
                placeholder="São Paulo / SP"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Data Início *</label>
              <input
                required
                type="date"
                value={form.dataInicio}
                onChange={(e) => setForm((f) => ({ ...f, dataInicio: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Data Fim *</label>
              <input
                required
                type="date"
                value={form.dataFim}
                onChange={(e) => setForm((f) => ({ ...f, dataFim: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? "Criando..." : "Criar Evento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function EventosPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [showModal, setShowModal] = useState(false)

  const params = new URLSearchParams()
  if (search) params.set("search", search)
  if (statusFilter) params.set("status", statusFilter)

  const { data, mutate } = useSWR<{ coberturas: Cobertura[] }>(
    `/api/coberturas?${params}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  const coberturas = data?.coberturas ?? []

  const handleCreated = () => {
    setShowModal(false)
    mutate()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {showModal && (
        <NovaCoberturaModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600/20 flex items-center justify-center">
            <CalendarRange className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Eventos & Coberturas</h1>
            <p className="text-xs text-zinc-500">{coberturas.length} evento(s)</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Evento
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar evento..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none"
        >
          <option value="">Todos os status</option>
          <option value="planejamento">Planejamento</option>
          <option value="em_andamento">Em andamento</option>
          <option value="concluido">Concluído</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {/* Lista */}
      {coberturas.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <CalendarRange className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum evento encontrado.</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-3 text-purple-400 hover:text-purple-300 text-sm"
          >
            Criar primeiro evento →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {coberturas.map((c) => {
            const dias = Math.ceil(
              (new Date(c.dataFim).getTime() - new Date(c.dataInicio).getTime()) / (1000 * 60 * 60 * 24)
            ) + 1
            const dataFormatada = new Date(c.dataInicio).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })

            return (
              <Link
                key={c.id}
                href={`/eventos/${c.id}`}
                className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_STYLE[c.status])}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                      <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                        {TIPO_LABEL[c.tipo] ?? c.tipo}
                      </span>
                      {c.produto && (
                        <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                          {c.produto.nome}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors truncate">
                      {c.titulo}
                    </h3>
                    {c.cliente && (
                      <p className="text-xs text-zinc-500 mt-0.5">{c.cliente}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Clock className="w-3 h-3" />
                        {dataFormatada} · {dias} dia(s)
                      </span>
                      {(c.local || c.cidade) && (
                        <span className="flex items-center gap-1 text-xs text-zinc-500">
                          <MapPin className="w-3 h-3" />
                          {[c.local, c.cidade].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <Users className="w-3.5 h-3.5" />
                      {c._count.equipe}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <Upload className="w-3.5 h-3.5" />
                      {c._count.uploads}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <CheckSquare className="w-3.5 h-3.5" />
                      {c._count.checklist}
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
