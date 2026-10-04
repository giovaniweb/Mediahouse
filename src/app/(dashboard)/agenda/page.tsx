"use client"

import { useDetailPresentation } from "@/components/demandas/useDetailPresentation"
import { useDialogFocus } from "@/components/layout/useDialogFocus"
import styles from "@/components/agenda/AgendaPreview.module.css"
import surface from "@/components/demandas/DemandSurface.module.css"
import { useState, useMemo, useRef } from "react"
import Link from "next/link"
import { Header } from "@/components/layout/Header"
import {
  ChevronLeft, ChevronRight, Plus, X, Building2, Briefcase,
  User, Film, Calendar, Clock, MapPin, AlertTriangle,
  Download, ExternalLink, ChevronDown,
} from "lucide-react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek,
  isToday, parseISO, addWeeks, startOfDay, addDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { fetcher } from "@/lib/fetcher"


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
  contourline: { label: "Contourline", cor: "bg-blue-500", textCor: "text-blue-400", icon: Building2 },
  freelance:   { label: "Freelance",   cor: "bg-green-500", textCor: "text-green-400", icon: Briefcase },
  pessoal:     { label: "Pessoal",     cor: "bg-purple-500", textCor: "text-purple-400", icon: User },
  sistema:     { label: "Sistema",     cor: "bg-zinc-400", textCor: "text-zinc-400", icon: Film },
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

function ExportButton() {
  const [open, setOpen] = useState(false)
  const hoje = new Date()

  function buildGoogleLink(titulo: string, inicio: Date, fim: Date) {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
    return `https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(titulo)}&dates=${fmt(inicio)}/${fmt(fim)}`
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 border border-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Exportar
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl py-1 z-50">
          <a
            href="/api/agenda/exportar.ics"
            download="nuflow-agenda.ics"
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
            onClick={() => setOpen(false)}
          >
            <Download className="h-4 w-4 text-zinc-500" />
            Download .ics (todos)
          </a>
          <p className="px-4 py-1 text-[10px] text-zinc-600 border-t border-zinc-800 mt-1 pt-2">
            Funciona no Google, iPhone e Outlook
          </p>
          <a
            href={buildGoogleLink("Evento NuFlow", hoje, new Date(hoje.getTime() + 3600000))}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
            onClick={() => setOpen(false)}
          >
            <ExternalLink className="h-4 w-4 text-zinc-500" />
            Adicionar ao Google Calendar
          </a>
        </div>
      )}
    </div>
  )
}

export default function AgendaPage() {
  const { presentation, setPresentation } = useDetailPresentation()
  const [view, setView] = useState<"month" | "week" | "list">("month")
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [actionError, setActionError] = useState("")
  const { data: session } = useSession()
  const isAdmin = session?.user?.tipo === "admin"

  const [mesAtual, setMesAtual] = useState(new Date())
  const [diaSelec, setDiaSelec] = useState<Date | null>(new Date())
  const [showForm, setShowForm] = useState(false)
  const [eventoSelec, setEventoSelec] = useState<Evento | null>(null)
  const [filtroCtx, setFiltroCtx] = useState<string>("todas")

  const inicioMes = startOfMonth(mesAtual)
  const fimMes = endOfMonth(mesAtual)
  const semana = view === "week"
  const inicioGrid = startOfWeek(semana ? mesAtual : inicioMes, { locale: ptBR })
  const fimGrid = endOfWeek(semana ? mesAtual : fimMes, { locale: ptBR })
  const diasGrid = eachDayOfInterval({ start: inicioGrid, end: fimGrid })

  const qsInicio = encodeURIComponent(inicioGrid.toISOString())
  const qsFim = encodeURIComponent(fimGrid.toISOString())

  const detailRef = useDialogFocus(!!eventoSelec, () => { if (!busyRef.current) setEventoSelec(null) })
  const formRef = useDialogFocus(showForm, () => { if (!busyRef.current) setShowForm(false) })

  const { data, mutate, error, isLoading } = useSWR<{ eventos: Evento[] }>(
    `/api/agenda?inicio=${qsInicio}&fim=${qsFim}`,
    fetcher
  )

  const eventos = useMemo(() => {
    const evts = data?.eventos ?? []
    if (filtroCtx === "todas") return evts
    return evts.filter(e => e.contexto === filtroCtx)
  }, [data, filtroCtx])

  const eventosNoDia = (dia: Date) =>
    eventos.filter(e => parseISO(e.inicio) < addDays(startOfDay(dia), 1) && parseISO(e.fim) > startOfDay(dia))

  const eventosDoSelecionado = diaSelec ? eventosNoDia(diaSelec) : []

  // Conflito exige sobreposição de horários, inclusive em dias de continuação.
  const conflitos = diasGrid.filter(dia => {
    const doDia = eventosNoDia(dia).filter(e => !["cancelado", "concluido"].includes(e.status))
    return doDia.some(a => a.contexto === "contourline" && doDia.some(b =>
      b.contexto === "freelance" && Math.max(+parseISO(a.inicio), +parseISO(b.inicio), +startOfDay(dia)) <
        Math.min(+parseISO(a.fim), +parseISO(b.fim), +addDays(startOfDay(dia), 1))))
  }).map(dia => format(dia, "yyyy-MM-dd"))

  // Form
  const [form, setForm] = useState({
    titulo: "", descricao: "", inicio: diaSelec ? format(diaSelec, "yyyy-MM-dd") + "T09:00" : "",
    fim: diaSelec ? format(diaSelec, "yyyy-MM-dd") + "T10:00" : "",
    tipo: "reuniao", contexto: "contourline", privado: false, local: "",
    lembreteMinutos: 60,
  })

  function setF(f: string, v: unknown) { setForm(prev => ({ ...prev, [f]: v })) }

  function abrirForm(dia?: Date) {
    const d = dia ?? diaSelec ?? new Date()
    setForm({
      titulo: "", descricao: "",
      inicio: format(d, "yyyy-MM-dd") + "T09:00",
      fim: format(d, "yyyy-MM-dd") + "T10:00",
      tipo: "reuniao", contexto: "contourline", privado: false, local: "",
      lembreteMinutos: 60,
    })
    setActionError("")
    setShowForm(true)
  }

  async function criarEvento() {
    if (busyRef.current) return
    if (!form.titulo.trim() || !form.inicio || !form.fim || new Date(form.fim) <= new Date(form.inicio)) {
      setActionError("Informe título e horários válidos. O fim deve ser depois do início."); return
    }
    busyRef.current = true; setBusy(true); setActionError("")
    try {
      const res = await fetch("/api/agenda", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, cor: COR_DEFAULTS[form.contexto] }),
      })
      if (!res.ok) throw new Error("Não foi possível criar o evento. Confira os dados e tente novamente.")
      void mutate(); setShowForm(false)
    } catch (err) { setActionError(err instanceof Error ? err.message : "Falha de conexão. Tente novamente.") }
    finally { busyRef.current = false; setBusy(false) }
  }

  async function deletarEvento(id: string) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setActionError("")
    try {
      const res = await fetch(`/api/agenda/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Não foi possível excluir o evento. Tente novamente.")
      void mutate(); setEventoSelec(null)
    } catch (err) { setActionError(err instanceof Error ? err.message : "Falha de conexão. Tente novamente.") }
    finally { busyRef.current = false; setBusy(false) }
  }

  return (
    <>
      <Header
        title="Agenda"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton />
            <button onClick={() => abrirForm()} className="flex items-center gap-1.5 bg-zinc-900 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-zinc-700">
            <Plus className="w-3.5 h-3.5" /> Novo Evento
          </button>
          </div>
        }
      />
      <div className={styles.heading}><p>AGENDA · SEU TEMPO À VISTA</p><h1>Seu tempo de criar.</h1><span>Captações, reuniões e prazos reunidos no seu calendário.</span></div>
      <div className={styles.viewBar}>
        <div>{([["month", "Mês"], ["week", "Semana"], ["list", "Lista"]] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</div>
        <label>Abrir detalhes<select aria-label="Abrir detalhes" value={presentation} onChange={e => setPresentation(e.target.value as "drawer" | "modal")}><option value="drawer">Painel lateral</option><option value="modal">Janela ampliada</option></select></label>
      </div>
      {error && <div role="alert" className={styles.error}>Não foi possível atualizar a agenda. <button onClick={() => void mutate()}>Tentar novamente</button></div>}
      {isLoading && <p role="status" className={styles.error}>Carregando agenda…</p>}
      <main className={cn("flex-1 p-4 flex gap-4 overflow-hidden", styles.agenda)}>
        {/* COLUNA ESQUERDA — Calendário */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Controles */}
          <div className={cn("flex items-center justify-between mb-4", styles.toolbar)}>
            <div className="flex items-center gap-2">
              <button aria-label={semana ? "Semana anterior" : "Mês anterior"} onClick={() => setMesAtual(m => semana ? addWeeks(m, -1) : subMonths(m, 1))} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-semibold text-zinc-200 capitalize min-w-36 text-center">
                {semana ? `${format(inicioGrid, "dd MMM", {locale:ptBR})} – ${format(fimGrid, "dd MMM yyyy", {locale:ptBR})}` : format(mesAtual, "MMMM yyyy", { locale: ptBR })}
              </h2>
              <button aria-label={semana ? "Próxima semana" : "Próximo mês"} onClick={() => setMesAtual(m => semana ? addWeeks(m, 1) : addMonths(m, 1))} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => { const hoje = new Date(); setMesAtual(hoje); setDiaSelec(hoje) }} className="text-xs text-zinc-400 hover:text-zinc-200 ml-2 border border-zinc-700 px-2 py-1 rounded-lg hover:bg-zinc-800">Hoje</button>
            </div>

            {/* Filtros de contexto */}
            <div className="flex items-center gap-1.5">
              <button aria-pressed={filtroCtx === "todas"} onClick={() => setFiltroCtx("todas")} className={cn("text-xs px-2.5 py-1 rounded-full border transition-colors",
                filtroCtx === "todas" ? "bg-zinc-700 text-white border-zinc-600" : "border-zinc-700 text-zinc-400 hover:border-zinc-500")}>
                Todos
              </button>
              {Object.entries(CONTEXTO_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon
                return (
                  <button key={key} aria-pressed={filtroCtx === key} onClick={() => setFiltroCtx(key)}
                    className={cn("flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors",
                      filtroCtx === key ? `${cfg.cor} text-white border-transparent` : "border-zinc-700 text-zinc-400 hover:border-zinc-500")}>
                    <Icon className="w-3 h-3" />{cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Alertas de conflito */}
          {conflitos.length > 0 && (
            <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2 mb-3 text-xs text-orange-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                Conflito detectado em: {conflitos.map(d => format(parseISO(d), "dd/MM", { locale: ptBR })).join(", ")} —
                Contourline tem prioridade sobre eventos freelance.
              </span>
            </div>
          )}

          {/* Grid */}
          {view === "list" ? <section className={styles.eventList} aria-label="Compromissos do mês">
            {eventos.filter(evento => parseISO(evento.inicio) <= fimMes && parseISO(evento.fim) > inicioMes).sort((a,b) => a.inicio.localeCompare(b.inicio)).map(evento => <button key={evento.id} type="button" onClick={() => {setActionError(""); setEventoSelec(evento)}}>
              <span>{format(parseISO(evento.inicio), "dd MMM", {locale:ptBR})}<small>{evento.diaTodo ? "Dia todo" : format(parseISO(evento.inicio), "HH:mm")}</small></span>
              <div><strong>{evento.titulo}</strong><p>{evento.local || TIPO_OPTS.find(tipo => tipo.value === evento.tipo)?.label || evento.tipo}</p></div>
              <ChevronRight size={18} />
            </button>)}
            {!isLoading && !eventos.some(evento => parseISO(evento.inicio) <= fimMes && parseISO(evento.fim) > inicioMes) && <p>Nenhum compromisso neste mês com os filtros selecionados.</p>}
          </section> : <div className={cn("bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden flex-1", styles.calendar, semana && styles.week)}>
            {/* Cabeçalho dias da semana */}
            <div className="grid grid-cols-7 border-b border-zinc-800">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
                <div key={d} className="text-center text-xs font-semibold text-zinc-500 py-2">{d}</div>
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
                      "min-h-[80px] p-1.5 border-b border-r border-zinc-800/50 cursor-pointer transition-colors",
                      !isMes && "bg-zinc-900/30",
                      isSelec && "bg-blue-500/10 ring-1 ring-inset ring-blue-500/30",
                      isToday(dia) && !isSelec && "bg-amber-500/5",
                      "hover:bg-zinc-800/50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <button aria-label={format(dia, "dd/MM/yyyy")} aria-pressed={!!isSelec} onClick={() => setDiaSelec(dia)} className={cn("text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                        isToday(dia) ? "bg-blue-500 text-white" :
                        isSelec ? "text-blue-400 font-bold" :
                        !isMes ? "text-zinc-600" : "text-zinc-300"
                      )}>
                        {format(dia, "d")}
                      </button>
                      {temConflito && <AlertTriangle className="w-3 h-3 text-orange-500" />}
                    </div>

                    <div className="space-y-0.5">
                      {(semana ? evts : evts.slice(0, 3)).map(e => {
                        return (
                          <button aria-label={`Abrir evento: ${e.titulo}`} key={e.id}
                            onClick={(ev) => { ev.stopPropagation(); setActionError(""); setEventoSelec(e) }}
                            style={{ backgroundColor: e.cor ?? "#71717a" }}
                            className="block w-full text-left text-white text-[10px] px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80">
                            {semana && <span className={styles.eventTime}>{e.diaTodo ? "Dia todo" : isSameDay(parseISO(e.inicio), dia) ? format(parseISO(e.inicio), "HH:mm") : isSameDay(parseISO(e.fim), dia) ? `Até ${format(parseISO(e.fim), "HH:mm")}` : "Em andamento"}</span>}{e.titulo}
                          </button>
                        )
                      })}
                      {!semana && evts.length > 3 && <div className="text-[10px] text-zinc-400 pl-1">+{evts.length - 3}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>}

          {/* Legenda */}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
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
        <div className={cn("w-72 shrink-0 flex flex-col gap-3", styles.dayPanel)}>
          {diaSelec && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-zinc-200 text-sm">
                  {format(diaSelec, "EEEE, d 'de' MMMM", { locale: ptBR })}
                </h3>
                <button aria-label="Adicionar evento neste dia" onClick={() => abrirForm(diaSelec)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {eventosDoSelecionado.length === 0 ? (
                <div className="text-center py-6">
                  <Calendar className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs text-zinc-500">Nenhum evento</p>
                  <button onClick={() => abrirForm(diaSelec)} className="text-xs text-blue-400 hover:underline mt-1">
                    + Adicionar
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {eventosDoSelecionado.map(e => {
                    const cfg = CONTEXTO_CONFIG[e.contexto]
                    const Icon = cfg?.icon ?? Film
                    return (
                      <button aria-label={`Abrir evento: ${e.titulo}`} key={e.id}
                        onClick={() => { setActionError(""); setEventoSelec(e) }}
                        style={{ borderLeftColor: e.cor ?? "#71717a" }}
                        className="w-full text-left border-l-4 pl-3 py-2 cursor-pointer hover:bg-zinc-800/50 rounded-r-lg transition-colors">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Icon className="w-3 h-3 text-zinc-400" />
                          <span className={cn("text-[10px] font-semibold uppercase tracking-wide", cfg?.textCor ?? "text-zinc-500")}>
                            {cfg?.label}
                          </span>
                          {e.privado && <span className="text-[10px] text-zinc-400">• privado</span>}
                        </div>
                        <p className="text-xs font-medium text-zinc-200">{e.titulo}</p>
                        {!e.diaTodo && (
                          <p className="text-[10px] text-zinc-400">
                            {format(parseISO(e.inicio), "HH:mm")} – {format(parseISO(e.fim), "HH:mm")}
                          </p>
                        )}
                        {e.local && <p className="text-[10px] text-zinc-400">📍 {e.local}</p>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Próximos conflitos */}
          {isAdmin && conflitos.length > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-semibold text-orange-400">Conflitos de Agenda</h3>
              </div>
              {conflitos.slice(0, 3).map(d => (
                <div key={d} className="text-xs text-orange-300 py-1 border-b border-orange-500/10 last:border-0">
                  <span className="font-medium">{format(parseISO(d), "dd/MM", { locale: ptBR })}</span>
                  {" — "} Contourline + Freelance sobrepostos
                </div>
              ))}
              <p className="text-[10px] text-orange-400/70 mt-2">Contourline tem prioridade absoluta.</p>
            </div>
          )}
        </div>
      </main>

      {/* Modal detalhe evento */}
      {eventoSelec && (
        <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4", surface.overlay, presentation === "drawer" && styles.drawerOverlay)}>
          <div ref={detailRef} role="dialog" aria-modal="true" aria-labelledby="event-detail-title" tabIndex={-1} className={cn("bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl max-h-[90dvh] overflow-y-auto", surface.surface, styles.detail, presentation === "drawer" && styles.drawer)}>
            {(() => {
              const cfg = CONTEXTO_CONFIG[eventoSelec.contexto]
              return (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div style={{ backgroundColor: eventoSelec.cor ?? "#71717a" }} className="w-3 h-3 rounded-full" />
                        <span className={cn("text-xs font-semibold uppercase", cfg?.textCor ?? "text-zinc-500")}>{cfg?.label}</span>
                      </div>
                      <h3 id="event-detail-title" className="font-bold text-zinc-200">{eventoSelec.titulo}</h3>
                    </div>
                    <button aria-label="Fechar" disabled={busy} onClick={() => setEventoSelec(null)} className="text-zinc-500 hover:text-zinc-300">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <button type="button" className={styles.expand} onClick={() => setPresentation(presentation === "drawer" ? "modal" : "drawer")}>{presentation === "drawer" ? "Ampliar" : "Painel lateral"}</button>
                  <div className="space-y-2 text-sm text-zinc-400 mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      {eventoSelec.diaTodo
                        ? format(parseISO(eventoSelec.inicio), "dd/MM/yyyy", { locale: ptBR })
                        : `${format(parseISO(eventoSelec.inicio), "dd/MM HH:mm")} — ${format(parseISO(eventoSelec.fim), "dd/MM HH:mm")}`
                      }
                    </div>
                    {eventoSelec.local && (
                      <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-zinc-400" />{eventoSelec.local}</div>
                    )}
                    {eventoSelec.descricao && (
                      <p className="text-xs text-zinc-500 leading-relaxed">{eventoSelec.descricao}</p>
                    )}
                    {eventoSelec.demanda && (
                      <div className="bg-zinc-800 rounded-lg px-3 py-2 text-xs">
                        <span className="text-zinc-500">Demanda: </span>
                        <span className="font-medium">{eventoSelec.demanda.codigo}</span>
                        {" — "}{eventoSelec.demanda.titulo}
                      </div>
                    )}
                  </div>

                  <div className={styles.metadata}>
                    <div><span>Tipo</span><strong>{TIPO_OPTS.find(t => t.value === eventoSelec.tipo)?.label ?? eventoSelec.tipo}</strong></div>
                    <div><span>Visibilidade</span><strong>{eventoSelec.privado ? "Privado" : "Conforme acesso à agenda"}</strong></div>
                    {eventoSelec.videomaker && <div><span>Videomaker</span><strong>{eventoSelec.videomaker.nome}</strong></div>}
                    {eventoSelec.demanda && <Link href={`/demandas/${eventoSelec.demanda.id}`}>Abrir demanda vinculada →</Link>}
                  </div>
                  {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
                  {isAdmin && (
                    <button disabled={busy} onClick={() => deletarEvento(eventoSelec.id)}
                      className="w-full border border-red-500/30 text-red-400 text-sm py-2 rounded-xl hover:bg-red-500/10">
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
        <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4", surface.overlay)}>
          <div ref={formRef} role="dialog" aria-modal="true" aria-labelledby="event-form-title" tabIndex={-1} className={cn("bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-y-auto max-h-[90vh]", surface.surface, styles.form)}>
            <div className={cn("flex items-center justify-between mb-4", styles.toolbar)}>
              <h3 id="event-form-title" className="font-semibold text-zinc-200">Novo Evento</h3>
              <button aria-label="Fechar" disabled={busy} onClick={() => setShowForm(false)}><X className="w-4 h-4 text-zinc-500" /></button>
            </div>

            {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Título *</label>
                <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
                  aria-label="Título" value={form.titulo} onChange={e => setF("titulo", e.target.value)} placeholder="Nome do evento" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1">Tipo</label>
                  <select className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200"
                    aria-label="Tipo" value={form.tipo} onChange={e => setF("tipo", e.target.value)}>
                    {TIPO_OPTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1">Contexto</label>
                  <select className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200"
                    aria-label="Contexto" value={form.contexto} onChange={e => setF("contexto", e.target.value)}>
                    {CONTEXTO_OPTS
                      .filter(c => isAdmin || c.value !== "pessoal")
                      .map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {form.contexto === "pessoal" && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-purple-400 flex items-start gap-2">
                  <User className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Evento privado — visível apenas para você como administrador.
                </div>
              )}
              {form.contexto === "freelance" && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-amber-400 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Lembre-se: Contourline tem prioridade. Verifique conflitos.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1">Início *</label>
                  <input type="datetime-local" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200"
                    aria-label="Início" value={form.inicio} onChange={e => setF("inicio", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1">Fim *</label>
                  <input type="datetime-local" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200"
                    aria-label="Fim" value={form.fim} onChange={e => setF("fim", e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Local</label>
                <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500"
                  aria-label="Local" value={form.local} onChange={e => setF("local", e.target.value)} placeholder="Endereço ou local virtual" />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Descrição</label>
                <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 resize-none"
                  rows={2} aria-label="Descrição" value={form.descricao} onChange={e => setF("descricao", e.target.value)} />
              </div>

              {/* TDAH: Lembrete via WhatsApp */}
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">⏰ Lembrete WhatsApp</label>
                <select className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200"
                  aria-label="Lembrete WhatsApp" value={form.lembreteMinutos} onChange={e => setF("lembreteMinutos", Number(e.target.value))}>
                  <option value={0}>Sem lembrete</option>
                  <option value={15}>15 minutos antes</option>
                  <option value={30}>30 minutos antes</option>
                  <option value={60}>1 hora antes</option>
                  <option value={120}>2 horas antes</option>
                  <option value={1440}>1 dia antes</option>
                </select>
              </div>

              {isAdmin && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.privado} onChange={e => setF("privado", e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700" />
                  <span className="text-xs text-zinc-400">Evento privado (visível apenas para mim)</span>
                </label>
              )}

              <div className="flex gap-2 mt-2">
                <button onClick={criarEvento} disabled={busy || !form.titulo || !form.inicio || !form.fim}
                  className="flex-1 bg-blue-600 text-white text-sm py-2.5 rounded-xl hover:bg-blue-500 disabled:opacity-50">
                  Criar Evento
                </button>
                <button disabled={busy} onClick={() => setShowForm(false)} className="flex-1 border border-zinc-700 text-zinc-300 text-sm py-2.5 rounded-xl hover:bg-zinc-800">
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
