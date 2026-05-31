import { prisma } from "@/lib/prisma"

// Recalcula o % de conclusão de um evento de gestão.
// Base = tarefas de checklist concluídas + demandas audiovisuais finalizadas.
export async function recalcularConclusao(eventoId: string): Promise<number> {
  const [totalTarefas, tarefasConcluidas, totalDemandas, demandasFinalizadas] = await Promise.all([
    prisma.eventoGestaoChecklist.count({ where: { eventoId } }),
    prisma.eventoGestaoChecklist.count({ where: { eventoId, concluido: true } }),
    prisma.demanda.count({ where: { eventoGestaoId: eventoId } }),
    prisma.demanda.count({ where: { eventoGestaoId: eventoId, statusVisivel: "finalizado" } }),
  ])

  const totalItens = totalTarefas + totalDemandas
  const concluidos = tarefasConcluidas + demandasFinalizadas
  const pct = totalItens > 0 ? Math.round((concluidos / totalItens) * 100) : 0

  await prisma.eventoGestao.update({
    where: { id: eventoId },
    data: { percentualConclusao: pct },
  }).catch(() => null)

  return pct
}
