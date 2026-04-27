"use client"

import { useEffect, useRef, useState } from "react"
import {
  X, ExternalLink, Calendar, MapPin, User, Film, Tag,
  AlertTriangle, Clock, MessageSquare, Link2, Package, Clapperboard,
  ThumbsUp, ThumbsDown, CheckCircle2, Upload, Send, Loader2, Play, Trash2,
} from "lucide-react"
import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then(r => r.json())

const STATUS_LABEL: Record<string, string> = {
  pedido_criado: "Pedido Criado",
  aguardando_aprovacao_interna: "Aguardando Aprovação",
  aguardando_triagem: "Aguardando Triagem",
  urgencia_pendente_aprovacao: "Urgência Pendente",
  urgencia_aprovada: "Urgência Aprovada",
  planejamento: "Planejamento",
  videomaker_notificado: "VM Notificado",
  videomaker_aceitou: "VM Aceitou",
  videomaker_recusou: "VM Recusou",
  captacao_agendada: "Captação Agendada",
  captacao_realizada: "Captação Realizada",
  brutos_enviados: "Brutos Enviados",
  editor_atribuido: "Editor Atribuído",
  fila_edicao: "Fila de Edição",
  editando: "Editando",
  edicao_finalizada: "Edição Finalizada",
  revisao_pendente: "Revisão Pendente",
  revisao_reprovada: "Revisão Reprovada",
  aguardando_aprovacao_cliente: "Aguardando Cliente",
  aprovado_cliente: "Aprovado pelo Cliente",
  reprovado_cliente: "Reprovado pelo Cliente",
  aprovado: "Aprovado",
  ajuste_solicitado: "Ajuste Solicitado",
  impedimento: "Impedimento",
  postagem_pendente: "Para Postar",
  postado: "Postado",
  entregue_cliente: "Entregue ao Cliente",
  encerrado: "Encerrado",
  expirado: "Expirado",
}

const STATUS_COLOR: Record<string, string> = {
  editando: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  edicao_finalizada: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  aprovado: "bg-green-500/20 text-green-300 border-green-500/30",
  aprovado_cliente: "bg-green-500/20 text-green-300 border-green-500/30",
  postado: "bg-green-600/20 text-green-400 border-green-600/30",
  encerrado: "bg-zinc-700/60 text-zinc-400 border-zinc-600",
  impedimento: "bg-red-500/20 text-red-300 border-red-500/30",
  reprovado_cliente: "bg-red-500/20 text-red-300 border-red-500/30",
  revisao_reprovada: "bg-red-500/20 text-red-300 border-red-500/30",
  videomaker_recusou: "bg-red-500/20 text-red-300 border-red-500/30",
  captacao_agendada: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  captacao_realizada: "bg-amber-500/20 text-amber-300 border-amber-500/30",
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

function SidebarSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">
        {icon} {title}
      </p>
      {children}
    </div>
  )
}

export function DemandaModal({ demandaId, onClose }: DemandaModalProps) {
  const { data, mutate } = useSWR(demandaId ? `/api/demandas/${demandaId}` : null, fetcher)
  const demanda = data?.demanda

  const [aprovandoAcao, setAprovandoAcao] = useState<"aprovar" | "reprovar" | null>(null)
  const [motivoReprova, setMotivoReprova] = useState("")
  const [salvandoAprovacao, setSalvandoAprovacao] = useState(false)
  const [enviandoAprovacao, setEnviandoAprovacao] = useState(false)
  const fileRefAprovacao = useRef<HTMLInputElement>(null)
  // Brutos URL
  const [brutosUrlInput, setBrutosUrlInput] = useState("")
  const [showBrutosInput, setShowBrutosInput] = useState(false)
  const [savingBrutosUrl, setSavingBrutosUrl] = useState(false)
  // Excluir link
  const [deletingLink, setDeletingLink] = useState<"brutos" | "final" | null>(null)
  // Player de vídeo
  const [playerUrl, setPlayerUrl] = useState<string | null>(null)

  async function executarAprovacao(acao: "aprovar" | "reprovar") {
    if (!demandaId) return
    if (acao === "reprovar" && !motivoReprova.trim()) {
      setAprovandoAcao("reprovar")
      return
    }
    setSalvandoAprovacao(true)
    try {
      // "aprovado" e "ajuste_solicitado" são os StatusInterno válidos no schema
      const statusInterno = acao === "aprovar" ? "aprovado" : "ajuste_solicitado"
      await fetch(`/api/demandas/${demandaId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statusInterno,
          observacao: acao === "reprovar" ? motivoReprova : undefined,
        }),
      })
      setAprovandoAcao(null)
      setMotivoReprova("")
      mutate()
    } finally {
      setSalvandoAprovacao(false)
    }
  }

  // ── Upload via URL presigned (bypass limite Vercel) ──────────────────────
  async function uploadPresigned(file: File, tipo: "brutos" | "final"): Promise<string> {
    const contentType = file.type || "video/mp4"
    const urlRes = await fetch(
      `/api/demandas/${demandaId}/upload-url?tipo=${tipo}&contentType=${encodeURIComponent(contentType)}`
    )
    if (!urlRes.ok) {
      const err = await urlRes.json().catch(() => ({ error: "Erro ao gerar URL" }))
      throw new Error(err.error ?? "Erro ao gerar URL de upload")
    }
    const { uploadUrl, publicUrl } = await urlRes.json() as { uploadUrl: string; publicUrl: string }
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    })
    if (!uploadRes.ok) throw new Error(`Falha no upload: ${uploadRes.statusText}`)
    await fetch(`/api/demandas/${demandaId}/upload-video`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: publicUrl, tipo }),
    })
    return publicUrl
  }

  async function saveBrutosUrl() {
    if (!brutosUrlInput.trim()) return
    setSavingBrutosUrl(true)
    try {
      await fetch(`/api/demandas/${demandaId}/upload-video`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: brutosUrlInput.trim(), tipo: "brutos" }),
      })
      setBrutosUrlInput("")
      setShowBrutosInput(false)
      toast.success("✅ URL dos brutos salva!")
      mutate()
    } catch {
      toast.error("Erro ao salvar URL")
    } finally {
      setSavingBrutosUrl(false)
    }
  }

  async function deleteLink(tipo: "brutos" | "final") {
    if (!confirm(`Remover o link de ${tipo === "brutos" ? "brutos" : "vídeo final"}?`)) return
    setDeletingLink(tipo)
    try {
      await fetch(`/api/demandas/${demandaId}/upload-video`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: null, tipo }),
      })
      toast.success("Link removido!")
      mutate()
    } catch {
      toast.error("Erro ao remover link")
    } finally {
      setDeletingLink(null)
    }
  }

  function getThumbUrl(url: string): string | null {
    if (url.includes("youtu.be/")) {
      const id = url.split("youtu.be/")[1]?.split("?")[0]
      return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null
    }
    if (url.includes("youtube.com/watch")) {
      const id = new URLSearchParams(url.split("?")[1] ?? "").get("v")
      return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null
    }
    if (url.includes("drive.google.com")) {
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
      return match ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400` : null
    }
    return null // for direct mp4 we use <video> element
  }

  function getEmbedUrl(url: string): { type: "video" | "youtube" | "drive" | "external"; embedUrl: string } {
    if (url.includes("youtu.be/")) {
      const id = url.split("youtu.be/")[1]?.split("?")[0]
      return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` }
    }
    if (url.includes("youtube.com/watch")) {
      const id = new URLSearchParams(url.split("?")[1] ?? "").get("v") ?? ""
      return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` }
    }
    if (url.includes("drive.google.com")) {
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
      if (match) return { type: "drive", embedUrl: `https://drive.google.com/file/d/${match[1]}/preview` }
      return { type: "external", embedUrl: url }
    }
    if (/\.(mp4|mov|webm|avi)(\?|$)/i.test(url) || url.includes("supabase")) {
      return { type: "video", embedUrl: url }
    }
    return { type: "external", embedUrl: url }
  }

  async function handleEnviarParaAprovacao(file: File) {
    setEnviandoAprovacao(true)
    try {
      const url = await uploadPresigned(file, "final")
      const res = await fetch("/api/aprovacao-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandaId, urlVideo: url, expiresInDays: 7 }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao gerar link de aprovação")
      await fetch(`/api/demandas/${demandaId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusInterno: "revisao_pendente", origem: "manual" }),
      })
      toast.success("✅ Enviado! Link de aprovação enviado ao solicitante.")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviandoAprovacao(false)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  useEffect(() => {
    if (demandaId) document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [demandaId])

  if (!demandaId) return null

  const prio = PRIO_CONFIG[demanda?.prioridade as keyof typeof PRIO_CONFIG] ?? PRIO_CONFIG.normal
  const statusColor = STATUS_COLOR[demanda?.statusInterno] ?? "bg-zinc-700/60 text-zinc-300 border-zinc-600"
  const historicos = demanda?.historicos?.slice(0, 6) ?? []
  const comentarios = demanda?.comentarios ?? []
  const isVencida = demanda?.dataLimite && new Date(demanda.dataLimite) < new Date()

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal centralizado */}
      <div className="relative flex min-h-full items-start justify-center px-4 pt-12 pb-12">
        <div className="relative w-full max-w-5xl bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl animate-in fade-in zoom-in-95 duration-200">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              {demanda ? (
                <>
                  <span className="font-mono text-sm text-zinc-500">{demanda.codigo}</span>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border", prio.class)}>
                    {prio.label}
                  </span>
                </>
              ) : (
                <span className="text-sm text-zinc-500">Carregando...</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {demanda && (
                <Link
                  href={`/demandas/${demanda.id}`}
                  onClick={onClose}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 px-3 py-1.5 rounded-lg hover:border-zinc-600 transition-colors"
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

          {/* ── Body: duas colunas ──────────────────────────────────────── */}
          {!demanda ? (
            <div className="flex items-center justify-center py-24 text-zinc-500">
              <div className="animate-pulse">Carregando...</div>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_18rem] divide-x divide-zinc-800">

              {/* ── Coluna esquerda ──────────────────────────────────────── */}
              <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">

                {/* Título */}
                <div>
                  <h2 className="text-xl font-bold text-zinc-100 leading-snug mb-3">{demanda.titulo}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full border", statusColor)}>
                      {STATUS_LABEL[demanda.statusInterno] ?? demanda.statusInterno}
                    </span>
                    {demanda.tipoVideo && (
                      <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2.5 py-1 rounded-full">
                        {demanda.tipoVideo}
                      </span>
                    )}
                    {demanda.departamento && (
                      <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2.5 py-1 rounded-full capitalize">
                        {demanda.departamento}
                      </span>
                    )}
                    {demanda.classificacao && (
                      <span className={cn(
                        "text-xs font-semibold px-2.5 py-1 rounded-full border",
                        demanda.classificacao === "b2c"
                          ? "bg-pink-500/15 text-pink-400 border-pink-500/30"
                          : "bg-sky-500/15 text-sky-400 border-sky-500/30"
                      )}>
                        {demanda.classificacao.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Descrição */}
                {demanda.descricao && (
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                      {demanda.descricao}
                    </p>
                  </div>
                )}

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

                {/* Links */}
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">
                    <Link2 className="w-3 h-3" /> Links
                  </p>
                  <div className="space-y-2">
                    {/* Brutos — apenas URL (Drive) */}
                    {demanda.linkBrutos ? (
                      <div className="flex items-center gap-2">
                        <a href={demanda.linkBrutos} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 hover:underline flex-1 min-w-0">
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">📁 Brutos</span>
                        </a>
                        <button onClick={() => deleteLink("brutos")} disabled={!!deletingLink}
                          title="Remover link" className="text-zinc-600 hover:text-red-400 transition-colors shrink-0 disabled:opacity-40">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : showBrutosInput ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={brutosUrlInput}
                          onChange={e => setBrutosUrlInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && saveBrutosUrl()}
                          placeholder="https://drive.google.com/..."
                          className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 text-zinc-200 placeholder:text-zinc-600"
                        />
                        <button onClick={saveBrutosUrl} disabled={savingBrutosUrl || !brutosUrlInput.trim()}
                          className="text-xs bg-zinc-700 text-zinc-300 px-2.5 py-1.5 rounded-lg hover:bg-zinc-600 disabled:opacity-50">
                          {savingBrutosUrl ? "..." : "Salvar"}
                        </button>
                        <button onClick={() => { setShowBrutosInput(false); setBrutosUrlInput("") }}
                          className="text-zinc-500 hover:text-zinc-300">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setShowBrutosInput(true)}
                        className="text-xs text-zinc-600 hover:text-zinc-400 flex items-center gap-1 transition-colors">
                        + URL dos Brutos (Drive)
                      </button>
                    )}

                    {/* Vídeo Final — thumbnail card */}
                    {demanda.linkFinal && (() => {
                      const thumbUrl = getThumbUrl(demanda.linkFinal)
                      const isDirect = !thumbUrl
                      return (
                        <div
                          className="relative group/thumb rounded-xl overflow-hidden cursor-pointer aspect-video bg-zinc-800 border border-zinc-700/60 hover:border-purple-500/60 transition-colors"
                          onClick={() => setPlayerUrl(demanda.linkFinal)}
                        >
                          {/* Background: img for YouTube/Drive, video element for direct mp4 */}
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt="thumbnail"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <video
                              src={demanda.linkFinal}
                              preload="metadata"
                              muted
                              className="w-full h-full object-cover"
                            />
                          )}

                          {/* Dark overlay */}
                          <div className="absolute inset-0 bg-black/50 group-hover/thumb:bg-black/30 transition-colors" />

                          {/* Centered play button */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center group-hover/thumb:bg-white/30 group-hover/thumb:scale-110 transition-all duration-200">
                              <Play className="w-7 h-7 text-white ml-1" fill="white" />
                            </div>
                          </div>

                          {/* Label bottom-left */}
                          <div className="absolute bottom-2 left-2 text-[11px] text-white/80 font-medium bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">
                            🎬 Vídeo Final
                          </div>

                          {/* Delete top-right — appears on hover */}
                          <button
                            onClick={e => { e.stopPropagation(); deleteLink("final") }}
                            disabled={!!deletingLink}
                            title="Remover link"
                            className="absolute top-2 right-2 w-7 h-7 rounded bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-red-400 opacity-0 group-hover/thumb:opacity-100 transition-all disabled:opacity-30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })()}

                    {/* Referências */}
                    {demanda.referencia && demanda.referencia.split("\n").filter(Boolean).map((url: string, i: number, arr: string[]) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300 hover:underline transition-colors">
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span>📌 Referência{arr.length > 1 ? ` ${i + 1}` : ""}</span>
                      </a>
                    ))}
                    {demanda.linkPostagem && (
                      <a href={demanda.linkPostagem} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300 hover:underline transition-colors">
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span>🔗 Postagem</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Upload — apenas vídeo final (brutos = Drive URL acima) */}
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">
                    <Upload className="w-3 h-3" /> Upload
                  </p>
                  <input
                    ref={fileRefAprovacao}
                    type="file"
                    accept="video/*,.zip"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleEnviarParaAprovacao(f); e.target.value = "" }}
                  />
                  <button
                    onClick={() => fileRefAprovacao.current?.click()}
                    disabled={enviandoAprovacao}
                    className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors disabled:opacity-50 w-full"
                  >
                    {enviandoAprovacao ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {enviandoAprovacao ? "Enviando..." : "🚀 Enviar Vídeo para Aprovação"}
                  </button>
                  <p className="text-[10px] text-zinc-600 text-center mt-1">Upload → gera link → WhatsApp ao solicitante</p>
                </div>

                {/* Comentários */}
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">
                    <MessageSquare className="w-3 h-3" /> Comentários
                    {comentarios.length > 0 && (
                      <span className="ml-1 bg-zinc-700 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded-full font-normal">
                        {comentarios.length}
                      </span>
                    )}
                  </p>
                  {comentarios.length === 0 ? (
                    <p className="text-sm text-zinc-600 italic">Nenhum comentário ainda</p>
                  ) : (
                    <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                      {comentarios.map((c: { id: string; texto: string; createdAt: string; usuario?: { nome: string } }) => (
                        <div key={c.id} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 text-xs font-semibold text-zinc-300">
                            {(c.usuario?.nome ?? "S")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-zinc-300">{c.usuario?.nome ?? "Sistema"}</span>
                              <span className="text-[11px] text-zinc-600">
                                {format(new Date(c.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-400 break-words">{c.texto}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Coluna direita (sidebar) ─────────────────────────────── */}
              <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">

                {/* Equipe */}
                <SidebarSection title="Equipe" icon={<User className="w-3 h-3" />}>
                  <div className="space-y-3">
                    {demanda.solicitante && (
                      <div>
                        <p className="text-[11px] text-zinc-600 mb-0.5">Solicitante</p>
                        <p className="text-sm text-zinc-300 font-medium">{demanda.solicitante.nome}</p>
                        {demanda.solicitante.email && (
                          <p className="text-xs text-zinc-500">{demanda.solicitante.email}</p>
                        )}
                      </div>
                    )}
                    {!demanda.solicitante && demanda.nomeSolicitante && (
                      <div>
                        <p className="text-[11px] text-zinc-600 mb-0.5">Solicitante</p>
                        <p className="text-sm text-zinc-300 font-medium">{demanda.nomeSolicitante}</p>
                      </div>
                    )}
                    {demanda.videomaker && (
                      <div>
                        <p className="text-[11px] text-zinc-600 mb-0.5 flex items-center gap-1">
                          <Clapperboard className="w-3 h-3" /> Videomaker
                        </p>
                        <p className="text-sm text-zinc-300 font-medium">{demanda.videomaker.nome}</p>
                        {demanda.videomaker.cidade && (
                          <p className="text-xs text-zinc-500">{demanda.videomaker.cidade}</p>
                        )}
                      </div>
                    )}
                    {demanda.editor && (
                      <div>
                        <p className="text-[11px] text-zinc-600 mb-0.5 flex items-center gap-1">
                          <Film className="w-3 h-3" /> Editor
                        </p>
                        <p className="text-sm text-zinc-300 font-medium">{demanda.editor.nome}</p>
                        {demanda.editor.especialidade && (
                          <p className="text-xs text-zinc-500">{demanda.editor.especialidade}</p>
                        )}
                      </div>
                    )}
                  </div>
                </SidebarSection>

                {/* Datas */}
                <SidebarSection title="Datas" icon={<Calendar className="w-3 h-3" />}>
                  <div className="space-y-2">
                    {demanda.dataLimite && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Prazo</span>
                        <span className={cn("text-xs font-semibold", isVencida ? "text-red-400" : "text-zinc-300")}>
                          {format(new Date(demanda.dataLimite), "dd/MM/yyyy", { locale: ptBR })}
                          {isVencida && " ⚠️"}
                        </span>
                      </div>
                    )}
                    {demanda.dataCaptacao && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Captação</span>
                        <span className="text-xs text-zinc-300">
                          {format(new Date(demanda.dataCaptacao), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Criado</span>
                      <span className="text-xs text-zinc-400">
                        {format(new Date(demanda.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                </SidebarSection>

                {/* TDAH: Aprovação — botões visíveis quando na coluna de aprovação */}
                {demanda.statusVisivel === "aprovacao" && (
                  <SidebarSection title="Aprovação" icon={<CheckCircle2 className="w-3 h-3" />}>
                    {demanda.statusInterno === "aprovado" ? (
                      <div className="flex items-center gap-2 bg-green-950/40 border border-green-700/40 rounded-lg px-3 py-2">
                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                        <span className="text-sm text-green-400 font-medium">Aprovado ✅</span>
                      </div>
                    ) : demanda.statusInterno === "ajuste_solicitado" ? (
                      <div className="flex items-center gap-2 bg-red-950/40 border border-red-700/40 rounded-lg px-3 py-2">
                        <ThumbsDown className="w-4 h-4 text-red-400 shrink-0" />
                        <span className="text-sm text-red-400 font-medium">Ajuste solicitado — em revisão</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-zinc-500">Aguardando aprovação do cliente.</p>
                        {aprovandoAcao === "reprovar" ? (
                          <div className="space-y-2">
                            <textarea
                              rows={3}
                              placeholder="Descreva o motivo da reprovação..."
                              value={motivoReprova}
                              onChange={e => setMotivoReprova(e.target.value)}
                              className="w-full bg-zinc-800 border border-red-700/50 text-zinc-200 text-sm px-3 py-2 rounded-lg resize-none focus:outline-none focus:border-red-500"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => executarAprovacao("reprovar")}
                                disabled={salvandoAprovacao || !motivoReprova.trim()}
                                className="flex-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors disabled:opacity-40"
                              >
                                {salvandoAprovacao ? "Salvando..." : "Confirmar Reprovação"}
                              </button>
                              <button
                                onClick={() => { setAprovandoAcao(null); setMotivoReprova("") }}
                                className="px-3 text-zinc-400 hover:text-white text-xs border border-zinc-700 rounded-lg"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => executarAprovacao("aprovar")}
                              disabled={salvandoAprovacao}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors disabled:opacity-40"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" /> Aprovar
                            </button>
                            <button
                              onClick={() => setAprovandoAcao("reprovar")}
                              disabled={salvandoAprovacao}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-red-800/60 hover:bg-red-700 border border-red-700/50 text-red-300 hover:text-white text-xs font-semibold py-2 rounded-lg transition-colors disabled:opacity-40"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" /> Reprovar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </SidebarSection>
                )}

                {/* Produto */}
                {demanda.produtos?.length > 0 && (
                  <SidebarSection title="Produto" icon={<Package className="w-3 h-3" />}>
                    <span className="inline-block text-sm text-zinc-300 bg-zinc-800 border border-zinc-700 px-2.5 py-1 rounded-lg">
                      {demanda.produtos[0].produto?.nome ?? "—"}
                    </span>
                  </SidebarSection>
                )}

                {/* Localização */}
                {(demanda.cidade || demanda.localGravacao) && (
                  <SidebarSection title="Local" icon={<MapPin className="w-3 h-3" />}>
                    <div className="space-y-1">
                      {demanda.cidade && (
                        <p className="text-sm text-zinc-300">{demanda.cidade}</p>
                      )}
                      {demanda.localGravacao && (
                        <p className="text-xs text-zinc-500">{demanda.localGravacao}</p>
                      )}
                    </div>
                  </SidebarSection>
                )}

                {/* Histórico */}
                {historicos.length > 0 && (
                  <SidebarSection title="Histórico" icon={<Clock className="w-3 h-3" />}>
                    <div className="relative">
                      {/* linha vertical */}
                      <div className="absolute left-[5px] top-1 bottom-1 w-px bg-zinc-700" />
                      <div className="space-y-3 pl-5">
                        {historicos.map((h: { id: string; statusNovo: string; createdAt: string; usuario?: { nome: string }; origem?: string }) => (
                          <div key={h.id} className="relative">
                            {/* dot */}
                            <div className="absolute -left-5 top-1.5 w-2.5 h-2.5 rounded-full bg-zinc-700 border-2 border-zinc-600" />
                            <p className="text-xs text-zinc-300 font-medium leading-tight">
                              {STATUS_LABEL[h.statusNovo] ?? h.statusNovo}
                            </p>
                            <p className="text-[11px] text-zinc-600 mt-0.5">
                              {format(new Date(h.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                              {h.usuario?.nome && ` · ${h.usuario.nome}`}
                              {!h.usuario?.nome && h.origem && ` · ${h.origem}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </SidebarSection>
                )}

                {/* Tags */}
                {demanda.gestor && (
                  <SidebarSection title="Gestor" icon={<Tag className="w-3 h-3" />}>
                    <p className="text-sm text-zinc-300">{demanda.gestor.nome}</p>
                  </SidebarSection>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Player de vídeo (z-[60] acima do modal z-50) ────────────── */}
      {playerUrl && (() => {
        const { type, embedUrl } = getEmbedUrl(playerUrl)
        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
            onClick={() => setPlayerUrl(null)}
          >
            <div className="relative w-full max-w-4xl" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setPlayerUrl(null)}
                className="absolute -top-9 right-0 text-white/70 hover:text-white flex items-center gap-1.5 text-sm transition-colors"
              >
                <X className="w-4 h-4" /> Fechar
              </button>
              {type === "video" ? (
                <video src={embedUrl} controls autoPlay className="w-full rounded-xl bg-black max-h-[80vh]" />
              ) : type === "youtube" || type === "drive" ? (
                <iframe src={embedUrl} className="w-full aspect-video rounded-xl border-0" allowFullScreen />
              ) : (
                <div className="text-center text-white p-12 bg-zinc-900 rounded-xl">
                  <p className="mb-4 text-zinc-400">Não é possível reproduzir inline.</p>
                  <a href={playerUrl} target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300 underline">
                    Abrir em nova aba →
                  </a>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
