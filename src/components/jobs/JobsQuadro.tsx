"use client"

import type { DropResult } from "@hello-pangea/dnd"
import { COLUNAS_ORDER, COLUNAS_LABEL, estaAtrasada } from "@/lib/status"
import { QuadroArrastavel, type ColunaQuadro } from "@/components/kanban/QuadroArrastavel"
import { JobCard, type JobDoQuadro } from "./JobCard"

// O quadro de Jobs.
//
// Colunas: as seis operacionais que já existem (`StatusVisivel`), incluindo
// "Para Postar". A decisão validada em 07/09/2026 foi manter o quadro mais
// granular que as seis JobPhase — "Para Postar" é a fila real do Social, e é
// exatamente `finished + not_published` (§25).
//
// Desde 07/10/2026 é o MESMO quadro de Demandas e do Growth (QuadroArrastavel):
// trilho, alça, arrasto no celular e o card abrindo no painel lateral. Soltar o
// card numa coluna passa pela guarda do servidor antes (lib/jobs-quadro.ts) —
// quem decide se pode é a página, que conhece a pessoa.

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

const COLUNAS: ColunaQuadro[] = COLUNAS_ORDER.map((id) => ({
  id, label: ROTULOS[id], color: CORES[id]?.borda ?? "", dot: CORES[id]?.ponto ?? "",
}))

export function JobsQuadro({
  jobs,
  onAbrir,
  onMover,
}: {
  jobs: JobDoQuadro[]
  onAbrir: (id: string) => void
  /** O card foi solto em outra coluna. */
  onMover: (id: string, coluna: string) => void
}) {
  // Atrasados no topo, depois urgentes, depois o prazo mais perto. Quem abre o
  // quadro precisa ver o que queima; por isso aqui não há ordem manual, e
  // soltar o card na mesma coluna não muda nada.
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

  function soltar(r: DropResult) {
    if (!r.destination || r.destination.droppableId === r.source.droppableId) return
    onMover(r.draggableId, r.destination.droppableId)
  }

  return (
    <QuadroArrastavel
      colunas={COLUNAS}
      itensDaColuna={daColuna}
      idDe={(j) => j.id}
      onDragEnd={soltar}
      nome={{ um: "job", varios: "jobs", vazio: "Nenhum job nesta etapa." }}
      recolhivel="finalizado"
      verTodos="/historico/audiovisual"
      renderCard={(job, { arrastavel }) => <JobCard job={job} onAbrir={onAbrir} arrastavel={arrastavel} />}
    />
  )
}
