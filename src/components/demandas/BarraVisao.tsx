"use client"

import { LayoutGrid, List, Table2, Inbox, AlertTriangle, Clock, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Visao, AbaRapida, DemandaLista } from "./tipos-visao"
import { calcularKpis } from "./tipos-visao"

// Topo do quadro: os números que respondem "como estamos", o seletor de visão e
// os recortes de uso diário. Fica igual nas três visões — muda o desenho embaixo,
// não a navegação.

const VISOES: { id: Visao; label: string; icone: typeof LayoutGrid }[] = [
  { id: "kanban", label: "Kanban", icone: LayoutGrid },
  { id: "lista", label: "Lista", icone: List },
  { id: "tabela", label: "Tabela", icone: Table2 },
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
  demandas, visao, onVisao, aba, onAba, total,
}: {
  demandas: DemandaLista[]
  visao: Visao
  onVisao: (v: Visao) => void
  aba: AbaRapida
  onAba: (a: AbaRapida) => void
  total: number
}) {
  const kpi = calcularKpis(demandas)

  return (
    <div className="space-y-3">
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

        <div className="ml-auto flex items-center rounded-lg border border-zinc-700 bg-zinc-800 p-0.5">
          {VISOES.map((v) => {
            const Icone = v.icone
            return (
              <button
                key={v.id}
                onClick={() => onVisao(v.id)}
                title={`Ver como ${v.label.toLowerCase()}`}
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
