"use client"

import { useEffect, useRef, useState } from "react"
import {
  X, ExternalLink, Calendar, MapPin, User, Film, Tag,
  AlertTriangle, Clock, MessageSquare, Link2, Package, Clapperboard,
  ThumbsUp, ThumbsDown, CheckCircle2, Upload, Send, Loader2, Play, Trash2, Download, Copy, Plus,
} from "lucide-react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { InlineEdit } from "@/components/demandas/InlineEdit"

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

  // ── Edição inline ─────────────────────────────────────────────────────────
  const { data: session } = useSession()
  const meTipo = (session?.user as { tipo?: string } | undefined)?.tipo
  const meId = (session?.user as { id?: string } | undefined)?.id
  // Admin/gestor edita tudo; responsável/gestor da própria demanda edita campos operacionais.
  const canEdit = !!demanda && (
    meTipo === "admin" || meTipo === "gestor" ||
    demanda.responsavel?.id === meId || demanda.gestor?.id === meId
  )
  // Listas para os selects (org-scoped). Carregadas só quando há demanda aberta + permissão.
  const { data: respData } = useSWR(canEdit ? "/api/growth/responsaveis" : null, fetcher)
  const { data: linhasData } = useSWR(canEdit ? "/api/growth/linhas-projetos" : null, fetcher)
  const { data: produtosData } = useSWR(canEdit ? "/api/produtos" : null, fetcher)
  const responsaveisOpts = [{ value: "", label: "— Sem responsável —" }, ...((respData?.responsaveis ?? []).map((r: { id: string; label: string }) => ({ value: r.id, label: r.label })))]
  const linhasOpts = [{ value: "", label: "— Sem linha/projeto —" }, ...((linhasData?.linhas ?? []).map((l: { id: string; nome: string }) => ({ value: l.id, label: l.nome })))]
  const produtosLista: { id: string; nome: string }[] = produtosData?.produtos ?? []

  // PATCH parcial da demanda + revalida o SWR. Lança em erro (InlineEdit mostra "Erro").
  async function salvarCampo(patch: Record<string, unknown>) {
    const res = await fetch(`/api/demandas/${demandaId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    })
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Erro ao salvar") }
    await mutate()
  }
  async function salvarProdutos(ids: string[]) {
    const res = await fetch(`/api/demandas/${demandaId}/produto`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produtoIds: ids }),
    })
    if (!res.ok) throw new Error("Erro ao salvar produtos")
    await mutate()
  }

  const [aprovandoAcao, setAprovandoAcao] = useState<"aprovar" | "reprovar" | null>(null)
  const [motivoReprova, setMotivoReprova] = useState("")
  const [salvandoAprovacao, setSalvandoAprovacao] = useState(false)
  const [enviandoAprovacao, setEnviandoAprovacao] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileRefAprovacao = useRef<HTMLInputElement>(null)
  // Brutos URL
  const [brutosUrlInput, setBrutosUrlInput] = useState("")
  const [showBrutosInput, setShowBrutosInput] = useState(false)
  const [savingBrutosUrl, setSavingBrutosUrl] = useState(false)
  // Excluir link
  const [deletingLink, setDeletingLink] = useState<"brutos" | "final" | null>(null)
  // Gerar link de aprovação
  const [gerandoLink, setGerandoLink] = useState(false)
  const [linkAprovacaoGerado, setLinkAprovacaoGerado] = useState<string | null>(null)
  // Player de vídeo
  const [playerUrl, setPlayerUrl] = useState<string | null>(null)
  // Adicionar vídeo extra (sem gerar aprovação)
  const fileRefAddVideo = useRef<HTMLInputElement>(null)
  const [uploadingAddVideo, setUploadingAddVideo] = useState(false)
  const [uploadProgressAdd, setUploadProgressAdd] = useState(0)

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
      const res = await fetch(`/api/demandas/${demandaId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statusInterno,
          observacao: acao === "reprovar" ? motivoReprova : undefined,
        }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error((errJson as { error?: string }).error ?? `Erro ao salvar (HTTP ${res.status})`)
      }
      setAprovandoAcao(null)
      setMotivoReprova("")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar aprovação")
    } finally {
      setSalvandoAprovacao(false)
    }
  }

  // ── Upload via Supabase (presigned URL — direto do browser, sem CORS) ────────
  // Vídeo de revisão vai para Supabase. Após aprovação do cliente,
  // o servidor transfere automaticamente para o Google Drive (fluxo no [token]/route.ts).
  async function uploadPresigned(file: File): Promise<string> {
    if (!demandaId) throw new Error("demandaId ausente")
    const contentType = file.type || "video/mp4"

    // 1. Busca URL presigned do Supabase
    const urlRes = await fetch(
      `/api/demandas/${demandaId}/upload-url?tipo=final&contentType=${encodeURIComponent(contentType)}`
    )
    if (!urlRes.ok) {
      const err = await urlRes.json().catch(() => ({ error: "Erro ao gerar URL de upload" }))
      throw new Error((err as { error?: string }).error ?? "Erro ao gerar URL de upload")
    }
    const { uploadUrl, publicUrl } = (await urlRes.json()) as { uploadUrl: string; publicUrl: string }

    // 2. Upload direto do browser para Supabase (sem passar pelo servidor — sem CORS)
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    })
    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "")
      let msg = `HTTP ${uploadRes.status}`
      if (errText) {
        try { msg = (JSON.parse(errText) as { message?: string }).message ?? errText } catch { msg = errText }
      }
      throw new Error(`Falha no upload: ${msg}`)
    }

    // 3. Salva URL na demanda
    await fetch(`/api/demandas/${demandaId}/upload-video`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: publicUrl, tipo: "final" }),
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

  async function deleteLink(tipo: "brutos" | "final", arquivoId?: string) {
    if (!confirm(`Remover o link de ${tipo === "brutos" ? "brutos" : "vídeo final"}?`)) return
    setDeletingLink(tipo)
    try {
      await fetch(`/api/demandas/${demandaId}/upload-video`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: null, tipo, ...(arquivoId && { arquivoId }) }),
      })
      toast.success("Link removido!")
      mutate()
    } catch {
      toast.error("Erro ao remover link")
    } finally {
      setDeletingLink(null)
    }
  }

  async function gerarLinkAprovacao() {
    if (!demandaId || !demanda) return
    const videoUrl = ((demanda.arquivos ?? []) as Array<{ tipoArquivo: string; url: string }>)
      .find(a => a.tipoArquivo === "final")?.url ?? demanda.linkFinal
    if (!videoUrl) {
      toast.error("Nenhum vídeo final encontrado. Faça upload primeiro.")
      return
    }
    setGerandoLink(true)
    try {
      const res = await fetch("/api/aprovacao-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandaId, urlVideo: videoUrl }),
      })
      const text = await res.text()
      let json: { ok?: boolean; link?: string; error?: string } = {}
      try { json = JSON.parse(text) } catch { /* not json */ }
      if (!res.ok) throw new Error(json.error ?? `Erro HTTP ${res.status}`)
      await fetch(`/api/demandas/${demandaId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusInterno: "revisao_pendente" }),
      })
      setLinkAprovacaoGerado(json.link ?? "")
      toast.success("✅ Link gerado! WhatsApp enviado ao solicitante.")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar link")
    } finally {
      setGerandoLink(false)
    }
  }

  // Força download via Supabase ?download=true (Content-Disposition: attachment no servidor)
  // O atributo download do <a> só funciona para same-origin — para cross-origin precisamos disso
  /** Retorna um badge de onde o vídeo está armazenado, baseado na URL */
  function getStorageBadge(url: string): { icon: string; label: string; cls: string } | null {
    if (url.includes("drive.google.com")) return { icon: "☁️", label: "Google Drive", cls: "bg-blue-600/80 text-blue-100" }
    if (url.includes("supabase")) return { icon: "🗄", label: "Supabase", cls: "bg-zinc-600/80 text-zinc-300" }
    if (url.includes("youtu")) return { icon: "▶️", label: "YouTube", cls: "bg-red-700/80 text-red-100" }
    return null
  }

  function getDownloadUrl(url: string): string {
    const driveMatch = url.match(/\/file\/d\/([^/]+)/)
    if (driveMatch) return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`
    const sep = url.includes("?") ? "&" : "?"
    return `${url}${sep}download=true`
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

  async function handleAdicionarVideo(file: File) {
    if (!demandaId) return
    setUploadingAddVideo(true)
    setUploadProgressAdd(0)
    try {
      const contentType = file.type || "video/mp4"
      const urlRes = await fetch(
        `/api/demandas/${demandaId}/upload-url?tipo=final&contentType=${encodeURIComponent(contentType)}`
      )
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({ error: "Erro ao gerar URL" }))
        throw new Error((err as { error?: string }).error ?? "Erro ao gerar URL")
      }
      const { uploadUrl, publicUrl } = (await urlRes.json()) as { uploadUrl: string; publicUrl: string }
      // Upload com progresso via XHR
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setUploadProgressAdd(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)))
        xhr.onerror = () => reject(new Error("Falha no upload"))
        xhr.open("PUT", uploadUrl)
        xhr.setRequestHeader("Content-Type", contentType)
        xhr.send(file)
      })
      // Registra como Arquivo final (cria registro com sequencia auto-incremental)
      await fetch(`/api/demandas/${demandaId}/upload-video`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: publicUrl, tipo: "final" }),
      })
      toast.success("Vídeo adicionado!")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar vídeo")
    } finally {
      setUploadingAddVideo(false)
      setUploadProgressAdd(0)
    }
  }

  async function handleEnviarParaAprovacao(file: File) {
    setEnviandoAprovacao(true)
    setUploadProgress(0)
    try {
      // Upload via Supabase presigned URL (com barra de progresso)
      const url = await uploadPresigned(file)
      // Gera link de aprovação com 30 dias de validade
      const res = await fetch("/api/aprovacao-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandaId, urlVideo: url, expiresInDays: 30 }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error((errJson as { error?: string }).error ?? `Erro ao gerar link de aprovação (HTTP ${res.status})`)
      }
      await fetch(`/api/demandas/${demandaId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusInterno: "revisao_pendente", origem: "manual" }),
      })
      toast.success("✅ Vídeo enviado! Link de aprovação (30 dias) enviado ao solicitante.")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviandoAprovacao(false)
      setUploadProgress(0)
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
  const isVencida = demanda?.dataLimite && new Date(demanda.dataLimite) < new Date() &&
    !["aprovacao", "para_postar"].includes(demanda.statusVisivel ?? "")

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
                  <h2 className="text-xl font-bold text-zinc-100 leading-snug mb-3">
                    <InlineEdit value={demanda.titulo ?? ""} canEdit={canEdit} placeholder="(sem título)"
                      onSave={(v) => salvarCampo({ titulo: v })} />
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full border", statusColor)}>
                      {STATUS_LABEL[demanda.statusInterno] ?? demanda.statusInterno}
                    </span>
                    {canEdit ? (
                      <span className="text-xs">
                        <InlineEdit value={demanda.prioridade ?? "normal"} canEdit tipo="select"
                          options={[{ value: "normal", label: "Normal" }, { value: "alta", label: "Alta" }, { value: "urgente", label: "Urgente" }]}
                          display={<span className={cn("text-xs font-medium px-2.5 py-1 rounded-full border", prio.class)}>{prio.label}</span>}
                          onSave={(v) => salvarCampo({ prioridade: v })} />
                      </span>
                    ) : (
                      <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full border", prio.class)}>{prio.label}</span>
                    )}
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
                {canEdit ? (
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <p className="text-[11px] text-zinc-500 mb-1">Descrição</p>
                    <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                      <InlineEdit value={demanda.descricao ?? ""} canEdit tipo="textarea" placeholder="Sem descrição — clique para adicionar"
                        onSave={(v) => salvarCampo({ descricao: v })} />
                    </div>
                  </div>
                ) : demanda.descricao?.trim() ? (
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                      {demanda.descricao}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-600 italic">Sem descrição.</p>
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

                    {/* Vídeos Finais — lista multi-vídeo */}
                    {(() => {
                      const videosFinais = ((demanda.arquivos ?? []) as Array<{ id: string; tipoArquivo: string; url: string; nomeArquivo: string; sequencia: number | null }>)
                        .filter(a => a.tipoArquivo === "final")
                      // Fallback para demandas antigas sem registros Arquivo
                      const temArquivos = videosFinais.length > 0
                      const temLinkLegado = !temArquivos && !!demanda.linkFinal

                      if (!temArquivos && !temLinkLegado) return null
                      return (
                        <div className="space-y-1.5">
                          {/* Título com contador */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-zinc-400">🎬 Vídeos Finais</span>
                            {videosFinais.length > 0 && (
                              <span className="bg-purple-600/20 text-purple-300 border border-purple-600/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {videosFinais.length}
                              </span>
                            )}
                          </div>

                          {/* Lista de arquivos */}
                          {temArquivos && videosFinais.map(arq => {
                            const thumbUrl = getThumbUrl(arq.url)
                            return (
                              <div key={arq.id} className="space-y-1.5">
                                {/* Thumbnail clicável para player */}
                                <div className="relative rounded-xl overflow-hidden cursor-pointer aspect-video bg-zinc-800 border border-zinc-700/60 hover:border-purple-500/60 transition-colors"
                                  onClick={() => setPlayerUrl(arq.url)}>
                                  {thumbUrl ? (
                                    <img src={thumbUrl} alt="thumbnail" className="w-full h-full object-cover" />
                                  ) : (
                                    <video src={arq.url} preload="metadata" muted className="w-full h-full object-cover"
                                      onLoadedMetadata={e => { (e.target as HTMLVideoElement).currentTime = 1 }} />
                                  )}
                                  <div className="absolute inset-0 bg-black/40 hover:bg-black/20 transition-colors" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 hover:scale-110 transition-all duration-200">
                                      <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
                                    </div>
                                  </div>
                                  {/* Sequencia + badge storage */}
                                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                                    <span className="text-[10px] font-mono font-bold text-white bg-purple-600/80 backdrop-blur-sm px-2 py-0.5 rounded">
                                      {String(arq.sequencia ?? 0).padStart(3, "0")}
                                    </span>
                                    {(() => {
                                      const badge = getStorageBadge(arq.url)
                                      return badge ? (
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded backdrop-blur-sm ${badge.cls}`}>
                                          {badge.icon} {badge.label}
                                        </span>
                                      ) : null
                                    })()}
                                  </div>
                                </div>
                                {/* Barra de ações — sempre visível */}
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => setPlayerUrl(arq.url)}
                                    className="flex-1 flex items-center justify-center gap-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white py-1.5 rounded-lg transition-colors">
                                    <Play className="w-3 h-3" /> Assistir
                                  </button>
                                  <a href={getDownloadUrl(arq.url)} target="_blank" rel="noreferrer"
                                    onClick={e => e.stopPropagation()} title="Baixar vídeo"
                                    className="flex items-center justify-center text-xs bg-zinc-800 hover:bg-blue-900/60 border border-zinc-700 hover:border-blue-700 text-zinc-400 hover:text-blue-400 py-1.5 px-2.5 rounded-lg transition-colors">
                                    <Download className="w-3 h-3" />
                                  </a>
                                  <button onClick={e => { e.stopPropagation(); deleteLink("final", arq.id) }}
                                    disabled={!!deletingLink} title="Remover vídeo"
                                    className="flex items-center justify-center text-xs bg-zinc-800 hover:bg-red-900/60 border border-zinc-700 hover:border-red-700 text-zinc-400 hover:text-red-400 py-1.5 px-2.5 rounded-lg transition-colors disabled:opacity-30">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}

                          {/* Botão + Adicionar vídeo (quando já tem pelo menos 1, incluindo legado) */}
                          {(temArquivos || temLinkLegado) && (
                            <div className="pt-1">
                              <input
                                ref={fileRefAddVideo}
                                type="file"
                                accept="video/*,.zip"
                                className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleAdicionarVideo(f); e.target.value = "" }}
                              />
                              {uploadingAddVideo ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs text-zinc-400 justify-center">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    {uploadProgressAdd > 0 ? `Enviando… ${uploadProgressAdd}%` : "Preparando…"}
                                  </div>
                                  <div className="w-full bg-zinc-700 rounded-full h-1 overflow-hidden">
                                    <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${uploadProgressAdd}%` }} />
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => fileRefAddVideo.current?.click()}
                                  className="w-full flex items-center justify-center gap-1.5 text-xs border border-dashed border-zinc-600 hover:border-purple-500/60 text-zinc-500 hover:text-purple-300 rounded-lg py-2 transition-colors">
                                  <Plus className="w-3.5 h-3.5" /> Adicionar outro vídeo
                                </button>
                              )}
                            </div>
                          )}

                          {/* Fallback legado */}
                          {temLinkLegado && (() => {
                            const thumbUrl = getThumbUrl(demanda.linkFinal!)
                            return (
                              <div className="space-y-1.5">
                                {/* Thumbnail clicável para player */}
                                <div className="relative rounded-xl overflow-hidden cursor-pointer aspect-video bg-zinc-800 border border-zinc-700/60 hover:border-purple-500/60 transition-colors"
                                  onClick={() => setPlayerUrl(demanda.linkFinal!)}>
                                  {thumbUrl ? (
                                    <img src={thumbUrl} alt="thumbnail" className="w-full h-full object-cover" />
                                  ) : (
                                    <video src={demanda.linkFinal!} preload="metadata" muted className="w-full h-full object-cover"
                                      onLoadedMetadata={e => { (e.target as HTMLVideoElement).currentTime = 1 }} />
                                  )}
                                  <div className="absolute inset-0 bg-black/40 hover:bg-black/20 transition-colors" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 hover:scale-110 transition-all duration-200">
                                      <Play className="w-7 h-7 text-white ml-1" fill="white" />
                                    </div>
                                  </div>
                                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                                    <span className="text-[11px] text-white/80 font-medium bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">🎬 Vídeo Final</span>
                                    {(() => { const badge = getStorageBadge(demanda.linkFinal!); return badge ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded backdrop-blur-sm ${badge.cls}`}>{badge.icon} {badge.label}</span> : null })()}
                                  </div>
                                </div>
                                {/* Barra de ações — sempre visível */}
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => setPlayerUrl(demanda.linkFinal!)}
                                    className="flex-1 flex items-center justify-center gap-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white py-1.5 rounded-lg transition-colors">
                                    <Play className="w-3 h-3" /> Assistir
                                  </button>
                                  <a href={getDownloadUrl(demanda.linkFinal!)} target="_blank" rel="noreferrer"
                                    onClick={e => e.stopPropagation()} title="Baixar vídeo"
                                    className="flex items-center justify-center text-xs bg-zinc-800 hover:bg-blue-900/60 border border-zinc-700 hover:border-blue-700 text-zinc-400 hover:text-blue-400 py-1.5 px-2.5 rounded-lg transition-colors">
                                    <Download className="w-3 h-3" />
                                  </a>
                                  <button onClick={e => { e.stopPropagation(); deleteLink("final") }} disabled={!!deletingLink}
                                    title="Remover vídeo"
                                    className="flex items-center justify-center text-xs bg-zinc-800 hover:bg-red-900/60 border border-zinc-700 hover:border-red-700 text-zinc-400 hover:text-red-400 py-1.5 px-2.5 rounded-lg transition-colors disabled:opacity-30">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })()}

                    {/* Aprovação — abaixo do vídeo, coluna esquerda */}
                    {demanda.statusVisivel === "aprovacao" && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                        <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {demanda.statusInterno === "aprovado"
                            ? "Aprovado ✅"
                            : demanda.statusInterno === "ajuste_solicitado"
                            ? "Ajuste solicitado — em revisão"
                            : "Aguardando aprovação do cliente"}
                        </p>
                        {demanda.statusInterno !== "aprovado" && demanda.statusInterno !== "ajuste_solicitado" && (
                          <>
                            {demanda.aprovacoesVideo?.[0]?.token && (() => {
                              const linkAprovacao = `${typeof window !== "undefined" ? window.location.origin : "https://nuflow.space"}/aprovar/${demanda.aprovacoesVideo[0].token}`
                              return (
                                <div className="flex items-center gap-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-2.5 py-1.5">
                                  <span className="text-[10px] text-zinc-400 truncate flex-1 font-mono">{linkAprovacao}</span>
                                  <button onClick={() => { navigator.clipboard.writeText(linkAprovacao); toast.success("Link copiado!") }}
                                    title="Copiar link" className="shrink-0 p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white">
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                  <a href={linkAprovacao} target="_blank" rel="noreferrer"
                                    className="shrink-0 p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              )
                            })()}
                            {aprovandoAcao === "reprovar" ? (
                              <div className="space-y-2">
                                <textarea rows={2} placeholder="Motivo da reprovação..."
                                  value={motivoReprova} onChange={e => setMotivoReprova(e.target.value)}
                                  className="w-full bg-zinc-800 border border-red-700/50 text-zinc-200 text-xs px-3 py-2 rounded-lg resize-none focus:outline-none focus:border-red-500" />
                                <div className="flex gap-2">
                                  <button onClick={() => executarAprovacao("reprovar")}
                                    disabled={salvandoAprovacao || !motivoReprova.trim()}
                                    className="flex-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors disabled:opacity-40">
                                    {salvandoAprovacao ? "Salvando..." : "Confirmar Reprovação"}
                                  </button>
                                  <button onClick={() => { setAprovandoAcao(null); setMotivoReprova("") }}
                                    className="px-3 text-zinc-400 hover:text-white text-xs border border-zinc-700 rounded-lg">
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button onClick={() => executarAprovacao("aprovar")} disabled={salvandoAprovacao}
                                  className="flex-1 flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors disabled:opacity-40">
                                  <ThumbsUp className="w-3.5 h-3.5" /> Aprovar
                                </button>
                                <button onClick={() => setAprovandoAcao("reprovar")} disabled={salvandoAprovacao}
                                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-800/60 hover:bg-red-700 border border-red-700/50 text-red-300 hover:text-white text-xs font-semibold py-2 rounded-lg transition-colors disabled:opacity-40">
                                  <ThumbsDown className="w-3.5 h-3.5" /> Reprovar
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

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
                        {demanda.postagemTipo && (
                          <span className="text-[10px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded font-medium capitalize">
                            {demanda.postagemTipo}
                          </span>
                        )}
                      </a>
                    )}
                    {!demanda.linkPostagem && demanda.postagemTipo && (
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <span>📱 Postado em</span>
                        <span className="text-[10px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded font-medium capitalize">
                          {demanda.postagemTipo}
                        </span>
                      </div>
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
                    {enviandoAprovacao
                      ? uploadProgress > 0 && uploadProgress < 100
                        ? `Enviando… ${uploadProgress}%`
                        : "Finalizando…"
                      : "🚀 ✨ Enviar Vídeo para Aprovação"}
                  </button>
                  {enviandoAprovacao && uploadProgress > 0 && (
                    <div className="mt-1.5 w-full bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-zinc-600 text-center mt-1">Drive → gera link 30 dias → WhatsApp ao solicitante</p>

                  {/* Gerar link de aprovação para vídeo já existente (sem re-upload) */}
                  {((demanda.linkFinal || ((demanda.arquivos ?? []) as Array<{ tipoArquivo: string }>).some(a => a.tipoArquivo === "final")) &&
                    demanda.statusVisivel !== "finalizado") && (
                    <div className="mt-2 border-t border-zinc-700/50 pt-2">
                      {linkAprovacaoGerado ? (
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-green-400 font-medium">✅ Link gerado:</p>
                          <div className="flex items-center gap-1.5 bg-zinc-800/60 border border-green-700/40 rounded-lg px-2.5 py-1.5">
                            <span className="text-[10px] text-zinc-300 truncate flex-1 font-mono">{linkAprovacaoGerado}</span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(linkAprovacaoGerado); toast.success("Copiado!") }}
                              className="shrink-0 p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={gerarLinkAprovacao}
                          disabled={gerandoLink}
                          className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-zinc-300 hover:text-white font-medium transition-colors disabled:opacity-50 w-full">
                          {gerandoLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                          {gerandoLink ? "Gerando..." : "🔗 Gerar Link de Aprovação"}
                        </button>
                      )}
                    </div>
                  )}
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
                    {(canEdit || demanda.responsavel || demanda.designer) && (
                      <div>
                        <p className="text-[11px] text-zinc-600 mb-0.5 flex items-center gap-1">
                          <User className="w-3 h-3" /> Responsável
                        </p>
                        {canEdit ? (
                          <InlineEdit value={demanda.responsavel?.id ?? ""} canEdit tipo="select" options={responsaveisOpts}
                            display={<span className="text-sm text-zinc-300 font-medium">{demanda.responsavel?.nome ?? demanda.designer?.nome ?? "— Sem responsável —"}</span>}
                            onSave={(v) => salvarCampo({ responsavelId: v })} />
                        ) : (
                          <p className="text-sm text-zinc-300 font-medium">{demanda.responsavel?.nome ?? demanda.designer?.nome}</p>
                        )}
                      </div>
                    )}
                    {(canEdit || demanda.linhaProjetoRef?.nome || demanda.linhaProjeto) && (
                      <div>
                        <p className="text-[11px] text-zinc-600 mb-0.5">Linha / Projeto</p>
                        {canEdit ? (
                          <InlineEdit value={demanda.linhaProjetoRef?.id ?? ""} canEdit tipo="select" options={linhasOpts}
                            display={<span className="text-sm text-zinc-300 font-medium">{demanda.linhaProjetoRef?.nome ?? demanda.linhaProjeto ?? "— Sem linha/projeto —"}</span>}
                            onSave={(v) => salvarCampo({ linhaProjetoId: v })} />
                        ) : (
                          <p className="text-sm text-zinc-300 font-medium">{demanda.linhaProjetoRef?.nome ?? demanda.linhaProjeto}</p>
                        )}
                      </div>
                    )}
                  </div>
                </SidebarSection>

                {/* Datas */}
                <SidebarSection title="Datas" icon={<Calendar className="w-3 h-3" />}>
                  <div className="space-y-2">
                    {(canEdit || demanda.dataLimite) && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-500">Prazo</span>
                        {canEdit ? (
                          <InlineEdit value={demanda.dataLimite ? new Date(demanda.dataLimite).toISOString().slice(0, 10) : ""} canEdit tipo="date"
                            display={<span className={cn("text-xs font-semibold", isVencida ? "text-red-400" : "text-zinc-300")}>{demanda.dataLimite ? format(new Date(demanda.dataLimite), "dd/MM/yyyy", { locale: ptBR }) : "definir"}{isVencida && " ⚠️"}</span>}
                            onSave={(v) => salvarCampo({ dataLimite: v || null })} />
                        ) : (
                          <span className={cn("text-xs font-semibold", isVencida ? "text-red-400" : "text-zinc-300")}>
                            {format(new Date(demanda.dataLimite), "dd/MM/yyyy", { locale: ptBR })}
                            {isVencida && " ⚠️"}
                          </span>
                        )}
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

                {/* Produtos (multi) — editável em chips quando há permissão */}
                {(canEdit ? produtosLista.length > 0 : demanda.produtos?.length > 0) && (() => {
                  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                  const vinculados: string[] = (demanda.produtos ?? []).map((dp: any) => dp.produto?.id).filter(Boolean)
                  const toggle = (pid: string) => {
                    const novos = vinculados.includes(pid) ? vinculados.filter(x => x !== pid) : [...vinculados, pid]
                    salvarProdutos(novos).catch(() => toast.error("Erro ao salvar produtos"))
                  }
                  return (
                    <SidebarSection title={(demanda.produtos?.length ?? 0) > 1 ? "Produtos" : "Produto"} icon={<Package className="w-3 h-3" />}>
                      <div className="flex flex-wrap gap-1.5">
                        {canEdit
                          ? produtosLista.map((p) => (
                              <button key={p.id} type="button" onClick={() => toggle(p.id)}
                                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${vinculados.includes(p.id) ? "bg-sky-500/15 text-sky-300 border-sky-500/30" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600"}`}>
                                {p.nome}
                              </button>
                            ))
                          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                          : (demanda.produtos ?? []).map((dp: any, i: number) => (
                              <span key={dp.produto?.id ?? i} className="inline-block text-sm text-zinc-300 bg-zinc-800 border border-zinc-700 px-2.5 py-1 rounded-lg">
                                {dp.produto?.nome ?? "—"}
                              </span>
                            ))}
                      </div>
                    </SidebarSection>
                  )
                })()}

                {/* Detalhes da entrega (campos condicionais — Growth) */}
                {demanda.detalhesEntrega && Object.keys(demanda.detalhesEntrega).length > 0 && (
                  <SidebarSection title="Detalhes da entrega" icon={<Tag className="w-3 h-3" />}>
                    <div className="space-y-1.5">
                      {Object.entries(demanda.detalhesEntrega as Record<string, unknown>)
                        .filter(([, v]) => v !== "" && v !== null && v !== undefined)
                        .map(([k, v]) => (
                          <div key={k} className="text-xs">
                            <span className="text-zinc-500">{k}: </span>
                            <span className="text-zinc-300">{typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v)}</span>
                          </div>
                        ))}
                    </div>
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
