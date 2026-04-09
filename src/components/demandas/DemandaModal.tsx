"use client"

import { useEffect, useRef } from "react"
import { X, ExternalLink, Calendar, MapPin, User, Film, Tag, AlertTriangle, Clock, MessageSquare } from "lucide-react"
import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then(r => r.json())

const STATUS_LABEL: Record<string, string> = {
  pedido_criado: "Pedido Criado",
  aguardando_aprovacao_interna: "Aguardando Aprovação",
  aguardando_triagem: "Aguardando Triagem",
  urgencia_pendente_aprovacao: "Urgência Pendente",
  urgencia_aprovada: "Urgência Aprovada",
  planejamento: "Planejamento",
  videomaker_notificado: "Videomaker Notificado",
  videomaker_aceitou: "Videomaker Aceitou",
  videomaker_recusou: "Videomaker Recusou",
  captacao_agendada: "Captação Agendada",
  captacao_realizada: "Captação Realizada",
  brutos_enviados: "Brutos Enviados",
  editor_atribuido: "Editor Atribuído",
  fila_edicao: "Fila de Edição",
  editando: "Editando",
  edicao_finalizada: "Edição Finalizada",
  revisao_pendente: "Revisão Pendente",
  aprovado: "Aprovado",
  ajuste_solicitado: "Ajuste Solicitado",
  reprovado_cliente: "Reprovado pelo Cliente",
  impedimento: "Impedimento",
  postagem_pendente: "Postagem Pendente",
  postado: "Postado",
  entregue_cliente: "Entregue ao Cliente",
  encerrado: "Encerrado",
}

const PRIO_CONFIG = {
  urgente: { label: "URGENTE", class: "bg-red-500/15 text-red-400 border-red-500/30" },
  alta: { label: "ALTA", class: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  normal: { label: "NORMAL", class: "bg-zinc-700/50 text-zinc-400 border-zinc-600" },
}

interface DemandaModalProps {
  demandaId: string | null
  onClose: () => void
}

export function DemandaModal({ demandaId, onClose }: DemandaModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const { data } = useSWR(demandaId ? `/api/demandas/${demandaId}` : null, fetcher)
  const demanda = data?.demanda

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (demandaId) document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [demandaId])

  if (!demandaId) return null

  const prio = PRIO_CONFIG[demanda?.prioridade as keyof typeof PRIO_CONFIG] ?? PRIO_CONFIG.normal
  const historicos = demanda?.historicos?.slice(0, 5) ?? []
  const comentarios = demanda?.comentarios?.slice(0, 5) ?? []

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            {demanda && (
              <>
                <span className="font-mono text-sm text-zinc-500">{demanda.codigo}</span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border", prio.class)}>
                  {prio.label}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {demanda && (
              <Link
                href={`/demandas/${demanda.id}`}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 px-3 py-1.5 rounded-lg hover:border-zinc-600 transition-colors"
                onClick={onClose}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ver completo
              </Link>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {!demanda ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              <div className="animate-pulse">Carregando...</div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Title + Status */}
              <div>
                <h2 className="text-xl font-semibold text-zinc-100 mb-2">{demanda.titulo}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-full">
                    {STATUS_LABEL[demanda.statusInterno] ?? demanda.statusInterno}
                  </span>
                  <span className="text-xs bg-zinc-800/50 text-zinc-400 px-2 py-1 rounded-full capitalize">
                    {demanda.departamento}
                  </span>
                  <span className="text-xs bg-zinc-800/50 text-zinc-400 px-2 py-1 rounded-full">
                    {demanda.tipoVideo}
                  </span>
                </div>
              </div>

              {/* Descrição */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-sm text-zinc-400 leading-relaxed">{demanda.descricao}</p>
              </div>

              {/* Impedimento */}
              {demanda.motivoImpedimento && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-400 mb-1">Impedimento</p>
                    <p className="text-sm text-red-300">{demanda.motivoImpedimento}</p>
                  </div>
                </div>
              )}

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {demanda.solicitante && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <User className="w-4 h-4 text-zinc-600 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-600">Solicitante</p>
                      <p className="text-zinc-300">{demanda.solicitante.nome}</p>
                    </div>
                  </div>
                )}
                {demanda.editor && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Film className="w-4 h-4 text-zinc-600 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-600">Editor</p>
                      <p className="text-zinc-300">{demanda.editor.nome}</p>
                    </div>
                  </div>
                )}
                {demanda.videomaker && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Tag className="w-4 h-4 text-zinc-600 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-600">Videomaker</p>
                      <p className="text-zinc-300">{demanda.videomaker.nome}</p>
                    </div>
                  </div>
                )}
                {demanda.cidade && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <MapPin className="w-4 h-4 text-zinc-600 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-600">Cidade</p>
                      <p className="text-zinc-300">{demanda.cidade}</p>
                    </div>
                  </div>
                )}
                {demanda.dataLimite && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Calendar className="w-4 h-4 text-zinc-600 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-600">Data Limite</p>
                      <p className={cn("text-zinc-300", new Date(demanda.dataLimite) < new Date() && "text-red-400 font-semibold")}>
                        {format(new Date(demanda.dataLimite), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                )}
                {demanda.dataCaptacao && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Clock className="w-4 h-4 text-zinc-600 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-600">Captação</p>
                      <p className="text-zinc-300">
                        {format(new Date(demanda.dataCaptacao), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Links */}
              {(demanda.linkBrutos || demanda.linkFinal || demanda.linkPostagem) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Links</p>
                  {demanda.linkBrutos && (
                    <a href={demanda.linkBrutos} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-purple-400 hover:underline">
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" /> Brutos
                    </a>
                  )}
                  {demanda.linkFinal && (
                    <a href={demanda.linkFinal} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-purple-400 hover:underline">
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" /> Vídeo Final
                    </a>
                  )}
                  {demanda.linkPostagem && (
                    <a href={demanda.linkPostagem} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-purple-400 hover:underline">
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" /> Link de Postagem
                    </a>
                  )}
                </div>
              )}

              {/* Comentários */}
              {comentarios.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> Comentários recentes
                  </p>
                  <div className="space-y-2">
                    {comentarios.map((c: { id: string; comentario: string; createdAt: string; usuario?: { nome: string } }) => (
                      <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-zinc-400">{c.usuario?.nome ?? "Sistema"}</span>
                          <span className="text-xs text-zinc-600">
                            {format(new Date(c.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-300">{c.comentario}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico */}
              {historicos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Histórico recente
                  </p>
                  <div className="space-y-1.5">
                    {historicos.map((h: { id: string; statusNovo: string; createdAt: string; usuario?: { nome: string } }) => (
                      <div key={h.id} className="flex items-center justify-between text-xs text-zinc-500">
                        <span className="text-zinc-400">{STATUS_LABEL[h.statusNovo] ?? h.statusNovo}</span>
                        <span>{format(new Date(h.createdAt), "dd/MM HH:mm", { locale: ptBR })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="pb-4">
                <Link
                  href={`/demandas/${demanda.id}`}
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 w-full bg-white text-zinc-900 font-semibold text-sm py-3 rounded-xl hover:bg-zinc-100 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir demanda completa
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
