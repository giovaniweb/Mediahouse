"use client"

import type { ReactNode } from "react"
import { useVisualPreview } from "@/components/layout/useVisualPreview"
import styles from "./BoardOverview.module.css"
import { LayoutGrid, List, Inbox, AlertTriangle, Clock, CheckCircle2 } from "lucide-react"
import { useDetailPresentation } from "./useDetailPresentation"
import { cn } from "@/lib/utils"
import type { Visao, AbaRapida, DemandaLista } from "./tipos-visao"
import { calcularKpis } from "./tipos-visao"

// Topo do quadro: os números que respondem "como estamos", o seletor de visão e
// os recortes de uso diário. Fica igual nas duas visões — muda o desenho embaixo,
// não a navegação.

const VISOES: { id: Visao; label: string; icone: typeof LayoutGrid }[] = [
  { id: "kanban", label: "Kanban", icone: LayoutGrid },
  { id: "lista", label: "Lista", icone: List },
]

const ABAS: { id: AbaRapida; label: string }[] = [
  { id: "todos", label: "Todas" },
  { id: "minhas", label: "Minhas" },
  { id: "criadas", label: "Criadas por mim" },
  { id: "atrasadas", label: "Atrasadas" },
]

function Kpi({ icone: Icone, rotulo, valor, tom }: {
  icone: typeof Inbox; rotulo: string; valor: number
  tom: "azul" | "vermelho" | "ambar" | "verde"
}) {
  const cores = {
    azul: "bg-blue-500/10 text-blue-400",
    vermelho: "bg-red-500/10 text-red-400",
    ambar: "bg-amber-500/10 text-amber-400",
    verde: "bg-emerald-500/10 text-emerald-400",
  }
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", cores[tom])}>
        <Icone className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500 truncate">{rotulo}</p>
        <p className="text-lg font-bold text-zinc-100 leading-tight">{valor}</p>
      </div>
    </div>
  )
}

export function BarraVisao({
  demandas, visao, onVisao, aba, onAba, total, filters, area = "audiovisual",
}: {
  filters?: ReactNode
  area?: "audiovisual" | "growth"
  demandas: DemandaLista[]
  visao: Visao
  onVisao: (v: Visao) => void
  aba: AbaRapida
  onAba: (a: AbaRapida) => void
  total: number
}) {
  const { presentation, setPresentation } = useDetailPresentation()
  const kpi = calcularKpis(demandas)
  const { modern } = useVisualPreview()

  if (modern) return <section className={styles.overview} aria-label="Controles do quadro">
    <div className={styles.heading}>
      <h1>{area === "growth" ? "Conteúdo que move." : "Produção em movimento."}</h1>
      <p>{area === "growth" ? "Copy, criação e aprovação no mesmo fluxo." : "Do briefing à publicação, sem perder o contexto."}</p>
    </div>
    <div className={styles.counts} aria-label="Resumo das demandas filtradas">
      <span><strong>{kpi.abertas}</strong> abertas</span>
      <span data-tone="late"><strong>{kpi.atrasadas}</strong> atrasadas</span>
      <span data-tone="approval"><strong>{kpi.aprovacao}</strong> em aprovação</span>
      <span data-tone="done"><strong>{kpi.concluidasHoje}</strong> concluídas hoje</span>
    </div>
    <div className={styles.viewRow}>
      <div className={styles.tabs} aria-label="Visualização do quadro">
        {VISOES.map(({id, label, icone: Icon}) => <button key={id} type="button" aria-label={`Ver como ${label.toLowerCase()}`} aria-pressed={visao === id} onClick={() => onVisao(id)}><Icon size={17} />{label}</button>)}
      </div>
      <label className={styles.opening}>Abrir detalhes<select aria-label="Abrir detalhes" value={presentation} onChange={e => setPresentation(e.target.value as "drawer" | "modal")}><option value="drawer">Painel lateral</option><option value="modal">Janela ampliada</option></select></label>
    </div>
    <div className={styles.filters}>{filters}</div>
    <div className={styles.scopes} aria-label="Recortes das demandas">
      {ABAS.map(item => <button key={item.id} type="button" aria-pressed={aba === item.id} onClick={() => onAba(item.id)}>{item.label}{aba === item.id && <span>{total}</span>}</button>)}
    </div>
  </section>

  return (
    <div data-board-summary className="space-y-3">
      {filters}
      {/* Números do quadro */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-3.5">
        <Kpi icone={Inbox} rotulo="Demandas abertas" valor={kpi.abertas} tom="azul" />
        <Kpi icone={AlertTriangle} rotulo="Atrasadas" valor={kpi.atrasadas} tom="vermelho" />
        <Kpi icone={Clock} rotulo="Aguardando aprovação" valor={kpi.aprovacao} tom="ambar" />
        <Kpi icone={CheckCircle2} rotulo="Concluídas hoje" valor={kpi.concluidasHoje} tom="verde" />
      </div>

      {/* Recortes + seletor de visão */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => onAba(a.id)}
              aria-pressed={aba === a.id}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                aba === a.id
                  ? "bg-purple-600 border-purple-500 text-white"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
              )}
            >
              {a.label}
              {aba === a.id && <span className="ml-1.5 opacity-80">{total}</span>}
            </button>
          ))}
        </div>

        <label className="ml-auto flex items-center gap-2 text-xs text-zinc-400">Abrir detalhes<select aria-label="Abrir detalhes" value={presentation} onChange={e => setPresentation(e.target.value as "drawer" | "modal")} className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-zinc-200"><option value="drawer">Painel lateral</option><option value="modal">Janela ampliada</option></select></label>
        <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-800 p-0.5">
          {VISOES.map((v) => {
            const Icone = v.icone
            return (
              <button
                key={v.id}
                onClick={() => onVisao(v.id)}
                title={`Ver como ${v.label.toLowerCase()}`}
                aria-label={`Ver como ${v.label.toLowerCase()}`}
                aria-pressed={visao === v.id}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors",
                  visao === v.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Icone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
