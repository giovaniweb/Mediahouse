"use client"

import { AlertTriangle, Ban, Clock, MapPin, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatarDataCurta } from "@/lib/datas"
import { diasDeAtraso } from "@/lib/status"
import {
  ehBloqueado,
  ehCancelado,
  nivelDeRisco,
  proximaAcao,
  responsavelAtual,
  type JobParaLeitura,
} from "@/lib/job-fase"

// Card do Job — §34: "Mostrar somente dados essenciais. Evitar cards gigantes.
// Informações detalhadas pertencem à página do Job."
//
// Sete linhas de informação, nesta ordem de leitura: identificação, cliente,
// quando/onde, de quem é a bola, o que falta fazer, e o alerta quando há.
// Sem botão de ação: o card leva ao Job, e é lá que se age.
export type JobDoQuadro = JobParaLeitura & {
  id: string
  codigo: string
  titulo: string
  clienteFinalNome?: string | null
  cidade?: string | null
  dataCaptacao?: string | Date | null
  dataLimite?: string | Date | null
  statusVisivel?: string | null
  prioridade?: string | null
  /** Marcas de origem — usadas por `ehJob`; o card não as exibe (§34). */
  tipoVideo?: string | null
  departamento?: string | null
}

/** Data + hora da captação, ou o prazo quando ainda não há captação marcada. */
function quando(job: JobDoQuadro): { texto: string; ehPrazo: boolean } | null {
  if (job.dataCaptacao) {
    const d = new Date(job.dataCaptacao)
    const hora = d.getHours() || d.getMinutes()
      ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : null
    return { texto: hora ? `${formatarDataCurta(d)} · ${hora}` : formatarDataCurta(d), ehPrazo: false }
  }
  if (job.dataLimite) return { texto: `Prazo ${formatarDataCurta(job.dataLimite)}`, ehPrazo: true }
  return null
}

const riscoEstilo = {
  overdue:   "border-l-red-500",
  attention: "border-l-amber-500",
  on_time:   "border-l-transparent",
} as const

export function JobCard({ job, onAbrir }: { job: JobDoQuadro; onAbrir: (id: string) => void }) {
  const risco = nivelDeRisco(job)
  const responsavel = responsavelAtual(job)
  const acao = proximaAcao(job)
  const bloqueado = ehBloqueado(job.statusInterno)
  const cancelado = ehCancelado(job)
  const atraso = diasDeAtraso(job)
  const momento = quando(job)
  const cliente = job.clienteFinalNome?.trim() || null

  return (
    <button
      type="button"
      onClick={() => onAbrir(job.id)}
      className={cn(
        "w-full text-left bg-zinc-900 border border-zinc-800 border-l-2 rounded-lg p-3",
        "hover:border-zinc-700 hover:bg-zinc-800/60 transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500",
        riscoEstilo[risco]
      )}
    >
      {/* Identificação */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-mono text-zinc-500">{job.codigo}</span>
        {job.prioridade === "urgente" && (
          <span className="text-[10px] font-semibold text-red-400 tracking-wide">URGENTE</span>
        )}
      </div>

      {/* Cliente em destaque; o título é o subtítulo. §34 põe a clínica antes. */}
      <p className="mt-1 text-sm font-medium text-zinc-100 leading-snug line-clamp-2">
        {cliente ?? job.titulo}
      </p>
      {cliente && (
        <p className="text-xs text-zinc-500 leading-snug line-clamp-1">{job.titulo}</p>
      )}

      {/* Quando e onde */}
      {(momento || job.cidade) && (
        <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
          {momento && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" />
              {momento.texto}
            </span>
          )}
          {job.cidade && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{job.cidade}</span>
            </span>
          )}
        </div>
      )}

      {/* De quem é a bola (§2) */}
      <div className="mt-2 flex items-center gap-1 text-xs text-zinc-400">
        <User className="w-3 h-3 shrink-0" />
        <span className="truncate">
          {responsavel.nome ?? <span className="text-zinc-500">{responsavel.papel}</span>}
          {responsavel.nome && (
            <span className="text-zinc-600"> · {responsavel.papel}</span>
          )}
        </span>
      </div>

      {/* Próxima ação — §32 pede texto, não só cor */}
      <div className="mt-2 pt-2 border-t border-zinc-800/80 flex items-center gap-1.5">
        {bloqueado && <Ban className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
        {cancelado && <Ban className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
        {risco === "overdue" && !bloqueado && (
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        )}
        <span
          className={cn(
            "text-xs truncate",
            bloqueado ? "text-rose-400" : cancelado ? "text-zinc-500" : "text-zinc-300"
          )}
        >
          {cancelado ? "Encerrado sem entrega" : acao}
        </span>
      </div>

      {/* Atraso: dias quando dá para confiar no número, senão só o aviso.
          A base tem datas corrompidas que renderizariam "atrasada há 700 mil
          dias" — diasDeAtraso devolve null nesses casos. */}
      {risco === "overdue" && (
        <p className="mt-1 text-[11px] text-red-400">
          {atraso ? `Atrasado há ${atraso} ${atraso === 1 ? "dia" : "dias"}` : "Atrasado"}
        </p>
      )}
      {risco === "attention" && (
        <p className="mt-1 text-[11px] text-amber-400">Vence hoje</p>
      )}
    </button>
  )
}
