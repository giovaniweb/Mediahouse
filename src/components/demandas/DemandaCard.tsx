"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle, Calendar, Trash2, User, Video, Pencil, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

const prioridadeConfig = {
  urgente: { label: "URGENTE", class: "bg-red-500/15 text-red-400 border-red-500/30" },
  alta: { label: "ALTA", class: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  normal: { label: "NORMAL", class: "bg-zinc-700/50 text-zinc-400 border-zinc-600" },
  baixa: { label: "BAIXA", class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
}

const deptColors: Record<string, string> = {
  growth: "bg-purple-500/15 text-purple-400",
  eventos: "bg-blue-500/15 text-blue-400",
  institucional: "bg-zinc-700/50 text-zinc-400",
  rh: "bg-teal-500/15 text-teal-400",
  comercial: "bg-amber-500/15 text-amber-400",
  social_media: "bg-pink-500/15 text-pink-400",
  audiovisual: "bg-indigo-500/15 text-indigo-400",
  outros: "bg-zinc-700/50 text-zinc-400",
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
    statusVisivel?: string
    dataLimite?: string | null
    videomakerId?: string | null
    editor?: { nome: string } | null
    solicitante?: { nome: string } | null
  }
  dragHandleProps?: Record<string, unknown>
  onDelete?: (id: string) => void
  onDuplicate?: (id: string) => void
  onOpen?: (id: string) => void
}

export function DemandaCard({ demanda, dragHandleProps, onDelete, onDuplicate, onOpen }: DemandaCardProps) {
  const router = useRouter()
  const prio = prioridadeConfig[demanda.prioridade] ?? prioridadeConfig.normal
  const deptColor = deptColors[demanda.departamento] ?? "bg-zinc-700/50 text-zinc-400"

  const isOverdue = demanda.dataLimite && new Date(demanda.dataLimite) < new Date()
  const isNearDeadline = demanda.dataLimite && !isOverdue &&
    new Date(demanda.dataLimite) < new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

  const isCobertura = demanda.tipoVideo?.toLowerCase().includes("cobertura")
  const aguardandoVM = isCobertura && demanda.statusInterno === "videomaker_notificado"
  const semVM = isCobertura && !demanda.videomakerId && ["entrada", "producao"].includes(demanda.statusVisivel ?? "")

  const handleClick = () => {
    if (onOpen) onOpen(demanda.id)
    else router.push(`/demandas/${demanda.id}`)
  }

  return (
    <div onClick={handleClick}>
      <div
        className={cn(
          "group bg-zinc-800/80 rounded-lg border border-zinc-700/50 p-3 cursor-pointer hover:border-zinc-600 hover:bg-zinc-750 transition-all",
          // Prioridade (só aplica se não houver status especial)
          demanda.prioridade === "urgente" && "border-l-[3px] border-l-red-500",
          demanda.prioridade === "alta" && "border-l-[3px] border-l-orange-500",
          // Status visuais sobrepõem prioridade — usa valores reais do StatusInterno
          demanda.statusInterno === "aprovado" && "border-l-[3px] border-l-green-400 bg-green-950/10",
          demanda.statusInterno === "ajuste_solicitado" && "border-l-[3px] border-l-red-500 bg-red-950/20",
          demanda.statusVisivel === "finalizado" && "border-l-[3px] border-l-emerald-500 opacity-80",
          // Cobertura aguardando confirmação de VM
          aguardandoVM && "border-l-[3px] border-l-amber-400 bg-amber-950/10",
        )}
        {...dragHandleProps}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-[11px] font-mono text-zinc-500">{demanda.codigo}</span>
          <div className="flex items-center gap-1">
            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", prio.class)}>
              {prio.label}
            </span>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/demandas/${demanda.id}?edit=true`) }}
              className="p-0.5 rounded hover:bg-zinc-600/40 text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100"
              title="Editar demanda"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {onDuplicate && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDuplicate(demanda.id) }}
                className="p-0.5 rounded hover:bg-blue-500/20 text-zinc-600 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Duplicar demanda"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(demanda.id) }}
                className="p-0.5 rounded hover:bg-red-500/20 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Excluir demanda"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="text-sm font-medium text-zinc-200 leading-tight mb-2 line-clamp-2">
          {demanda.titulo}
        </p>

        <div className="flex flex-wrap gap-1 mb-2">
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", deptColor)}>
            {demanda.departamento}
          </span>
          <span className="text-[10px] bg-zinc-700/50 text-zinc-400 px-1.5 py-0.5 rounded">
            {demanda.tipoVideo}
          </span>
          {aguardandoVM && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/30">
              ⏳ Aguardando VM
            </span>
          )}
          {semVM && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-orange-500/15 text-orange-400 border-orange-500/30">
              📷 Sem VM
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500 mt-2 pt-2 border-t border-zinc-700/30">
          <div className="flex items-center gap-1">
            {demanda.statusVisivel === "finalizado" ? (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 font-medium">✅ Concluído</span>
            ) : demanda.editor ? (
              <><User className="w-3 h-3" /><span className="text-zinc-400">{demanda.editor.nome.split(" ")[0]}</span></>
            ) : (
              <><Video className="w-3 h-3 text-zinc-600" /><span className="text-zinc-600">sem editor</span></>
            )}
          </div>
          {demanda.dataLimite && demanda.statusVisivel !== "finalizado" && (
            <div className={cn("flex items-center gap-1",
              isOverdue && "text-red-400 font-semibold",
              isNearDeadline && "text-amber-400"
            )}>
              {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
              <span>{format(new Date(demanda.dataLimite), "dd/MM", { locale: ptBR })}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
