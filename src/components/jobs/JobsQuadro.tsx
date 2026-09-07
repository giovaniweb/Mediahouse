"use client"

import { useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { COLUNAS_ORDER, COLUNAS_LABEL, estaAtrasada } from "@/lib/status"
import { JobCard, type JobDoQuadro } from "./JobCard"

// O quadro de Jobs.
//
// Colunas: as seis operacionais que já existem (`StatusVisivel`), incluindo
// "Para Postar". A decisão validada em 07/09/2026 foi manter o quadro mais
// granular que as seis JobPhase — "Para Postar" é a fila real do Social, e é
// exatamente `finished + not_published` (§25). As macrofases servem leitura,
// filtro e métrica; não obrigam o quadro a ter seis colunas.
//
// SEM drag-and-drop, de propósito. §3 e §63: o Kanban representa o estado, não
// o define. Mudar etapa é ação de negócio na página do Job. O quadro leva até lá.

const CORES: Record<string, string> = {
  entrada:     "border-t-zinc-500",
  producao:    "border-t-blue-500",
  edicao:      "border-t-purple-500",
  aprovacao:   "border-t-amber-500",
  para_postar: "border-t-cyan-500",
  finalizado:  "border-t-emerald-500",
}

// "Concluído" lê melhor que "Finalizado" na coluna, e é o rótulo que o quadro
// do audiovisual já usa. Os demais vêm de COLUNAS_LABEL, fonte única.
const ROTULOS: Record<string, string> = { ...COLUNAS_LABEL, finalizado: "Concluído" }

export function JobsQuadro({
  jobs,
  onAbrir,
}: {
  jobs: JobDoQuadro[]
  onAbrir: (id: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rolar = (px: number) => scrollRef.current?.scrollBy({ left: px, behavior: "smooth" })

  // Atrasados no topo, depois urgentes, depois o mais antigo primeiro. Mesma
  // ordenação do quadro atual — quem abre o quadro precisa ver o que queima.
  const daColuna = (coluna: string) =>
    jobs
      .filter((j) => j.statusVisivel === coluna)
      .sort((a, b) => {
        const atrA = estaAtrasada(a), atrB = estaAtrasada(b)
        if (atrA !== atrB) return atrA ? -1 : 1
        const urgA = a.prioridade === "urgente", urgB = b.prioridade === "urgente"
        if (urgA !== urgB) return urgA ? -1 : 1
        const pa = a.dataLimite ? new Date(a.dataLimite).getTime() : Infinity
        const pb = b.dataLimite ? new Date(b.dataLimite).getTime() : Infinity
        return pa - pb
      })

  return (
    <div className="relative h-full flex flex-col">
      <button
        onClick={() => rolar(-320)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-30 w-8 h-16 flex items-center justify-center bg-zinc-900/90 border border-zinc-700 rounded-r-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shadow-lg"
        aria-label="Rolar para a esquerda"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => rolar(320)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-30 w-8 h-16 flex items-center justify-center bg-zinc-900/90 border border-zinc-700 rounded-l-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shadow-lg"
        aria-label="Rolar para a direita"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2 h-full min-h-0 px-10"
      >
        {COLUNAS_ORDER.map((coluna) => {
          const itens = daColuna(coluna)
          const atrasados = itens.filter(estaAtrasada).length
          return (
            <section
              key={coluna}
              className={cn(
                "flex-shrink-0 w-72 bg-zinc-900/50 rounded-xl border border-zinc-800 border-t-[3px] flex flex-col",
                CORES[coluna]
              )}
            >
              <header className="px-3 py-2.5 flex items-center justify-between border-b border-zinc-800">
                <h2 className="text-sm font-medium text-zinc-200">{ROTULOS[coluna]}</h2>
                <div className="flex items-center gap-1.5">
                  {atrasados > 0 && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400"
                      title={`${atrasados} atrasado(s)`}
                    >
                      {atrasados}
                    </span>
                  )}
                  <span className="text-xs text-zinc-500 tabular-nums">{itens.length}</span>
                </div>
              </header>

              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                {itens.map((job) => (
                  <JobCard key={job.id} job={job} onAbrir={onAbrir} />
                ))}
                {itens.length === 0 && (
                  <p className="text-xs text-zinc-600 text-center py-6">Nenhum job</p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
