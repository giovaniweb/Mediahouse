"use client"

import type { DropResult } from "@hello-pangea/dnd"
import { estaAtrasada } from "@/lib/status"
import { ETAPAS, etapaDaGravacao, type EtapaDaGravacao } from "@/lib/etapas-da-gravacao"
import { momentoDoJob } from "@/lib/ficha-do-job"
import { QuadroArrastavel, type ColunaQuadro } from "@/components/kanban/QuadroArrastavel"
import { JobCard, type JobDoQuadro } from "./JobCard"

// O quadro de Gravações Externas (antes "Jobs").
//
// Colunas: as cinco etapas da gravação (lib/etapas-da-gravacao.ts) — a
// agendar, agendado, em edição, para enviar e concluído. Até 28/10/2026 eram as
// seis do audiovisual, e tudo antes da edição caía em "Produção". Quem grava,
// quem edita e a nota do videomaker não são coluna: são etiquetas no card.
//
// Desde 07/10/2026 é o MESMO quadro de Demandas e do Growth (QuadroArrastavel):
// trilho, alça, arrasto no celular e o card abrindo no painel lateral. Soltar o
// card numa coluna passa pela guarda do servidor antes (lib/jobs-quadro.ts) —
// quem decide se pode é a página, que conhece a pessoa.

const CORES: Record<EtapaDaGravacao, { borda: string; ponto: string }> = {
  a_agendar:   { borda: "border-t-zinc-500",    ponto: "bg-zinc-400" },
  agendado:    { borda: "border-t-blue-500",    ponto: "bg-blue-500" },
  em_edicao:   { borda: "border-t-purple-500",  ponto: "bg-purple-500" },
  para_enviar: { borda: "border-t-cyan-500",    ponto: "bg-cyan-500" },
  concluido:   { borda: "border-t-emerald-500", ponto: "bg-emerald-500" },
}

const COLUNAS: ColunaQuadro[] = ETAPAS.map((e) => ({
  id: e.id, label: e.rotulo, dica: e.dica, color: CORES[e.id].borda, dot: CORES[e.id].ponto,
}))

// Antes da gravação, a pergunta é "qual é a próxima": ordem do dia marcado,
// sem data por último. Depois dela, o que queima primeiro.
const PELA_DATA: EtapaDaGravacao[] = ["a_agendar", "agendado"]
const diaDe = (j: JobDoQuadro) => momentoDoJob(j)?.dia ?? "9999-12-31"

export function JobsQuadro({
  jobs,
  onAbrir,
  onMover,
  abrirConcluido = false,
}: {
  jobs: JobDoQuadro[]
  onAbrir: (id: string) => void
  /** O card foi solto em outra coluna. */
  onMover: (id: string, coluna: string) => void
  /** Abre o Concluído: a pendência filtrada (nota, pagamento) tem cards lá. */
  abrirConcluido?: boolean
}) {
  // Atrasadas no topo, depois urgentes, depois o prazo mais perto. Quem abre o
  // quadro precisa ver o que queima; por isso aqui não há ordem manual, e
  // soltar o card na mesma coluna não muda nada.
  const daColuna = (coluna: string) =>
    jobs
      .filter((j) => etapaDaGravacao(j) === coluna)
      .sort((a, b) => {
        if (PELA_DATA.includes(coluna as EtapaDaGravacao)) {
          const da = diaDe(a), db = diaDe(b)
          if (da !== db) return da < db ? -1 : 1
        }
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
      nome={{ um: "gravação", varios: "gravações", vazio: "Nenhuma gravação nesta etapa." }}
      recolhivel="concluido"
      abrirRecolhivel={abrirConcluido}
      verTodos="/historico/audiovisual"
      renderCard={(job, { arrastavel }) => <JobCard job={job} onAbrir={onAbrir} arrastavel={arrastavel} />}
    />
  )
}
