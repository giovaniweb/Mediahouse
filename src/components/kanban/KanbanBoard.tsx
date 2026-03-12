"use client"

import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd"
import { DemandaCard } from "@/components/demandas/DemandaCard"
import { cn } from "@/lib/utils"
import { Plus } from "lucide-react"
import Link from "next/link"

export const COLUNAS = [
  { id: "entrada", label: "Entrada", color: "border-t-zinc-400" },
  { id: "producao", label: "Produção", color: "border-t-blue-500" },
  { id: "edicao", label: "Edição", color: "border-t-purple-500" },
  { id: "aprovacao", label: "Aprovação", color: "border-t-yellow-500" },
  { id: "para_postar", label: "Para Postar", color: "border-t-green-500" },
  { id: "concluido", label: "Concluído", color: "border-t-zinc-300" },
] as const

type StatusVisivel = (typeof COLUNAS)[number]["id"]

interface Demanda {
  id: string
  codigo: string
  titulo: string
  departamento: string
  tipoVideo: string
  prioridade: "urgente" | "alta" | "normal" | "baixa"
  statusVisivel: StatusVisivel
  statusInterno: string
  dataLimite?: string | null
  editor?: { nome: string } | null
  solicitante?: { nome: string } | null
}

interface KanbanBoardProps {
  demandas: Demanda[]
  onMove: (demandaId: string, novoStatus: StatusVisivel) => void
}

export function KanbanBoard({ demandas, onMove }: KanbanBoardProps) {
  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    const destinoCol = result.destination.droppableId as StatusVisivel
    const origemCol = result.source.droppableId as StatusVisivel
    if (destinoCol === origemCol) return
    onMove(result.draggableId, destinoCol)
  }

  const byCol = (colId: StatusVisivel) =>
    demandas.filter((d) => d.statusVisivel === colId)

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 h-full">
        {COLUNAS.map((col) => {
          const items = byCol(col.id)
          return (
            <div
              key={col.id}
              className={cn(
                "flex-shrink-0 w-64 bg-zinc-50 rounded-xl border border-t-4 flex flex-col",
                col.color
              )}
            >
              {/* Header da coluna */}
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-zinc-700">{col.label}</span>
                  <span className="text-xs bg-zinc-200 text-zinc-600 rounded-full px-1.5 py-0.5 font-medium">
                    {items.length}
                  </span>
                </div>
                {col.id === "entrada" && (
                  <Link href="/demandas/nova">
                    <button className="p-1 rounded hover:bg-zinc-200 text-zinc-500">
                      <Plus className="w-4 h-4" />
                    </button>
                  </Link>
                )}
              </div>

              {/* Cards */}
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex-1 px-2 pb-2 space-y-2 min-h-24 rounded-b-xl transition-colors",
                      snapshot.isDraggingOver && "bg-zinc-100"
                    )}
                  >
                    {items.map((demanda, index) => (
                      <Draggable key={demanda.id} draggableId={demanda.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={cn(snapshot.isDragging && "rotate-1 opacity-90")}
                          >
                            <DemandaCard demanda={demanda} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          )
        })}
      </div>
    </DragDropContext>
  )
}
