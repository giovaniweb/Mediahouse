"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle, Calendar, Clock, User, Video } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

const prioridadeConfig = {
  urgente: { label: "URGENTE", class: "bg-red-100 text-red-700 border-red-200" },
  alta: { label: "ALTA", class: "bg-orange-100 text-orange-700 border-orange-200" },
  normal: { label: "NORMAL", class: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  baixa: { label: "BAIXA", class: "bg-green-50 text-green-600 border-green-200" },
}

const deptColors: Record<string, string> = {
  growth: "bg-purple-100 text-purple-700",
  eventos: "bg-blue-100 text-blue-700",
  institucional: "bg-zinc-100 text-zinc-700",
  rh: "bg-teal-100 text-teal-700",
  comercial: "bg-amber-100 text-amber-700",
  social_media: "bg-pink-100 text-pink-700",
}

interface DemandaCardProps {
  demanda: {
    id: string
    codigo: string
    titulo: string
    departamento: string
    tipoVideo: string
    prioridade: "urgente" | "alta" | "normal" | "baixa"
    statusInterno: string
    dataLimite?: string | null
    editor?: { nome: string } | null
    solicitante?: { nome: string } | null
  }
  dragHandleProps?: Record<string, unknown>
}

export function DemandaCard({ demanda, dragHandleProps }: DemandaCardProps) {
  const prio = prioridadeConfig[demanda.prioridade] ?? prioridadeConfig.normal
  const deptColor = deptColors[demanda.departamento] ?? "bg-zinc-100 text-zinc-600"

  const isOverdue =
    demanda.dataLimite && new Date(demanda.dataLimite) < new Date()
  const isNearDeadline =
    demanda.dataLimite &&
    !isOverdue &&
    new Date(demanda.dataLimite) < new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

  return (
    <Link href={`/demandas/${demanda.id}`}>
      <div
        className={cn(
          "bg-white rounded-lg border shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow",
          demanda.prioridade === "urgente" && "border-l-4 border-l-red-500",
          demanda.prioridade === "alta" && "border-l-4 border-l-orange-400"
        )}
        {...dragHandleProps}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-mono text-zinc-400">{demanda.codigo}</span>
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", prio.class)}>
            {prio.label}
          </span>
        </div>

        {/* Título */}
        <p className="text-sm font-medium text-zinc-800 leading-tight mb-2 line-clamp-2">
          {demanda.titulo}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-2">
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", deptColor)}>
            {demanda.departamento}
          </span>
          <span className="text-[10px] bg-zinc-50 text-zinc-500 px-1.5 py-0.5 rounded border">
            {demanda.tipoVideo}
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-zinc-400 mt-2 pt-2 border-t border-zinc-50">
          <div className="flex items-center gap-1">
            {demanda.editor ? (
              <>
                <User className="w-3 h-3" />
                <span>{demanda.editor.nome.split(" ")[0]}</span>
              </>
            ) : (
              <>
                <Video className="w-3 h-3" />
                <span className="text-zinc-300">sem editor</span>
              </>
            )}
          </div>

          {demanda.dataLimite && (
            <div
              className={cn(
                "flex items-center gap-1",
                isOverdue && "text-red-500 font-semibold",
                isNearDeadline && "text-yellow-600"
              )}
            >
              {isOverdue ? (
                <AlertTriangle className="w-3 h-3" />
              ) : (
                <Calendar className="w-3 h-3" />
              )}
              <span>
                {format(new Date(demanda.dataLimite), "dd/MM", { locale: ptBR })}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
