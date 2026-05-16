"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarRange, Plus, Search, Users, Upload, CheckSquare, MapPin, Clock, ChevronRight, FileText, Loader2, X, ChevronDown } from "lucide-react"
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

// ─── Tipos para o extrato do briefing ────────────────────────────────────────

interface ProgramacaoDia {
  dia: number
  data: string
  titulo: string
  momentos: string[]
}

interface ChecklistItem {
  texto: string
  categoria: string
}

interface ExtratoEvento {
  titulo: string
  tipo: string
  cliente: string | null
  local: string | null
  cidade: string | null
  dataInicio: string
  dataFim: string
  descricao: string | null
  programacaoPorDia: ProgramacaoDia[]
  checklistEspecifico: ChecklistItem[]
  logistica: { hotel: string | null; transporte: string | null } | null
}

// ─── Modal de criação via Briefing PDF ───────────────────────────────────────

function BriefingModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [etapa, setEtapa] = useState<"upload" | "carregando" | "preview" | "criando">("upload")
  const [extrato, setExtrato] = useState<ExtratoEvento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [editado, setEditado] = useState<Partial<ExtratoEvento>>({})
  const [showProgramacao, setShowProgramacao] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [dragging, setDragging] = useState(false)

  const inputClass =
    "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500"

  // Faz upload do PDF e chama a API de extração
  const uploadBriefing = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      setErro("O arquivo deve ser um PDF.")
      return
    }
    setErro(null)
    setEtapa("carregando")
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/coberturas/briefing", { method: "POST", body: form })
      const json = await res.json().catch(() => ({ error: "Resposta inválida do servidor" }))
      if (!res.ok) throw new Error(json.error ?? `Erro HTTP ${res.status}`)
      setExtrato(json.dados as ExtratoEvento)
      setEditado({})
      setEtapa("preview")
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao processar o briefing")
      setEtapa("upload")
    }
  }, [])

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) uploadBriefing(file)
    },
    [uploadBriefing]
  )

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadBriefing(file)
  }

  const dadosFinais = extrato ? { ...extrato, ...editado } : null

  const confirmarCriacao = async () => {
    if (!dadosFinais) return
    setEtapa("criando")
    try {
      const totalDias =
        dadosFinais.dataInicio && dadosFinais.dataFim
          ? Math.max(
              1,
              Math.round(
                (new Date(dadosFinais.dataFim).getTime() - new Date(dadosFinais.dataInicio).getTime()) /
                  (1000 * 60 * 60 * 24)
              ) + 1
            )
          : 1

      const res = await fetch("/api/coberturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: dadosFinais.titulo,
          tipo: dadosFinais.tipo,
          cliente: dadosFinais.cliente,
          local: dadosFinais.local,
          cidade: dadosFinais.cidade,
          dataInicio: dadosFinais.dataInicio,
          dataFim: dadosFinais.dataFim,
          descricao: dadosFinais.descricao,
          totalDias,
          checklistExtra: dadosFinais.checklistEspecifico,
          programacaoPorDia: dadosFinais.programacaoPorDia,
        }),
      })
      const json = await res.json().catch(() => ({ error: "Erro ao criar evento" }))
      if (!res.ok) throw new Error(json.error ?? "Erro ao criar evento")
      onCreated(json.cobertura.id as string)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar evento")
      setEtapa("preview")
    }
  }

  const tipoOptions = [
    { value: "congresso", label: "Congresso" },
    { value: "feira", label: "Feira" },
    { value: "evento_corporativo", label: "Evento Corporativo" },
    { value: "show", label: "Show" },
    { value: "lancamento", label: "Lançamento" },
    { value: "outro", label: "Outro" },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-400" />
            <h2 className="text-base font-semibold text-white">Criar Evento via Briefing PDF</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Etapa 1 — Upload */}
          {(etapa === "upload" || etapa === "carregando") && (
            <div className="p-6 space-y-4">
              {etapa === "carregando" ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-zinc-200">Claude está lendo o briefing...</p>
                    <p className="text-xs text-zinc-500 mt-1">Isso pode levar alguns segundos</p>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => document.getElementById("briefing-file-input")?.click()}
                    className={cn(
                      "border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors",
                      dragging
                        ? "border-teal-500 bg-teal-500/5"
                        : "border-zinc-700 hover:border-teal-600 hover:bg-teal-500/5"
                    )}
                  >
                    <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-teal-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-zinc-200">Arraste o PDF do briefing aqui</p>
                      <p className="text-xs text-zinc-500 mt-1">ou clique para selecionar · máximo 20 MB</p>
                    </div>
                    <input
                      id="briefing-file-input"
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={handleFileInput}
                    />
                  </div>
                  {erro && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                      {erro}
                    </div>
                  )}
                  <p className="text-xs text-zinc-500 text-center">
                    O Claude irá extrair: título, datas, local, cliente, programação por dia e checklist específico.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Etapa 2 — Preview / edição */}
          {(etapa === "preview" || etapa === "criando") && dadosFinais && (
            <div className="p-6 space-y-5">
              {erro && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                  {erro}
                </div>
              )}

              <div className="bg-teal-500/5 border border-teal-500/20 rounded-lg px-4 py-3">
                <p className="text-xs text-teal-400 font-medium">✅ Briefing lido com sucesso! Revise os dados abaixo antes de criar o evento.</p>
              </div>

              {/* Título */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Título *</label>
                <input
                  value={dadosFinais.titulo ?? ""}
                  onChange={(e) => setEditado((prev) => ({ ...prev, titulo: e.target.value }))}
                  className={inputClass}
                />
              </div>

              {/* Tipo + Cliente */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Tipo</label>
                  <select
                    value={dadosFinais.tipo ?? "outro"}
                    onChange={(e) => setEditado((prev) => ({ ...prev, tipo: e.target.value }))}
                    className={inputClass}
                  >
                    {tipoOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Cliente</label>
                  <input
                    value={dadosFinais.cliente ?? ""}
                    onChange={(e) => setEditado((prev) => ({ ...prev, cliente: e.target.value }))}
                    placeholder="Nome do cliente"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Local + Cidade */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Local</label>
                  <input
                    value={dadosFinais.local ?? ""}
                    onChange={(e) => setEditado((prev) => ({ ...prev, local: e.target.value }))}
                    placeholder="Venue / Espaço"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Cidade</label>
                  <input
                    value={dadosFinais.cidade ?? ""}
                    onChange={(e) => setEditado((prev) => ({ ...prev, cidade: e.target.value }))}
                    placeholder="Cidade / UF"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Datas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Data Início *</label>
                  <input
                    type="date"
                    value={dadosFinais.dataInicio ?? ""}
                    onChange={(e) => setEditado((prev) => ({ ...prev, dataInicio: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Data Fim *</label>
                  <input
                    type="date"
                    value={dadosFinais.dataFim ?? ""}
                    onChange={(e) => setEditado((prev) => ({ ...prev, dataFim: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Descrição</label>
                <textarea
                  rows={3}
                  value={dadosFinais.descricao ?? ""}
                  onChange={(e) => setEditado((prev) => ({ ...prev, descricao: e.target.value }))}
                  className={cn(inputClass, "resize-none")}
                  placeholder="Descrição do evento..."
                />
              </div>

              {/* Programação extraída */}
              {dadosFinais.programacaoPorDia.length > 0 && (
                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowProgramacao((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className="font-medium">
                      📅 Programação extraída ({dadosFinais.programacaoPorDia.length} dia{dadosFinais.programacaoPorDia.length > 1 ? "s" : ""})
                    </span>
                    <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform", showProgramacao && "rotate-180")} />
                  </button>
                  {showProgramacao && (
                    <div className="px-4 pb-4 space-y-3 border-t border-zinc-800">
                      {dadosFinais.programacaoPorDia.map((d) => (
                        <div key={d.dia} className="pt-3">
                          <p className="text-xs font-semibold text-teal-400 mb-1.5">
                            Dia {d.dia} — {d.titulo}
                          </p>
                          <ul className="space-y-1">
                            {d.momentos.map((m, i) => (
                              <li key={i} className="text-xs text-zinc-400 flex gap-2">
                                <span className="text-zinc-600">•</span>
                                {m}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Checklist específico */}
              {dadosFinais.checklistEspecifico.length > 0 && (
                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowChecklist((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className="font-medium">
                      ✅ Checklist específico ({dadosFinais.checklistEspecifico.length} item{dadosFinais.checklistEspecifico.length > 1 ? "s" : ""})
                    </span>
                    <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform", showChecklist && "rotate-180")} />
                  </button>
                  {showChecklist && (
                    <div className="px-4 pb-4 border-t border-zinc-800">
                      <ul className="pt-3 space-y-2">
                        {dadosFinais.checklistEspecifico.map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full mt-0.5 shrink-0">
                              {item.categoria}
                            </span>
                            <span className="text-xs text-zinc-300">{item.texto}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Logística extraída */}
              {dadosFinais.logistica && (dadosFinais.logistica.hotel || dadosFinais.logistica.transporte) && (
                <div className="bg-zinc-800/50 rounded-xl p-4 space-y-1.5">
                  <p className="text-xs font-semibold text-zinc-400 mb-2">🏨 Logística extraída</p>
                  {dadosFinais.logistica.hotel && (
                    <p className="text-xs text-zinc-300">
                      <span className="text-zinc-500">Hotel: </span>{dadosFinais.logistica.hotel}
                    </p>
                  )}
                  {dadosFinais.logistica.transporte && (
                    <p className="text-xs text-zinc-300">
                      <span className="text-zinc-500">Transporte: </span>{dadosFinais.logistica.transporte}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-zinc-800 p-4 flex gap-2">
          {etapa === "preview" && (
            <>
              <button
                type="button"
                onClick={() => { setEtapa("upload"); setExtrato(null); setErro(null) }}
                className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white text-sm transition-colors"
              >
                ← Novo PDF
              </button>
              <button
                type="button"
                onClick={confirmarCriacao}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors"
              >
                Criar Evento
              </button>
            </>
          )}
          {etapa === "criando" && (
            <div className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-teal-600/50 text-white text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Criando evento...
            </div>
          )}
          {(etapa === "upload" || etapa === "carregando") && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white text-sm transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal de criação manual ──────────────────────────────────────────────────

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
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      // Calcular totalDias automaticamente a partir das datas
      const totalDias =
        form.dataInicio && form.dataFim
          ? Math.max(
              1,
              Math.round(
                (new Date(form.dataFim).getTime() - new Date(form.dataInicio).getTime()) /
                  (1000 * 60 * 60 * 24)
              ) + 1
            )
          : 1

      const res = await fetch("/api/coberturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, totalDias }),
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
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [showBriefingModal, setShowBriefingModal] = useState(false)

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

  const handleBriefingCreated = (id: string) => {
    setShowBriefingModal(false)
    mutate()
    router.push(`/eventos/${id}`)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {showModal && (
        <NovaCoberturaModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}
      {showBriefingModal && (
        <BriefingModal onClose={() => setShowBriefingModal(false)} onCreated={handleBriefingCreated} />
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBriefingModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <FileText className="w-4 h-4" />
            Criar via Briefing
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Evento
          </button>
        </div>
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
