"use client"

import { AlertTriangle, Calendar, Trash2, User, Pencil, Copy, MessageCircle, Paperclip } from "lucide-react"
import styles from "./DemandCardModern.module.css"
import { cn } from "@/lib/utils"
import { estaAtrasada, diasDeAtraso, STATUS_PRAZO_PAUSADO } from "@/lib/status"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { formatarDataCurta } from "@/lib/datas"
import { naoEnviadoAoCliente } from "@/lib/growth-kanban"
import { TagEspelho, type EspelhoDoCard } from "./TagEspelho"

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
    area?: string | null
    thumbnailUrl?: string | null
    classificacao?: string | null
    _count?: { comentarios?: number; arquivos?: number }
    videomaker?: { nome: string } | null
    linkFinal?: string | null
    linkCliente?: string | null
    dataLimite?: string | null
    videomakerId?: string | null
    editor?: { nome: string } | null
    designer?: { nome: string } | null
    responsavel?: { nome: string } | null
    responsaveis?: { usuario: { nome: string } }[]
    solicitante?: { nome: string } | null
    eventoGestao?: { id: string; nome: string } | null
    produtos?: { produto?: { nome: string } | null }[]
    /** Vem pronto do servidor — a tela não sabe o que é uma aresta. */
    espelho?: EspelhoDoCard | null
  }
  dragHandleProps?: Record<string, unknown>
  onDelete?: (id: string) => void
  onDuplicate?: (id: string) => void
  onOpen?: (id: string) => void
  onMarkPosted?: (id: string, tipo: string, link?: string) => Promise<void>
}

export function DemandaCard({ demanda, dragHandleProps, onDelete, onDuplicate, onOpen, onMarkPosted }: DemandaCardProps) {
  const router = useRouter()
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null)
  const thumbnail = demanda.thumbnailUrl && (/^https?:\/\//i.test(demanda.thumbnailUrl) || /^\/(?!\/)/.test(demanda.thumbnailUrl)) ? demanda.thumbnailUrl : null
  const people = [...new Set([
    ...(demanda.responsaveis ?? []).map(p => p.usuario.nome),
    demanda.responsavel?.nome, demanda.designer?.nome, demanda.videomaker?.nome, demanda.editor?.nome,
  ].filter((name): name is string => Boolean(name)))]
  const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase()
  const [showPostagemForm, setShowPostagemForm] = useState(false)
  const [postagemTipo, setPostagemTipo] = useState("feed")
  const [postagemLink, setPostagemLink] = useState("")
  const [confirmando, setConfirmando] = useState(false)
  const prio = prioridadeConfig[demanda.prioridade] ?? prioridadeConfig.normal
  const deptColor = deptColors[demanda.departamento] ?? "bg-zinc-700/50 text-zinc-400"

  const isOverdue = estaAtrasada(demanda)
  const isNearDeadline = demanda.dataLimite && !isOverdue &&
    new Date(demanda.dataLimite) < new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) &&
    !STATUS_PRAZO_PAUSADO.includes(demanda.statusVisivel ?? "")
  const diasAtraso = diasDeAtraso(demanda)

  const isCobertura = demanda.tipoVideo?.toLowerCase().includes("cobertura")
  const aguardandoVM = isCobertura && demanda.statusInterno === "videomaker_notificado"
  const semVM = isCobertura && !demanda.videomakerId && ["entrada", "producao"].includes(demanda.statusVisivel ?? "")
  // Está na coluna de aprovação mas não saiu por aqui. Pode ser aprovação
  // combinada por fora (WhatsApp, reunião) — legítimo — ou um card que alguém
  // empurrou e esqueceu. Os dois precisam ser distinguíveis de um envio real:
  // é este sinal que substitui a trava que exigia a arte para mover.
  const semEnvioAoCliente = naoEnviadoAoCliente(demanda)

  const handleClick = () => {
    if (onOpen) onOpen(demanda.id)
    else router.push(`/demandas/${demanda.id}`)
  }

  return (
    <div onClick={handleClick}>
      <div
        data-card-surface
        className={cn(
          "group bg-zinc-800/80 rounded-lg border border-zinc-700/50 p-3 cursor-pointer hover:border-zinc-600 hover:bg-zinc-750 transition-all",
          styles.card,
          // Prioridade (só aplica se não houver status especial)
          demanda.prioridade === "urgente" && "border-l-[3px] border-l-red-500",
          demanda.prioridade === "alta" && "border-l-[3px] border-l-orange-500",
          // Status visuais sobrepõem prioridade — usa valores reais do StatusInterno
          demanda.statusInterno === "aprovado" && "border-l-[3px] border-l-green-400 bg-green-950/10",
          demanda.statusInterno === "ajuste_solicitado" && "border-l-[3px] border-l-red-500 bg-red-950/20",
          demanda.statusVisivel === "finalizado" && "border-l-[3px] border-l-emerald-500 opacity-80",
          // Cobertura aguardando confirmação de VM
          aguardandoVM && "border-l-[3px] border-l-amber-400 bg-amber-950/10",
          // Atraso vence os demais realces. A borda é estática de propósito: quando
          // o card inteiro pulsava, uma coluna cheia de atrasadas tremia toda e
          // ficava ilegível. Quem pisca — devagar — é só a tag.
          isOverdue && "border-l-[3px] border-l-red-500 bg-red-950/20",
        )}
        {...dragHandleProps}
      >
        <div className={cn("flex items-start justify-between gap-2 mb-2", styles.top)}>
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

        {thumbnail && failedThumbnail !== thumbnail && <div className={styles.cover}>
          {/* A prévia vem do registro real; nunca substituímos por arte de demonstração. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img draggable={false} src={thumbnail} alt={`Prévia de ${demanda.titulo}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedThumbnail(thumbnail)} />
        </div>}
        <button type="button" onClick={(event) => { event.stopPropagation(); handleClick() }}
          className={cn("block w-full text-left text-sm font-medium text-zinc-200 leading-tight mb-2 line-clamp-2 focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2 rounded", styles.title)}
          aria-label={`Abrir demanda: ${demanda.titulo}`}>
          {demanda.titulo}
        </button>

        <div className={cn("flex flex-wrap gap-1 mb-2", styles.tags)}>
          {isOverdue && (
            <span className="tag-atrasada flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap bg-red-500/20 text-red-300 border border-red-500/40">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {diasAtraso ? `ATRASADA — ${diasAtraso}d` : "ATRASADA"}
            </span>
          )}
          <TagEspelho espelho={demanda.espelho} />
          {demanda.classificacao && <span className={styles.classification}>{demanda.classificacao.toUpperCase()}</span>}
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", deptColor)}>
            {demanda.departamento}
          </span>
          <span className="text-[10px] bg-zinc-700/50 text-zinc-400 px-1.5 py-0.5 rounded">
            {demanda.tipoVideo}
          </span>
          {demanda.eventoGestao && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-purple-500/15 text-purple-300 border-purple-500/30 max-w-[140px] truncate" title={demanda.eventoGestao.nome}>
              🎟️ {demanda.eventoGestao.nome}
            </span>
          )}
          {(demanda.produtos?.length ?? 0) > 0 && (() => {
            const nomes = (demanda.produtos ?? []).map(p => p.produto?.nome).filter(Boolean) as string[]
            if (nomes.length === 0) return null
            return (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-sky-500/15 text-sky-300 border-sky-500/30 max-w-[150px] truncate" title={nomes.join(", ")}>
                📦 {nomes[0]}{nomes.length > 1 ? ` +${nomes.length - 1}` : ""}
              </span>
            )
          })()}
          {semEnvioAoCliente && (
            <span
              title="Nenhum link de aprovação foi gerado — o cliente não recebeu nada pelo NuFlow. Pode ter sido combinado por fora, ou ter ficado para trás."
              className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/30"
            >
              ⚠️ Não enviado
            </span>
          )}
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
          {demanda.statusVisivel === "finalizado" && !demanda.linkFinal && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-700/50 text-zinc-500 border-zinc-600/50">
              🚫 sem vídeo
            </span>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.people} aria-label={people.length ? `Responsáveis: ${people.join(", ")}` : "Sem responsável"}>
            {people.slice(0, 3).map((name, index) => <span key={name} title={name} data-tone={index % 3}>{initials(name)}</span>)}
            {people.length > 3 && <span title={people.slice(3).join(", ")}>+{people.length - 3}</span>}
            {!people.length && <span title="Sem responsável"><User size={14} /></span>}
          </div>
          {demanda.dataLimite && <span className={cn(styles.date, isOverdue && styles.late, isNearDeadline && styles.soon)} title={isOverdue ? "Prazo vencido" : isNearDeadline ? "Vence em até 3 dias" : undefined}><Calendar size={14} />{formatarDataCurta(demanda.dataLimite)}</span>}
          {demanda._count?.comentarios != null && <span title="Comentários" aria-label={`${demanda._count.comentarios} comentários`}><MessageCircle size={14} />{demanda._count.comentarios}</span>}
          {!!demanda._count?.arquivos && <span title="Arquivos" aria-label={`${demanda._count.arquivos} arquivos`}><Paperclip size={14} />{demanda._count.arquivos}</span>}
        </div>

        {/* ── Botão "Marcar como Postado" (só para coluna Para Postar) ─ */}
        {demanda.statusVisivel === "para_postar" && onMarkPosted && (
          <div className={cn("mt-3 border-t border-zinc-700/50 pt-3", styles.posting)} onClick={e => e.stopPropagation()}>
            {!showPostagemForm ? (
              <button
                onClick={() => setShowPostagemForm(true)}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-300 rounded-lg py-1.5 transition-colors"
              >
                📱 Marcar como Postado
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-300">Onde foi postado?</p>
                <div className="grid grid-cols-3 gap-1">
                  {(["feed", "story", "reels", "youtube", "outro"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setPostagemTipo(t)}
                      className={cn(
                        "text-xs py-1 rounded-lg border transition-colors capitalize",
                        postagemTipo === t
                          ? "bg-cyan-600 border-cyan-500 text-white"
                          : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <input
                  value={postagemLink}
                  onChange={e => setPostagemLink(e.target.value)}
                  placeholder="Link da postagem (opcional)"
                  className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
                <div className="flex gap-1.5">
                  <button
                    disabled={confirmando}
                    onClick={async () => {
                      setConfirmando(true)
                      try {
                        await onMarkPosted(demanda.id, postagemTipo, postagemLink || undefined)
                        setShowPostagemForm(false)
                        setPostagemLink("")
                      } finally {
                        setConfirmando(false)
                      }
                    }}
                    className="flex-1 text-xs bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg py-1.5 font-semibold disabled:opacity-50 transition-colors"
                  >
                    {confirmando ? "Salvando..." : "✓ Confirmar"}
                  </button>
                  <button
                    onClick={() => { setShowPostagemForm(false); setPostagemLink("") }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 px-2 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
