"use client"

import type { DropResult } from "@hello-pangea/dnd"
import { ETAPAS, etapaDaGravacao, type EtapaDaGravacao } from "@/lib/etapas-da-gravacao"
import { ordenarColuna } from "@/lib/vencimento-no-quadro"
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
  // O que vence primeiro fica em cima (Giovani, 05/11/2026): antes da gravação,
  // o dia e a hora dela; depois, o prazo; atrasado no topo; sem data no fim
  // (lib/vencimento-no-quadro.ts). Quem abre o quadro precisa ver o que queima;
  // por isso aqui não há ordem manual, e soltar o card na mesma coluna não muda nada.
  const daColuna = (coluna: string) =>
    ordenarColuna(jobs.filter((j) => etapaDaGravacao(j) === coluna), coluna as EtapaDaGravacao)

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
