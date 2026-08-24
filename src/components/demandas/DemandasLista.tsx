"use client"

import { MessageSquare, Paperclip, AlertTriangle, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type DemandaLista, GRUPOS_LISTA, grupoDaDemanda, responsavelResumo,
  estaAtrasada, diasDeAtraso, LABEL_STATUS,
} from "./tipos-visao"
import { iniciais } from "@/lib/pessoas-ui"
import { formatarDataCurta } from "@/lib/datas"

// Visão Lista: agrupada por urgência, não por coluna do kanban. Quem abre aqui
// quer saber o que fazer agora — e "atrasada" e "vence hoje" respondem isso
// melhor do que "em qual etapa o card está".

const TOM_GRUPO = {
  vermelho: "text-red-400",
  ambar: "text-amber-400",
  azul: "text-blue-400",
  verde: "text-emerald-400",
} as const

function dataCurta(iso?: string | null) {
  if (!iso) return null
  return formatarDataCurta(iso)
}

function Linha({ d, onAbrir }: { d: DemandaLista; onAbrir: (id: string) => void }) {
  const resp = responsavelResumo(d)
  const atrasada = estaAtrasada(d)
  const dias = diasDeAtraso(d)
  const produto = d.produtos?.[0]?.produto?.nome

  return (
    <button
      onClick={() => onAbrir(d.id)}
      className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/70 last:border-0"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-zinc-200 truncate">{d.titulo}</span>
        <span className="block text-[11px] font-mono text-zinc-600">{d.codigo}</span>
      </span>

      {produto && (
        <span className="hidden lg:inline text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0 max-w-[8rem] truncate">
          {produto}
        </span>
      )}

      <span className="hidden md:inline text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 shrink-0">
        {LABEL_STATUS[d.statusVisivel] ?? d.statusVisivel}
      </span>

      <span className="hidden sm:flex items-center gap-1.5 w-36 shrink-0">
        {resp ? (
          <>
            <span className="w-5 h-5 rounded-full bg-zinc-700 text-[9px] font-bold text-zinc-200 flex items-center justify-center shrink-0">
              {iniciais(resp.nome)}
            </span>
            <span className="text-xs text-zinc-400 truncate">
              {resp.nome}{resp.extras > 0 && <span className="text-zinc-600"> +{resp.extras}</span>}
            </span>
          </>
        ) : (
          <span className="text-xs text-zinc-600 italic">sem responsável</span>
        )}
      </span>

      <span className={cn("flex items-center gap-1 text-xs w-24 shrink-0 justify-end",
        atrasada ? "text-red-400 font-semibold" : "text-zinc-500")}>
        {atrasada ? <AlertTriangle className="w-3 h-3" /> : <CalendarDays className="w-3 h-3" />}
        {atrasada && dias ? `${dias}d atraso` : dataCurta(d.dataLimite) ?? "sem data"}
      </span>

      <span className="hidden lg:flex items-center gap-2.5 text-[11px] text-zinc-600 shrink-0 w-16 justify-end">
        {(d._count?.comentarios ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{d._count!.comentarios}</span>
        )}
        {(d._count?.arquivos ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5"><Paperclip className="w-3 h-3" />{d._count!.arquivos}</span>
        )}
      </span>
    </button>
  )
}

export function DemandasLista({ demandas, onAbrir }: {
  demandas: DemandaLista[]
  onAbrir: (id: string) => void
}) {
  const porGrupo = new Map<string, DemandaLista[]>()
  for (const d of demandas) {
    const g = grupoDaDemanda(d)
    porGrupo.set(g, [...(porGrupo.get(g) ?? []), d])
  }

  const gruposComItens = GRUPOS_LISTA.filter((g) => (porGrupo.get(g.id) ?? []).length > 0)

  if (gruposComItens.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-zinc-500">
        Nenhuma demanda com os filtros atuais.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {gruposComItens.map((g) => {
        const itens = porGrupo.get(g.id) ?? []
        return (
          <section key={g.id}>
            <div className="flex items-center gap-2 mb-1.5 px-1">
              <h2 className={cn("text-xs font-semibold uppercase tracking-wide", TOM_GRUPO[g.tom])}>
                {g.titulo}
              </h2>
              <span className="text-[11px] text-zinc-600">{itens.length}</span>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              {itens.map((d) => <Linha key={d.id} d={d} onAbrir={onAbrir} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}
