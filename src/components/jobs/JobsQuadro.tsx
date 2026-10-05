"use client"

import kanban from "@/components/kanban/KanbanPreview.module.css"
import { useRef, useState } from "react"
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
//
// O desenho é o do KanbanBoard de Demandas e Growth (KanbanPreview.module.css):
// colunas de 240–300 px, nome em uma linha, contagem, Concluído recolhido e
// rolagem discreta por coluna. Não usa o componente porque ele é o quadro de
// arrastar — aqui só o visual é compartilhado.

const CORES: Record<string, { borda: string; ponto: string }> = {
  entrada:     { borda: "border-t-zinc-500",    ponto: "bg-zinc-400" },
  producao:    { borda: "border-t-blue-500",    ponto: "bg-blue-500" },
  edicao:      { borda: "border-t-purple-500",  ponto: "bg-purple-500" },
  aprovacao:   { borda: "border-t-amber-500",   ponto: "bg-amber-500" },
  para_postar: { borda: "border-t-cyan-500",    ponto: "bg-cyan-500" },
  finalizado:  { borda: "border-t-emerald-500", ponto: "bg-emerald-500" },
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
  // Como no quadro de Demandas: Concluído começa recolhido para as colunas de
  // trabalho em andamento caberem na tela.
  const [concluidoAberto, setConcluidoAberto] = useState(false)
  const rolar = (px: number) => scrollRef.current?.scrollBy({ left: px, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })

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
    <div className={cn("relative h-full flex flex-col", kanban.board)}>
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
        className={cn("kanban-scroll flex gap-3 overflow-x-auto overflow-y-hidden pb-2 h-full min-h-0 px-10", kanban.scroll)}
      >
        {COLUNAS_ORDER.map((coluna) => {
          const itens = daColuna(coluna)
          const rotulo = ROTULOS[coluna]
          const recolhida = coluna === "finalizado" && !concluidoAberto
          return (
            <section
              key={coluna}
              aria-label={rotulo}
              className={cn(
                "flex-shrink-0 bg-zinc-900/50 rounded-xl border border-zinc-800 border-t-[3px] flex flex-col",
                recolhida ? "w-14" : "w-72",
                CORES[coluna]?.borda,
                kanban.column,
                recolhida && kanban.collapsed
              )}
            >
              {recolhida ? (
                <button
                  type="button"
                  onClick={() => setConcluidoAberto(true)}
                  aria-expanded={false}
                  aria-label={`Mostrar ${rotulo}: ${itens.length} ${itens.length === 1 ? "job" : "jobs"}`}
                  className="flex flex-col items-center gap-3 px-1 py-3 text-zinc-300 hover:text-white transition-colors"
                >
                  <span className="text-xs bg-zinc-800 text-zinc-400 rounded-full px-2 py-0.5 font-medium border border-zinc-700">
                    {itens.length}
                  </span>
                  <span className="font-semibold text-sm [writing-mode:vertical-rl] rotate-180">{rotulo}</span>
                </button>
              ) : (
                <header className={cn("flex items-center justify-between px-3 py-3", kanban.heading)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", CORES[coluna]?.ponto)} />
                    <h2 className="font-semibold text-sm text-zinc-200 truncate" title={rotulo}>{rotulo}</h2>
                    <span className="text-xs bg-zinc-800 text-zinc-400 rounded-full px-2 py-0.5 font-medium border border-zinc-700">
                      {itens.length}
                    </span>
                  </div>
                  {coluna === "finalizado" && (
                    <button
                      type="button"
                      onClick={() => setConcluidoAberto(false)}
                      aria-expanded={true}
                      aria-label={`Recolher ${rotulo}`}
                      className="ml-auto p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </header>
              )}

              {!recolhida && (
                // Cada coluna rola sozinha, com a mesma barra discreta do quadro de
                // Demandas; a barra horizontal fica no rodapé visível.
                <div className="flex-1 min-h-0 overflow-y-auto kanban-scroll px-2 pb-2 space-y-2 rounded-b-xl">
                  {itens.map((job) => (
                    <div key={job.id} className={kanban.card}>
                      <JobCard job={job} onAbrir={onAbrir} />
                    </div>
                  ))}
                  {itens.length === 0 && (
                    <p className="m-2 rounded-xl border border-dashed border-zinc-700/60 p-5 text-center text-xs text-zinc-400">Nenhum job nesta etapa.</p>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
