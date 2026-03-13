"use client"

import { useState, useMemo } from "react"
import { Header } from "@/components/layout/Header"
import {
  ChevronLeft, ChevronRight, Plus, X, Building2, Briefcase,
  User, Film, Calendar, Clock, MapPin, AlertTriangle, Sparkles,
} from "lucide-react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek,
  isToday, parseISO, differenceInDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Evento {
  id: string; titulo: string; descricao?: string
  inicio: string; fim: string; diaTodo: boolean
  tipo: string; contexto: string; status: string
  privado: boolean; cor?: string; local?: string
  demanda?: { id: string; codigo: string; titulo: string } | null
  usuario?: { nome: string } | null
  videomaker?: { nome: string } | null
}

const CONTEXTO_CONFIG: Record<string, { label: string; cor: string; icon: React.ElementType; textCor: string }> = {
  contourline: { label: "Contourline", cor: "bg-blue-500", textCor: "text-blue-700", icon: Building2 },
  freelance:   { label: "Freelance",   cor: "bg-green-500", textCor: "text-green-700", icon: Briefcase },
  pessoal:     { label: "Pessoal",     cor: "bg-purple-500", textCor: "text-purple-700", icon: User },
  sistema:     { label: "Sistema",     cor: "bg-zinc-400", textCor: "text-zinc-600", icon: Film },
}

const TIPO_OPTS = [
  { value: "captacao", label: "Captação" },
  { value: "edicao", label: "Edição" },
  { value: "reuniao", label: "Reunião" },
  { value: "freelance", label: "Freelance" },
  { value: "pessoal", label: "Pessoal" },
  { value: "empresa", label: "Empresa" },
  { value: "prazo", label: "Prazo" },
  { value: "outro", label: "Outro" },
]

const CONTEXTO_OPTS = [
  { value: "contourline", label: "🏢 Contourline (prioridade máxima)" },
  { value: "freelance", label: "💼 Freelance" },
  { value: "pessoal", label: "👤 Pessoal (admin)" },
  { value: "sistema", label: "⚙️ Sistema" },
]

const COR_DEFAULTS: Record<string, string> = {
  contourline: "#3b82f6",
  freelance: "#22c55e",
  pessoal: "#a855f7",
  sistema: "#71717a",
}

export default function AgendaPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.tipo === "admin"

  const [mesAtual, setMesAtual] = useState(new Date())
  const [diaSelec, setDiaSelec] = useState<Date | null>(new Date())
  const [showForm, setShowForm] = useState(false)
  const [eventoSelec, setEventoSelec] = useState<Evento | null>(null)
  const [filtroCtx, setFiltroCtx] = useState<string>("todas")

  const inicioMes = startOfMonth(mesAtual)
  const fimMes = endOfMonth(mesAtual)
  const inicioGrid = startOfWeek(inicioMes, { locale: ptBR })
  const fimGrid = endOfWeek(fimMes, { locale: ptBR })
  const diasGrid = eachDayOfInterval({ start: inicioGrid, end: fimGrid })

  const qsInicio = format(inicioGrid, "yyyy-MM-dd")
  const qsFim = format(fimGrid, "yyyy-MM-dd")

  const { data, mutate } = useSWR<{ eventos: Evento[] }>(
    `/api/agenda?inicio=${qsInicio}&fim=${qsFim}`,
    fetcher
  )

  const eventos = useMemo(() => {
    const evts = data?.eventos ?? []
    if (filtroCtx === "todas") return evts
    return evts.filter(e => e.contexto === filtroCtx)
  }, [data, filtroCtx])

  const eventosNoDia = (dia: Date) =>
    eventos.filter(e => isSameDay(parseISO(e.inicio), dia))

  const eventosDoSelecionado = diaSelec ? eventosNoDia(diaSelec) : []

  // Detecta conflitos (eventos sobrepostos em dias com contourline + freelance)
  const conflitos = useMemo(() => {
    const porDia = new Map<string, Evento[]>()
    eventos.forEach(e => {
      const key = format(parseISO(e.inicio), "yyyy-MM-dd")
      porDia.set(key, [...(porDia.get(key) ?? []), e])
    })
    const dias: string[] = []
    porDia.forEach((evts, dia) => {
      const ctxs = new Set(evts.map(e => e.contexto))
      if (ctxs.has("contourline") && ctxs.has("freelance")) dias.push(dia)
    })
    return dias
  }, [eventos])

  // Form
  const [form, setForm] = useState({
    titulo: "", descricao: "", inicio: diaSelec ? format(diaSelec, "yyyy-MM-dd") + "T09:00" : "",
    fim: diaSelec ? format(diaSelec, "yyyy-MM-dd") + "T10:00" : "",
    tipo: "reuniao", contexto: "contourline", privado: false, local: "",
  })

  function setF(f: string, v: unknown) { setForm(prev => ({ ...prev, [f]: v })) }

  function abrirForm(dia?: Date) {
    const d = dia ?? diaSelec ?? new Date()
    setForm({
      titulo: "", descricao: "",
      inicio: format(d, "yyyy-MM-dd") + "T09:00",
      fim: format(d, "yyyy-MM-dd") + "T10:00",
      tipo: "reuniao", contexto: "contourline", privado: false, local: "",
    })
    setShowForm(true)
  }

  async function criarEvento() {
    const res = await fetch("/api/agenda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, cor: COR_DEFAULTS[form.contexto] }),
    })
    if (res.ok) { mutate(); setShowForm(false) }
  }

  async function deletarEvento(id: string) {
    await fetch(`/api/agenda/${id}`, { method: "DELETE" })
    mutate()
    setEventoSelec(null)
  }

  return (
    <>
      <Header
        title="Agenda"
        actions={
          <button onClick={() => abrirForm()} className="flex items-center gap-1.5 bg-zinc-900 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-zinc-700">
            <Plus className="w-3.5 h-3.5" /> Novo Evento
          </button>
        }
      />
      <main className="flex-1 p-4 flex gap-4 overflow-hidden">
        {/* COLUNA ESQUERDA — Calendário */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Controles */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setMesAtual(m => subMonths(m, 1))} className="p-1.5 hover:bg-zinc-100 rounded-lg">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-semibold text-zinc-800 capitalize min-w-36 text-center">
                {format(mesAtual, "MMMM yyyy", { locale: ptBR })}
              </h2>
              <button onClick={() => setMesAtual(m => addMonths(m, 1))} className="p-1.5 hover:bg-zinc-100 rounded-lg">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setMesAtual(new Date())} className="text-xs text-zinc-500 hover:text-zinc-800 ml-2 border border-zinc-200 px-2 py-1 rounded-lg">Hoje</button>
            </div>

            {/* Filtros de contexto */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => setFiltroCtx("todas")} className={cn("text-xs px-2.5 py-1 rounded-full border transition-colors",
                filtroCtx === "todas" ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-200 text-zinc-500 hover:border-zinc-400")}>
                Todos
              </button>
              {Object.entries(CONTEXTO_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon
                return (
                  <button key={key} onClick={() => setFiltroCtx(key)}
                    className={cn("flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors",
                      filtroCtx === key ? `${cfg.cor} text-white border-transparent` : "border-zinc-200 text-zinc-500 hover:border-zinc-400")}>
                    <Icon className="w-3 h-3" />{cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Alertas de conflito */}
          {conflitos.length > 0 && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mb-3 text-xs text-orange-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                Conflito detectado em: {conflitos.map(d => format(parseISO(d), "dd/MM", { locale: ptBR })).join(", ")} —
                Contourline tem prioridade sobre eventos freelance.
              </span>
            </div>
          )}

          {/* Grid */}
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden flex-1">
            {/* Cabeçalho dias da semana */}
            <div className="grid grid-cols-7 border-b border-zinc-100">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
                <div key={d} className="text-center text-xs font-semibold text-zinc-400 py-2">{d}</div>
              ))}
            </div>

            {/* Células */}
            <div className="grid grid-cols-7">
              {diasGrid.map((dia, i) => {
                const evts = eventosNoDia(dia)
                const isSelec = diaSelec && isSameDay(dia, diaSelec)
                const isMes = isSameMonth(dia, mesAtual)
                const temConflito = conflitos.includes(format(dia, "yyyy-MM-dd"))

                return (
                  <div
                    key={i}
                    onClick={() => setDiaSelec(dia)}
                    className={cn(
                      "min-h-[80px] p-1.5 border-b border-r border-zinc-100 cursor-pointer transition-colors",
                      !isMes && "bg-zinc-50/50",
                      isSelec && "bg-blue-50 ring-1 ring-inset ring-blue-200",
                      isToday(dia) && !isSelec && "bg-amber-50/50",
                      "hover:bg-zinc-50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                        isToday(dia) ? "bg-zinc-900 text-white" :
                        isSelec ? "text-blue-700 font-bold" :
                        !isMes ? "text-zinc-300" : "text-zinc-700"
                      )}>
                        {format(dia, "d")}
                      </span>
                      {temConflito && <AlertTriangle className="w-3 h-3 text-orange-500" />}
                    </div>

                    <div className="space-y-0.5">
                      {evts.slice(0, 3).map(e => {
                        const cfg = CONTEXTO_CONFIG[e.contexto]
                        return (
                          <div key={e.id}
                            onClick={(ev) => { ev.stopPropagation(); setEventoSelec(e) }}
                            style={{ backgroundColor: e.cor ?? "#71717a" }}
                            className="text-white text-[10px] px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80">
                            {e.titulo}
                          </div>
                        )
                      })}
                      {evts.length > 3 && <div className="text-[10px] text-zinc-400 pl-1">+{evts.length - 3}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 mt-3">
            {Object.entries(CONTEXTO_CONFIG).map(([key, cfg]) => {
              const Icon = cfg.icon
              return (
                <div key={key} className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <div className={cn("w-2.5 h-2.5 rounded-full", cfg.cor)} />
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </div>
              )
            })}
          </div>
        </div>

        {/* COLUNA DIREITA — Eventos do dia selecionado */}
        <div className="w-72 shrink-0 flex flex-col gap-3">
          {diaSelec && (
            <div className="bg-white border border-zinc-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-zinc-800 text-sm">
                  {format(diaSelec, "EEEE, d 'de' MMMM", { locale: ptBR })}
                </h3>
                <button onClick={() => abrirForm(diaSelec)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {eventosDoSelecionado.length === 0 ? (
                <div className="text-center py-6">
                  <Calendar className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400">Nenhum evento</p>
                  <button onClick={() => abrirForm(diaSelec)} className="text-xs text-blue-500 hover:underline mt-1">
                    + Adicionar
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {eventosDoSelecionado.map(e => {
                    const cfg = CONTEXTO_CONFIG[e.contexto]
                    const Icon = cfg?.icon ?? Film
                    return (
                      <div key={e.id}
                        onClick={() => setEventoSelec(e)}
                        style={{ borderLeftColor: e.cor ?? "#71717a" }}
                        className="border-l-4 pl-3 py-2 cursor-pointer hover:bg-zinc-50 rounded-r-lg transition-colors">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Icon className="w-3 h-3 text-zinc-400" />
                          <span className={cn("text-[10px] font-semibold uppercase tracking-wide", cfg?.textCor ?? "text-zinc-500")}>
                            {cfg?.label}
                          </span>
                          {e.privado && <span className="text-[10px] text-zinc-400">• privado</span>}
                        </div>
                        <p className="text-xs font-medium text-zinc-800">{e.titulo}</p>
                        {!e.diaTodo && (
                          <p className="text-[10px] text-zinc-400">
                            {format(parseISO(e.inicio), "HH:mm")} – {format(parseISO(e.fim), "HH:mm")}
                          </p>
                        )}
                        {e.local && <p className="text-[10px] text-zinc-400">📍 {e.local}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Próximos conflitos */}
          {isAdmin && conflitos.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <h3 className="text-sm font-semibold text-orange-700">Conflitos de Agenda</h3>
              </div>
              {conflitos.slice(0, 3).map(d => (
                <div key={d} className="text-xs text-orange-600 py-1 border-b border-orange-100 last:border-0">
                  <span className="font-medium">{format(parseISO(d), "dd/MM", { locale: ptBR })}</span>
                  {" — "} Contourline + Freelance sobrepostos
                </div>
              ))}
              <p className="text-[10px] text-orange-500 mt-2">Contourline tem prioridade absoluta.</p>
            </div>
          )}
        </div>
      </main>

      {/* Modal detalhe evento */}
      {eventoSelec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            {(() => {
              const cfg = CONTEXTO_CONFIG[eventoSelec.contexto]
              const Icon = cfg?.icon ?? Film
              return (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div style={{ backgroundColor: eventoSelec.cor ?? "#71717a" }} className="w-3 h-3 rounded-full" />
                        <span className={cn("text-xs font-semibold uppercase", cfg?.textCor ?? "text-zinc-500")}>{cfg?.label}</span>
                      </div>
                      <h3 className="font-bold text-zinc-800">{eventoSelec.titulo}</h3>
                    </div>
                    <button onClick={() => setEventoSelec(null)} className="text-zinc-400 hover:text-zinc-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2 text-sm text-zinc-600 mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      {eventoSelec.diaTodo
                        ? format(parseISO(eventoSelec.inicio), "dd/MM/yyyy", { locale: ptBR })
                        : `${format(parseISO(eventoSelec.inicio), "dd/MM HH:mm")} — ${format(parseISO(eventoSelec.fim), "HH:mm")}`
                      }
                    </div>
                    {eventoSelec.local && (
                      <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-zinc-400" />{eventoSelec.local}</div>
                    )}
                    {eventoSelec.descricao && (
                      <p className="text-xs text-zinc-500 leading-relaxed">{eventoSelec.descricao}</p>
                    )}
                    {eventoSelec.demanda && (
                      <div className="bg-zinc-50 rounded-lg px-3 py-2 text-xs">
                        <span className="text-zinc-400">Demanda: </span>
                        <span className="font-medium">{eventoSelec.demanda.codigo}</span>
                        {" — "}{eventoSelec.demanda.titulo}
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <button onClick={() => deletarEvento(eventoSelec.id)}
                      className="w-full border border-red-200 text-red-600 text-sm py-2 rounded-xl hover:bg-red-50">
                      Excluir evento
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Modal criar evento */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-zinc-800">Novo Evento</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-zinc-400" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Título *</label>
                <input className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
                  value={form.titulo} onChange={e => setF("titulo", e.target.value)} placeholder="Nome do evento" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500 block mb-1">Tipo</label>
                  <select className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
                    value={form.tipo} onChange={e => setF("tipo", e.target.value)}>
                    {TIPO_OPTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 block mb-1">Contexto</label>
                  <select className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
                    value={form.contexto} onChange={e => setF("contexto", e.target.value)}>
                    {CONTEXTO_OPTS
                      .filter(c => isAdmin || c.value !== "pessoal")
                      .map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {form.contexto === "pessoal" && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 text-xs text-purple-700 flex items-start gap-2">
                  <User className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Evento privado — visível apenas para você como administrador.
                </div>
              )}
              {form.contexto === "freelance" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Lembre-se: Contourline tem prioridade. Verifique conflitos.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500 block mb-1">Início *</label>
                  <input type="datetime-local" className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
                    value={form.inicio} onChange={e => setF("inicio", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 block mb-1">Fim *</label>
                  <input type="datetime-local" className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
                    value={form.fim} onChange={e => setF("fim", e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Local</label>
                <input className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
                  value={form.local} onChange={e => setF("local", e.target.value)} placeholder="Endereço ou local virtual" />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Descrição</label>
                <textarea className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm resize-none"
                  rows={2} value={form.descricao} onChange={e => setF("descricao", e.target.value)} />
              </div>

              {isAdmin && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.privado} onChange={e => setF("privado", e.target.checked)}
                    className="w-4 h-4 rounded" />
                  <span className="text-xs text-zinc-500">Evento privado (visível apenas para mim)</span>
                </label>
              )}

              <div className="flex gap-2 mt-2">
                <button onClick={criarEvento} disabled={!form.titulo || !form.inicio || !form.fim}
                  className="flex-1 bg-zinc-900 text-white text-sm py-2.5 rounded-xl hover:bg-zinc-700 disabled:opacity-50">
                  Criar Evento
                </button>
                <button onClick={() => setShowForm(false)} className="flex-1 border border-zinc-200 text-sm py-2.5 rounded-xl hover:bg-zinc-50">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
