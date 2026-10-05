"use client"

import { AlertTriangle, Ban, Calendar, Clock, MapPin, User } from "lucide-react"
import card from "@/components/demandas/DemandCardModern.module.css"
import styles from "./JobsPreview.module.css"
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
// Mesmo desenho do card de Demandas (DemandCardModern.module.css): título,
// código e prioridade, etiquetas, rodapé com pessoas e prazo. O que muda é o
// conteúdo, que é o do Job: quando e onde é a captação, o que falta fazer e de
// quem é a vez. Sem botão de ação: o card leva ao Job, e é lá que se age.
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

/** Data + hora da captação. O prazo vai no rodapé, como no card de Demandas. */
function captacao(job: JobDoQuadro): string | null {
  if (!job.dataCaptacao) return null
  const d = new Date(job.dataCaptacao)
  const hora = d.getHours() || d.getMinutes()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null
  return hora ? `${formatarDataCurta(d)} · ${hora}` : formatarDataCurta(d)
}

// Os mesmos selos do card de Demandas. "Normal" não ganha selo.
const PRIORIDADE: Record<string, { label: string; classe: string }> = {
  urgente: { label: "Urgente", classe: "bg-red-500/15 text-red-300 border-red-500/30" },
  alta:    { label: "Alta",    classe: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  baixa:   { label: "Baixa",   classe: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
}

const iniciais = (nome: string) =>
  nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()

export function JobCard({ job, onAbrir }: { job: JobDoQuadro; onAbrir: (id: string) => void }) {
  const risco = nivelDeRisco(job)
  const responsavel = responsavelAtual(job)
  const acao = proximaAcao(job)
  const bloqueado = ehBloqueado(job.statusInterno)
  const cancelado = ehCancelado(job)
  const atraso = diasDeAtraso(job)
  const quando = captacao(job)
  const cliente = job.clienteFinalNome?.trim() || null
  const prio = job.prioridade ? PRIORIDADE[job.prioridade] : undefined

  // De quem é a vez vem primeiro; a equipe do Job completa a fila de avatares.
  const pessoas = [...new Set(
    [responsavel.nome, job.videomaker?.nome, job.editor?.nome].filter((n): n is string => Boolean(n))
  )]

  const abrir = () => onAbrir(job.id)

  return (
    <div
      data-card-surface
      onClick={abrir}
      className={cn(
        "group bg-zinc-800/80 rounded-lg border border-zinc-700/50 p-3 cursor-pointer hover:border-zinc-600 transition-all",
        card.card,
        job.prioridade === "urgente" && "border-l-[3px] border-l-red-500",
        job.prioridade === "alta" && "border-l-[3px] border-l-orange-500",
        job.statusVisivel === "finalizado" && "border-l-[3px] border-l-emerald-500 opacity-80",
        risco === "attention" && "border-l-[3px] border-l-amber-400",
        // Atraso vence os demais realces, como no card de Demandas.
        risco === "overdue" && "border-l-[3px] border-l-red-500",
      )}
    >
      {/* Cliente em destaque; o título do Job é o subtítulo. §34 põe a clínica
          antes. O botão é o alvo do teclado: o card inteiro também abre. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); abrir() }}
        aria-label={`Abrir job: ${cliente ?? job.titulo}`}
        className={cn("block w-full text-left line-clamp-2 rounded", card.title)}
      >
        {cliente ?? job.titulo}
      </button>
      {cliente && <p className={styles.subtitulo} title={job.titulo}>{job.titulo}</p>}

      <div className={cn("flex items-start justify-between gap-2", card.top)}>
        <span>{job.codigo}</span>
        {prio && (
          <div className="flex items-center gap-1">
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", prio.classe)}>{prio.label}</span>
          </div>
        )}
      </div>

      <div className={cn("flex flex-wrap", card.tags)}>
        {/* Atraso: dias quando dá para confiar no número, senão só o aviso.
            A base tem datas corrompidas que renderizariam "atrasado há 700 mil
            dias" — diasDeAtraso devolve null nesses casos. */}
        {risco === "overdue" && (
          <span className="tag-atrasada flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap bg-red-500/20 text-red-300 border border-red-500/40">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {atraso ? `Atrasado · ${atraso}d` : "Atrasado"}
          </span>
        )}
        {risco === "attention" && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/30">
            Vence hoje
          </span>
        )}
        {quando && (
          <span className={styles.etiqueta} title="Captação">
            <Clock className="w-3 h-3 shrink-0" />{quando}
          </span>
        )}
        {job.cidade && (
          <span className={cn(styles.etiqueta, "max-w-[150px]")} title={job.cidade}>
            <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{job.cidade}</span>
          </span>
        )}
      </div>

      {/* Próxima ação — §32 pede texto, não só cor */}
      <p className={cn(styles.acao, bloqueado ? "text-rose-400" : cancelado ? "text-zinc-500" : "text-zinc-300")}>
        {(bloqueado || cancelado) && <Ban className={cn("w-3.5 h-3.5 shrink-0", bloqueado ? "text-rose-400" : "text-zinc-500")} />}
        {risco === "overdue" && !bloqueado && !cancelado && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        <span className="truncate">{cancelado ? "Encerrado sem entrega" : acao}</span>
      </p>

      <div className={card.footer}>
        {/* De quem é a bola (§2): o papel fica escrito, não só no avatar. */}
        <div className={styles.vez}>
          <div
            className={card.people}
            aria-label={responsavel.nome ? `Vez de ${responsavel.nome} (${responsavel.papel})` : `Vez de: ${responsavel.papel}`}
          >
            {pessoas.slice(0, 3).map((nome, i) => <span key={nome} title={nome} data-tone={i % 3}>{iniciais(nome)}</span>)}
            {!responsavel.nome && pessoas.length === 0 && <span title={responsavel.papel}><User size={14} /></span>}
          </div>
          <span className={styles.papel} title={responsavel.nome ? `${responsavel.nome} · ${responsavel.papel}` : responsavel.papel}>
            {responsavel.papel}
          </span>
        </div>
        {job.dataLimite && (
          <span
            className={cn(card.date, risco === "overdue" && card.late, risco === "attention" && card.soon)}
            title={risco === "overdue" ? "Prazo vencido" : "Prazo"}
          >
            <Calendar size={14} />{formatarDataCurta(job.dataLimite)}
          </span>
        )}
      </div>
    </div>
  )
}
