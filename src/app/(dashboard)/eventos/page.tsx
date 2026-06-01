"use client"

import { useState, useRef } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PartyPopper, Plus, Search, MapPin, Loader2, X, FileText, DollarSign, Clock, AlertTriangle, Activity, CheckCircle2 } from "lucide-react"
import { PECAS_AUDIOVISUAIS, pecasDefaultPara } from "@/lib/eventos-pecas"
import { PECAS_DESIGN, pecasDesignDefaultPara } from "@/lib/design-pecas"
import { toast } from "sonner"

type EventoLista = {
  id: string
  codigo: string
  nome: string
  tipo: string
  status: string
  cidade: string | null
  estado: string | null
  local: string | null
  dataInicio: string
  dataFim: string
  orcamentoPrevisto: number | null
  percentualConclusao: number
  coberturaId: string | null
  responsavel: { id: string; nome: string } | null
  _count: { demandas: number; checklist: number; documentos: number; custos: number }
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type DashboardEventos = {
  proximos: number; emProducao: number; atrasados: number; finalizados: number
  totalPrevisto: number; totalGasto: number; docsPendentes: number; pagamentosPendentes: number
}

// Kanban de eventos por status (drag nativo)
const COLUNAS_EVENTO = ["planejamento", "orcamento", "aprovacao", "producao", "execucao", "finalizado"]
function EventosKanban({ eventos, onMutate }: { eventos: EventoLista[]; onMutate: () => void }) {
  const router = useRouter()
  async function mover(id: string, status: string) {
    await fetch(`/api/eventos/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    onMutate(); toast.success("Status atualizado")
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {COLUNAS_EVENTO.map((col) => {
        const items = eventos.filter((e) => e.status === col)
        const st = STATUS_EVENTO_STYLE[col]
        return (
          <div key={col} className="flex-shrink-0 w-64 bg-zinc-900/50 rounded-xl border border-zinc-800"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); if (id) mover(id, col) }}>
            <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
              <span className="text-xs text-zinc-500">{items.length}</span>
            </div>
            <div className="p-2 space-y-2 min-h-[120px]">
              {items.map((ev) => (
                <div key={ev.id} draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", ev.id)}
                  onClick={() => router.push(`/eventos/${ev.id}`)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 cursor-pointer hover:border-zinc-700">
                  <p className="text-xs font-medium text-zinc-200 truncate">{ev.nome}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-zinc-500">{TIPO_EVENTO_LABEL[ev.tipo] ?? ev.tipo}</span>
                    <span className="text-[10px] text-purple-400 font-bold">{ev.percentualConclusao}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MiniCard({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alert ? "bg-red-950/20 border-red-800/40" : "bg-zinc-900 border-zinc-800"}`}>
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{icon}{label}</div>
      <div className={`text-lg font-bold ${alert ? "text-red-300" : "text-zinc-100"}`}>{value}</div>
    </div>
  )
}

export const TIPO_EVENTO_LABEL: Record<string, string> = {
  cafe: "Café", jantar: "Jantar", webinar: "Webinar", congresso: "Congresso",
  feira: "Feira", ativacao: "Ativação", unyque_experience: "Unyque Experience",
  treinamento: "Treinamento", lancamento: "Lançamento", evento_interno: "Evento Interno",
  evento_medicos: "Evento com Médicos", evento_fornecedores: "Evento com Fornecedores", outro: "Outro",
}

export const STATUS_EVENTO_STYLE: Record<string, { label: string; cls: string }> = {
  ideia: { label: "Ideia", cls: "bg-zinc-700 text-zinc-300" },
  planejamento: { label: "Planejamento", cls: "bg-blue-900/60 text-blue-300 border border-blue-700/50" },
  orcamento: { label: "Orçamento", cls: "bg-amber-900/60 text-amber-300 border border-amber-700/50" },
  aprovacao: { label: "Aprovação", cls: "bg-purple-900/60 text-purple-300 border border-purple-700/50" },
  producao: { label: "Produção", cls: "bg-indigo-900/60 text-indigo-300 border border-indigo-700/50" },
  execucao: { label: "Execução", cls: "bg-cyan-900/60 text-cyan-300 border border-cyan-700/50" },
  finalizado: { label: "Finalizado", cls: "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50" },
  cancelado: { label: "Cancelado", cls: "bg-red-900/60 text-red-300 border border-red-700/50" },
}

const fmtData = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"

export default function EventosPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("")
  const [showCriar, setShowCriar] = useState(false)
  const [view, setView] = useState<"lista" | "kanban">("lista")

  const qs = new URLSearchParams()
  if (search) qs.set("search", search)
  if (filtroStatus) qs.set("status", filtroStatus)
  const { data, mutate, isLoading } = useSWR<{ eventos: EventoLista[] }>(`/api/eventos?${qs}`, fetcher)
  const eventos = data?.eventos ?? []
  const { data: dash } = useSWR<DashboardEventos>("/api/eventos/dashboard", fetcher)

  const fmtMoneyShort = (n: number) => n >= 1000 ? `R$ ${(n / 1000).toFixed(1)}k` : `R$ ${n.toFixed(0)}`

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <PartyPopper className="w-6 h-6 text-purple-400" /> Eventos
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">Gestão completa de eventos — documentos, fornecedores, orçamento e audiovisual.</p>
        </div>
        <button onClick={() => setShowCriar(true)}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Novo Evento
        </button>
      </div>

      {/* Dashboard cards */}
      {dash && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MiniCard icon={<Clock className="w-4 h-4 text-blue-400" />} label="Próximos" value={String(dash.proximos)} />
          <MiniCard icon={<Activity className="w-4 h-4 text-indigo-400" />} label="Em produção" value={String(dash.emProducao)} />
          <MiniCard icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} label="Atrasados" value={String(dash.atrasados)} alert={dash.atrasados > 0} />
          <MiniCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} label="Finalizados" value={String(dash.finalizados)} />
          <MiniCard icon={<DollarSign className="w-4 h-4 text-zinc-400" />} label="Previsto" value={fmtMoneyShort(dash.totalPrevisto)} />
          <MiniCard icon={<DollarSign className="w-4 h-4 text-emerald-400" />} label="Gasto" value={fmtMoneyShort(dash.totalGasto)} />
          <MiniCard icon={<FileText className="w-4 h-4 text-amber-400" />} label="Docs pendentes" value={String(dash.docsPendentes)} alert={dash.docsPendentes > 0} />
          <MiniCard icon={<DollarSign className="w-4 h-4 text-red-400" />} label="Pagtos pendentes" value={String(dash.pagamentosPendentes)} alert={dash.pagamentosPendentes > 0} />
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar evento…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className={inputCls + " w-auto"}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_EVENTO_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
          <button onClick={() => setView("lista")} className={`px-3 py-2 text-xs ${view === "lista" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>Lista</button>
          <button onClick={() => setView("kanban")} className={`px-3 py-2 text-xs ${view === "kanban" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>Kanban</button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
      ) : eventos.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <PartyPopper className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhum evento ainda. Crie o primeiro!</p>
        </div>
      ) : view === "kanban" ? (
        <EventosKanban eventos={eventos} onMutate={mutate} />
      ) : (
        <div className="grid gap-3">
          {eventos.map((ev) => {
            const st = STATUS_EVENTO_STYLE[ev.status] ?? STATUS_EVENTO_STYLE.planejamento
            return (
              <Link key={ev.id} href={`/eventos/${ev.id}`}
                className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{TIPO_EVENTO_LABEL[ev.tipo] ?? ev.tipo}</span>
                      <span className="text-[10px] text-zinc-600 font-mono">{ev.codigo}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-100 mt-1.5 truncate">{ev.nome}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 flex-wrap">
                      <span>{fmtData(ev.dataInicio)} → {fmtData(ev.dataFim)}</span>
                      {ev.cidade && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.cidade}</span>}
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {ev._count.demandas} demandas</span>
                      {ev.orcamentoPrevisto ? <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {ev.orcamentoPrevisto.toLocaleString("pt-BR")}</span> : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-purple-400">{ev.percentualConclusao}%</div>
                    <div className="w-16 h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${ev.percentualConclusao}%` }} />
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {showCriar && (
        <CriarEventoModal
          onClose={() => setShowCriar(false)}
          onCreated={(id) => { setShowCriar(false); mutate(); router.push(`/eventos/${id}`) }}
        />
      )}
    </div>
  )
}

// Mapeia tipo do briefing (enum de cobertura) → tipo do evento de gestão
const TIPO_BRIEFING_MAP: Record<string, string> = {
  congresso: "congresso", feira: "feira", lancamento: "lancamento",
  evento_corporativo: "evento_interno", show: "outro", outro: "outro",
}

function CriarEventoModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({
    nome: "", tipo: "congresso", descricao: "", cidade: "", estado: "", local: "",
    dataInicio: "", dataFim: "", orcamentoPrevisto: "",
  })
  const [pecas, setPecas] = useState<string[]>(pecasDefaultPara("congresso"))
  const [pecasDesign, setPecasDesign] = useState<string[]>(pecasDesignDefaultPara("congresso"))
  const [saving, setSaving] = useState(false)
  const [importando, setImportando] = useState(false)
  const briefingRef = useRef<HTMLInputElement>(null)

  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const togglePeca = (k: string) => setPecas((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k])
  const togglePecaDesign = (k: string) => setPecasDesign((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k])

  // Ao trocar o tipo, re-sugere as peças padrão
  function onTipo(t: string) {
    upd("tipo", t)
    setPecas(pecasDefaultPara(t))
    setPecasDesign(pecasDesignDefaultPara(t))
  }

  // Importa dados de um briefing PDF via IA (reusa /api/coberturas/briefing)
  async function importarBriefing(file: File) {
    setImportando(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/coberturas/briefing", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Erro ao ler o briefing")
      const d = json.dados as {
        titulo: string; tipo: string; cliente: string | null; local: string | null
        cidade: string | null; dataInicio: string; dataFim: string; descricao: string | null
      }
      const tipoMapeado = TIPO_BRIEFING_MAP[d.tipo] ?? "outro"
      setForm((f) => ({
        ...f,
        nome: d.titulo ?? f.nome,
        tipo: tipoMapeado,
        descricao: d.descricao ?? f.descricao,
        cidade: d.cidade ?? f.cidade,
        local: d.local ?? f.local,
        dataInicio: d.dataInicio ?? f.dataInicio,
        dataFim: d.dataFim ?? f.dataFim,
      }))
      setPecas(pecasDefaultPara(tipoMapeado))
      setPecasDesign(pecasDesignDefaultPara(tipoMapeado))
      toast.success("Briefing importado! Revise os dados antes de salvar.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao importar briefing")
    } finally { setImportando(false) }
  }

  async function salvar() {
    if (!form.nome.trim() || !form.dataInicio) { toast.error("Nome e data inicial são obrigatórios"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, pecas, pecasDesign }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Erro ao criar evento")
      toast.success(`Evento criado! ${json.demandasCriadas} demanda(s) gerada(s).`)
      onCreated(json.evento.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar evento")
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-100">Novo Evento</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Importar de briefing PDF */}
        <input ref={briefingRef} type="file" accept="application/pdf" className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) importarBriefing(file) }} />
        <button onClick={() => briefingRef.current?.click()} disabled={importando}
          className="w-full mb-4 flex items-center justify-center gap-2 text-xs border border-dashed border-zinc-700 hover:border-purple-600 text-zinc-400 hover:text-purple-300 py-2.5 rounded-lg transition-colors disabled:opacity-50">
          {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {importando ? "Lendo briefing com IA…" : "📄 Importar de briefing PDF (IA preenche os campos)"}
        </button>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nome do evento *</label>
            <input value={form.nome} onChange={(e) => upd("nome", e.target.value)} placeholder="Ex: Congresso Brasileiro de Cardiologia 2026" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Tipo</label>
              <select value={form.tipo} onChange={(e) => onTipo(e.target.value)} className={inputCls}>
                {Object.entries(TIPO_EVENTO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Orçamento previsto (R$)</label>
              <input type="number" value={form.orcamentoPrevisto} onChange={(e) => upd("orcamentoPrevisto", e.target.value)} placeholder="0" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Data inicial *</label>
              <input type="date" value={form.dataInicio} onChange={(e) => upd("dataInicio", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Data final</label>
              <input type="date" value={form.dataFim} onChange={(e) => upd("dataFim", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Cidade</label>
              <input value={form.cidade} onChange={(e) => upd("cidade", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Estado</label>
              <input value={form.estado} onChange={(e) => upd("estado", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Local</label>
              <input value={form.local} onChange={(e) => upd("local", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Descrição</label>
            <textarea value={form.descricao} onChange={(e) => upd("descricao", e.target.value)} rows={2} className={inputCls} />
          </div>

          {/* Peças audiovisuais → demandas */}
          <div className="pt-1">
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              🎬 Peças audiovisuais a produzir <span className="text-zinc-500 font-normal">(cada uma vira uma demanda para o videomaker)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PECAS_AUDIOVISUAIS.map((p) => {
                const on = pecas.includes(p.key)
                return (
                  <button key={p.key} type="button" onClick={() => togglePeca(p.key)}
                    className={`flex items-center gap-2 text-left px-3 py-2 rounded-lg border text-xs transition-colors ${on ? "bg-purple-600/20 border-purple-600/50 text-purple-200" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"}`}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-purple-500 border-purple-500" : "border-zinc-600"}`}>
                      {on && <span className="text-white text-[10px]">✓</span>}
                    </span>
                    {p.label}{p.criaCobertura ? " 🎥" : ""}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Peças de design → demandas (área design) */}
          <div className="pt-1">
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              🎨 Peças de design a produzir <span className="text-zinc-500 font-normal">(cada uma vira uma demanda para o designer)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PECAS_DESIGN.map((p) => {
                const on = pecasDesign.includes(p.key)
                return (
                  <button key={p.key} type="button" onClick={() => togglePecaDesign(p.key)}
                    className={`flex items-center gap-2 text-left px-3 py-2 rounded-lg border text-xs transition-colors ${on ? "bg-pink-600/20 border-pink-600/50 text-pink-200" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"}`}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-pink-500 border-pink-500" : "border-zinc-600"}`}>
                      {on && <span className="text-white text-[10px]">✓</span>}
                    </span>
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800">Cancelar</button>
          <button onClick={salvar} disabled={saving}
            className="flex-1 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar Evento
          </button>
        </div>
      </div>
    </div>
  )
}
