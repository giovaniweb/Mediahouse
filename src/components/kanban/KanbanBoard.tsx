"use client"

import { DragDropContext, Draggable, DropResult } from "@hello-pangea/dnd"
import { StrictModeDroppable } from "./StrictModeDroppable"
import { DemandaCard } from "@/components/demandas/DemandaCard"
import { cn } from "@/lib/utils"
import { Plus } from "lucide-react"
import Link from "next/link"

export const COLUNAS = [
  { id: "entrada", label: "Entrada", color: "border-t-zinc-500", dot: "bg-zinc-400" },
  { id: "producao", label: "Produção", color: "border-t-blue-500", dot: "bg-blue-500" },
  { id: "edicao", label: "Edição", color: "border-t-purple-500", dot: "bg-purple-500" },
  { id: "aprovacao", label: "Aprovação", color: "border-t-amber-500", dot: "bg-amber-500" },
  { id: "para_postar", label: "Para Postar", color: "border-t-cyan-500", dot: "bg-cyan-500" },
  { id: "finalizado", label: "Concluído", color: "border-t-emerald-500", dot: "bg-emerald-500" },
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
                "flex-shrink-0 w-72 bg-zinc-900/50 rounded-xl border border-zinc-800 border-t-[3px] flex flex-col",
                col.color
              )}
            >
              {/* Header da coluna */}
              <div className="flex items-center justify-between px-3 py-3">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", col.dot)} />
                  <span className="font-semibold text-sm text-zinc-200">{col.label}</span>
                  <span className="text-xs bg-zinc-800 text-zinc-400 rounded-full px-2 py-0.5 font-medium border border-zinc-700">
                    {items.length}
                  </span>
                </div>
                {col.id === "entrada" && (
                  <Link href="/demandas/nova">
                    <button className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                  </Link>
                )}
              </div>

              {/* Cards */}
              <StrictModeDroppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex-1 px-2 pb-2 space-y-2 min-h-24 rounded-b-xl transition-colors",
                      snapshot.isDraggingOver && "bg-zinc-800/50"
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
              </StrictModeDroppable>
            </div>
          )
        })}
      </div>
    </DragDropContext>
  )
}
