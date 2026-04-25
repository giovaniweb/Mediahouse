"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { useParams, useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Header } from "@/components/layout/Header"
import {
  ArrowLeft, Calendar, Clock, ExternalLink, MessageCircle, Send, User,
  Video, Link2, CheckCircle2, Copy, Check, Pencil, Save, X,
  AlertTriangle, Sparkles, UserCheck, Clapperboard, Film, Trash2, Package, Upload, Loader2,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ChecklistSection } from "@/components/demandas/ChecklistSection"
import { QuickWhatsapp } from "@/components/ui/QuickWhatsapp"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_LABELS: Record<string, string> = {
  pedido_criado: "Pedido Criado",
  aguardando_triagem: "Aguardando Triagem",
  aguardando_aprovacao_interna: "Aguardando Aprovação",
  planejamento: "Em Planejamento",
  videomaker_notificado: "Videomaker Notificado",
  videomaker_aceitou: "Videomaker Aceitou",
  videomaker_recusou: "Videomaker Recusou",
  captacao_agendada: "Captação Agendada",
  captacao_realizada: "Captação Realizada",
  brutos_enviados: "Brutos Enviados",
  editor_atribuido: "Editor Atribuído",
  fila_edicao: "Fila de Edição",
  editando: "Em Edição",
  edicao_finalizada: "Edição Finalizada",
  revisao_pendente: "Aguardando Revisão",
  revisao_reprovada: "Revisão Reprovada",
  aguardando_aprovacao_cliente: "Aguardando Cliente",
  aprovado_cliente: "Aprovado pelo Cliente",
  reprovado_cliente: "Reprovado pelo Cliente",
  aprovado: "Aprovado",
  postagem_pendente: "Para Postar",
  postado: "Postado",
  entregue_cliente: "Entregue ao Cliente",
  urgencia_pendente_aprovacao: "Urgência Pendente",
  urgencia_aprovada: "Urgência Aprovada",
  impedimento: "Com Impedimento",
  encerrado: "Encerrado",
  expirado: "Expirado",
}

interface Videomaker { id: string; nome: string; cidade?: string; status: string; podeEditar?: boolean }
interface Editor { id: string; nome: string; especialidade?: string; status: string; fazCaptacao?: boolean }

export default function DemandaDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  // ── Estado geral ──────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [comentario, setComentario] = useState("")
  const [sendingComment, setSendingComment] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkGerado, setLinkGerado] = useState("")
  const [urlVideoInput, setUrlVideoInput] = useState("")
  const [gerandoLink, setGerandoLink] = useState(false)
  const [linkModalTab, setLinkModalTab] = useState<"upload" | "url">("upload")
  const [linkModalFile, setLinkModalFile] = useState<File | null>(null)
  const fileRefLinkModal = useRef<HTMLInputElement>(null)
  const [copiado, setCopiado] = useState(false)
  const [enviandoAprovacao, setEnviandoAprovacao] = useState(false)
  // ── Campos editáveis ──────────────────────────────────────────────────────
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [cidade, setCidade] = useState("")
  const [dataLimite, setDataLimite] = useState("")
  const [dataCaptacao, setDataCaptacao] = useState("")
  const [videomakerId, setVideomakerId] = useState("")
  const [editorId, setEditorId] = useState("")
  const [linkBrutos, setLinkBrutos] = useState("")
  const [linkFinal, setLinkFinal] = useState("")
  const [localGravacao, setLocalGravacao] = useState("")
  const [classificacao, setClassificacao] = useState("")
  const [produtoId, setProdutoId] = useState("")
  // ── Upload de vídeo ───────────────────────────────────────────────────────
  const [uploadingBrutos, setUploadingBrutos] = useState(false)
  const [uploadingFinal, setUploadingFinal] = useState(false)
  const fileRefBrutos = useRef<HTMLInputElement>(null)
  const fileRefFinal = useRef<HTMLInputElement>(null)
  const fileRefAprovacao = useRef<HTMLInputElement>(null)

  // ── SWR ───────────────────────────────────────────────────────────────────
  const { data, mutate } = useSWR(`/api/demandas/${id}`, fetcher)
  const demanda = data?.demanda

  const { data: dataVMs } = useSWR<{ videomakers: Videomaker[] }>("/api/videomakers?status=ativo&limit=100", fetcher)
  const { data: dataEds } = useSWR<{ editores: Editor[] }>("/api/editores?status=ativo&limit=100", fetcher)
  const { data: dataProdutos } = useSWR<{ produtos: { id: string; nome: string }[] }>("/api/produtos", fetcher)
  const videomakers = dataVMs?.videomakers ?? []
  const editores = dataEds?.editores ?? []
  const produtos = dataProdutos?.produtos ?? []

  // ── Sincroniza campos ao carregar demanda ─────────────────────────────────
  useEffect(() => {
    if (demanda && !editMode) {
      setTitulo(demanda.titulo ?? "")
      setDescricao(demanda.descricao ?? "")
      setCidade(demanda.cidade ?? "")
      setDataLimite(demanda.dataLimite ? demanda.dataLimite.split("T")[0] : "")
      setDataCaptacao(demanda.dataCaptacao ? demanda.dataCaptacao.split("T")[0] : "")
      setVideomakerId(demanda.videomaker?.id ?? "")
      setEditorId(demanda.editor?.id ?? "")
      setLinkBrutos(demanda.linkBrutos ?? "")
      setLinkFinal(demanda.linkFinal ?? "")
      setLocalGravacao(demanda.localGravacao ?? "")
      setClassificacao(demanda.classificacao ?? "")
      setProdutoId(demanda.produtos?.[0]?.produtoId ?? "")
    }
  }, [demanda, editMode])

  // ── Salvar edição ─────────────────────────────────────────────────────────
  async function salvar() {
    setSaving(true)
    try {
      const res = await fetch(`/api/demandas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo, descricao, cidade,
          dataLimite: dataLimite || null,
          dataCaptacao: dataCaptacao || null,
          videomakerId: videomakerId || null,
          editorId: editorId || null,
          linkBrutos: linkBrutos || null,
          linkFinal: linkFinal || null,
          localGravacao: localGravacao || null,
          classificacao: classificacao || null,
          produtoId: produtoId || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao salvar")
      toast.success("Demanda atualizada!")
      setEditMode(false)
      mutate()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function excluirDemanda() {
    if (!confirm(`Tem certeza que deseja excluir a demanda ${demanda.codigo}? Esta ação não pode ser desfeita.`)) return
    try {
      const res = await fetch(`/api/demandas/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao excluir")
      toast.success("Demanda excluída!")
      router.push("/demandas")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir")
    }
  }

  function cancelarEdicao() {
    setEditMode(false)
    if (demanda) {
      setTitulo(demanda.titulo ?? "")
      setDescricao(demanda.descricao ?? "")
      setCidade(demanda.cidade ?? "")
      setDataLimite(demanda.dataLimite ? demanda.dataLimite.split("T")[0] : "")
      setDataCaptacao(demanda.dataCaptacao ? demanda.dataCaptacao.split("T")[0] : "")
      setVideomakerId(demanda.videomaker?.id ?? "")
      setEditorId(demanda.editor?.id ?? "")
      setLinkBrutos(demanda.linkBrutos ?? "")
      setLinkFinal(demanda.linkFinal ?? "")
      setLocalGravacao(demanda.localGravacao ?? "")
      setClassificacao(demanda.classificacao ?? "")
      setProdutoId(demanda.produtos?.[0]?.produtoId ?? "")
    }
  }

  // ── Upload via URL presigned (bypass limite 4.5MB do Vercel) ────────────
  async function uploadPresigned(file: File, tipo: "brutos" | "final"): Promise<string> {
    const contentType = file.type || "video/mp4"

    // 1. Busca URL presigned do servidor
    const urlRes = await fetch(
      `/api/demandas/${id}/upload-url?tipo=${tipo}&contentType=${encodeURIComponent(contentType)}`
    )
    if (!urlRes.ok) {
      const err = await urlRes.json().catch(() => ({ error: "Erro ao gerar URL de upload" }))
      throw new Error(err.error ?? "Erro ao gerar URL de upload")
    }
    const { uploadUrl, publicUrl } = await urlRes.json() as { uploadUrl: string; publicUrl: string }

    // 2. Upload direto do browser para o Supabase (sem passar pelo servidor)
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    })
    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "")
      throw new Error(`Falha no upload: ${errText || uploadRes.statusText}`)
    }

    // 3. Salva a URL na demanda
    await fetch(`/api/demandas/${id}/upload-video`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: publicUrl, tipo }),
    })

    return publicUrl
  }

  // ── Upload de vídeo ───────────────────────────────────────────────────────
  async function uploadVideo(file: File, tipo: "brutos" | "final") {
    const setUploading = tipo === "brutos" ? setUploadingBrutos : setUploadingFinal
    const setLink = tipo === "brutos" ? setLinkBrutos : setLinkFinal
    setUploading(true)
    try {
      const url = await uploadPresigned(file, tipo)
      setLink(url)
      toast.success(`${tipo === "brutos" ? "Brutos" : "Vídeo final"} enviado com sucesso!`)
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  // ── Upload final + Aprovação em 1 clique ─────────────────────────────────
  async function uploadEEnviarParaAprovacao(file: File) {
    setEnviandoAprovacao(true)
    try {
      // 1. Upload direto ao Supabase via URL presigned
      const url = await uploadPresigned(file, "final")
      setLinkFinal(url)

      // 2. Gerar link de aprovação + enviar WhatsApp automaticamente
      const resAprovacao = await fetch("/api/aprovacao-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandaId: id, urlVideo: url, expiresInDays: 7 }),
      })
      if (!resAprovacao.ok) throw new Error((await resAprovacao.json()).error ?? "Erro ao gerar link de aprovação")

      // 3. Mover status para revisao_pendente (coluna "Aprovação") — status válido no schema
      await fetch(`/api/demandas/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusInterno: "revisao_pendente", origem: "manual" }),
      })

      toast.success("✅ Enviado! Link de aprovação enviado por WhatsApp para o solicitante.")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviandoAprovacao(false)
    }
  }

  // ── Atribuição rápida (sem entrar em edit mode) ───────────────────────────
  async function atribuirRapido(campo: "videomakerId" | "editorId", valor: string) {
    try {
      const res = await fetch(`/api/demandas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const label = campo === "videomakerId" ? "Videomaker atribuído!" : "Editor atribuído!"
      toast.success(label)
      mutate()
    } catch (e) {
      toast.error(String(e))
    }
  }

  // ── Comentário ────────────────────────────────────────────────────────────
  async function enviarComentario() {
    if (!comentario.trim()) return
    setSendingComment(true)
    try {
      await fetch(`/api/demandas/${id}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: comentario }),
      })
      setComentario("")
      mutate()
    } finally {
      setSendingComment(false)
    }
  }

  // ── Gerar link de aprovação (por URL ou por upload de arquivo) ───────────
  async function gerarLinkAprovacao() {
    if (linkModalTab === "upload" && !linkModalFile) return
    if (linkModalTab === "url" && !urlVideoInput.trim()) return
    setGerandoLink(true)
    try {
      let videoUrl = urlVideoInput.trim()

      // Se for upload, faz o presigned upload primeiro
      if (linkModalTab === "upload" && linkModalFile) {
        videoUrl = await uploadPresigned(linkModalFile, "final")
        setLinkFinal(videoUrl)
      }

      const res = await fetch("/api/aprovacao-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandaId: id, urlVideo: videoUrl, expiresInDays: 7 }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setLinkGerado(json.link)

      // Mover status para "Aguardando Revisão" (coluna Aprovação)
      await fetch(`/api/demandas/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusInterno: "revisao_pendente", origem: "manual" }),
      })

      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar link")
    } finally {
      setGerandoLink(false)
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!demanda) {
    return (
      <>
        <Header title="Carregando..." />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full" />
        </div>
      </>
    )
  }

  return (
    <>
      <Header
        title={demanda.codigo}
        actions={
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button onClick={cancelarEdicao} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 px-3 py-1.5 rounded-lg hover:bg-zinc-800">
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
                <button onClick={salvar} disabled={saving} className="flex items-center gap-1.5 text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> {saving ? "Salvando..." : "Salvar"}
                </button>
              </>
            ) : (
              <>
                <button onClick={excluirDemanda} className="flex items-center gap-1.5 text-sm border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10">
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
                <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 text-sm border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg hover:bg-zinc-800">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
                <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
              </>
            )}
          </div>
        }
      />

      <main className="flex-1 p-6 grid grid-cols-1 gap-6 lg:grid-cols-3 max-w-6xl mx-auto w-full">
        {/* ── Coluna principal ────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Info + Status */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                {editMode ? (
                  <input
                    value={titulo}
                    onChange={e => setTitulo(e.target.value)}
                    className="w-full text-xl font-bold bg-transparent border-b-2 border-purple-500/50 focus:outline-none focus:border-purple-500 pb-1 text-zinc-200"
                  />
                ) : (
                  <h1 className="text-xl font-bold text-zinc-100 leading-tight">{demanda.titulo}</h1>
                )}
              </div>
              <StatusBadge status={demanda.statusInterno} />
            </div>

            {editMode ? (
              <textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                rows={3}
                className="w-full text-sm bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none text-zinc-200"
              />
            ) : (
              <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap break-words">{demanda.descricao}</p>
            )}

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="flex items-center gap-2 text-zinc-400">
                <Video className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-500">Tipo:</span>
                <span className="font-medium text-zinc-200">{demanda.tipoVideo}</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <User className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-500">Departamento:</span>
                <span className="font-medium text-zinc-200 capitalize">{demanda.departamento}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-500">Cidade:</span>
                {editMode ? (
                  <input value={cidade} onChange={e => setCidade(e.target.value)}
                    className="flex-1 bg-transparent border-b border-zinc-600 focus:outline-none focus:border-purple-500 text-sm px-1 text-zinc-200" />
                ) : (
                  <span className="font-medium text-zinc-200">{demanda.cidade || "—"}</span>
                )}
              </div>
              {editMode && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-zinc-500" />
                  <span className="text-zinc-500">Local de gravação:</span>
                  <input value={localGravacao} onChange={e => setLocalGravacao(e.target.value)}
                    className="flex-1 bg-transparent border-b border-zinc-600 focus:outline-none focus:border-purple-500 text-sm px-1 text-zinc-200" />
                </div>
              )}
            </div>
          </div>

          {/* ── Produto & Classificação ─────────────────────────────────── */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
            <h2 className="font-semibold text-zinc-300 mb-4 flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-400" /> Produto & Classificação
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Produto */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Produto vinculado</label>
                <select
                  value={editMode ? produtoId : (demanda.produtos?.[0]?.produtoId ?? "")}
                  onChange={e => {
                    if (editMode) {
                      setProdutoId(e.target.value)
                    } else {
                      // atribuição rápida de produto
                      fetch(`/api/demandas/${id}/produto`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ produtoId: e.target.value || null }),
                      }).then(r => {
                        if (r.ok) { toast.success("Produto vinculado!"); mutate() }
                        else toast.error("Erro ao vincular produto")
                      })
                    }
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200"
                >
                  <option value="">— Sem produto —</option>
                  {produtos.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
                {!editMode && demanda.produtos?.[0] && (
                  <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {demanda.produtos[0].produto?.nome}
                  </p>
                )}
              </div>

              {/* Classificação B2B/B2C */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Classificação</label>
                <select
                  value={editMode ? classificacao : (demanda.classificacao ?? "")}
                  onChange={e => {
                    if (editMode) {
                      setClassificacao(e.target.value)
                    } else {
                      fetch(`/api/demandas/${id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ classificacao: e.target.value || null }),
                      }).then(r => {
                        if (r.ok) { toast.success("Classificação atualizada!"); mutate() }
                        else toast.error("Erro ao atualizar classificação")
                      })
                    }
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200"
                >
                  <option value="">— Não definido —</option>
                  <option value="b2c">B2C (Consumidor Final)</option>
                  <option value="b2b">B2B (Empresarial)</option>
                </select>
                {!editMode && demanda.classificacao && (
                  <p className="text-xs mt-1 flex items-center gap-1">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                      demanda.classificacao === "b2c" ? "bg-blue-500/20 text-blue-400" : "bg-orange-500/20 text-orange-400"
                    )}>
                      {demanda.classificacao}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Atribuição de equipe ─────────────────────────────────────── */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
            <h2 className="font-semibold text-zinc-300 mb-4 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-purple-400" /> Equipe da Demanda
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Videomaker */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5 flex items-center gap-1">
                  <Clapperboard className="w-3.5 h-3.5" /> Videomaker (Captação)
                </label>
                <select
                  value={editMode ? videomakerId : (demanda.videomaker?.id ?? "")}
                  onChange={e => {
                    if (editMode) {
                      setVideomakerId(e.target.value)
                    } else {
                      atribuirRapido("videomakerId", e.target.value)
                    }
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200"
                >
                  <option value="">— Sem videomaker —</option>
                  {videomakers.filter(v => !v.podeEditar).length > 0 && (
                    <optgroup label="Apenas captação">
                      {videomakers.filter(v => !v.podeEditar).map(v => (
                        <option key={v.id} value={v.id}>{v.nome}{v.cidade ? ` (${v.cidade})` : ""}</option>
                      ))}
                    </optgroup>
                  )}
                  {videomakers.filter(v => v.podeEditar).length > 0 && (
                    <optgroup label="Captação + Edição">
                      {videomakers.filter(v => v.podeEditar).map(v => (
                        <option key={v.id} value={v.id}>{v.nome}{v.cidade ? ` (${v.cidade})` : ""} ✂️</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {demanda.videomaker && !editMode && (
                  <div className="mt-1.5 space-y-1">
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {demanda.videomaker.nome}
                      {demanda.videomaker.cidade ? ` · ${demanda.videomaker.cidade}` : ""}
                    </p>
                    {demanda.videomaker.telefone && (
                      <QuickWhatsapp
                        telefone={demanda.videomaker.telefone}
                        nome={demanda.videomaker.nome}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Editor */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5 flex items-center gap-1">
                  <Film className="w-3.5 h-3.5" /> Editor (Pós-produção)
                </label>
                <select
                  value={editMode ? editorId : (demanda.editor?.id ?? "")}
                  onChange={e => {
                    if (editMode) {
                      setEditorId(e.target.value)
                    } else {
                      atribuirRapido("editorId", e.target.value)
                    }
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200"
                >
                  <option value="">— Sem editor —</option>
                  {editores.filter(e => !e.fazCaptacao).length > 0 && (
                    <optgroup label="Apenas edição">
                      {editores.filter(e => !e.fazCaptacao).map(e => (
                        <option key={e.id} value={e.id}>{e.nome}{e.especialidade ? ` · ${e.especialidade}` : ""}</option>
                      ))}
                    </optgroup>
                  )}
                  {editores.filter(e => e.fazCaptacao).length > 0 && (
                    <optgroup label="Edição + Captação">
                      {editores.filter(e => e.fazCaptacao).map(e => (
                        <option key={e.id} value={e.id}>{e.nome}{e.especialidade ? ` · ${e.especialidade}` : ""} 📷</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {demanda.editor && !editMode && (
                  <div className="mt-1.5 space-y-1">
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {demanda.editor.nome}
                      {demanda.editor.especialidade ? ` · ${demanda.editor.especialidade}` : ""}
                    </p>
                    {(demanda.editor.whatsapp || demanda.editor.telefone) && (
                      <QuickWhatsapp
                        telefone={demanda.editor.whatsapp ?? demanda.editor.telefone}
                        nome={demanda.editor.nome}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>


          {/* ── Links ────────────────────────────────────────────────────── */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
            <h2 className="font-semibold text-zinc-300 mb-4 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-purple-400" /> Links da Produção
            </h2>
            <div className="space-y-3">
              {/* Brutos */}
              <div>
                <LinkField
                  label="📁 Brutos (material bruto filmado)"
                  value={editMode ? linkBrutos : (demanda.linkBrutos ?? "")}
                  editMode={editMode}
                  onChange={setLinkBrutos}
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    ref={fileRefBrutos}
                    type="file"
                    accept="video/*,.zip"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadVideo(f, "brutos"); e.target.value = "" }}
                  />
                  <button
                    onClick={() => fileRefBrutos.current?.click()}
                    disabled={uploadingBrutos}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors disabled:opacity-50"
                  >
                    {uploadingBrutos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {uploadingBrutos ? "Enviando..." : "Upload arquivo"}
                  </button>
                  <span className="text-xs text-zinc-600">mp4, mov, avi, webm, mkv ou zip · máx 500MB</span>
                </div>
              </div>
              {/* Final */}
              <div>
                <LinkField
                  label="🎬 Arquivo Final (vídeo editado)"
                  value={editMode ? linkFinal : (demanda.linkFinal ?? "")}
                  editMode={editMode}
                  onChange={setLinkFinal}
                />
                <div className="mt-2 space-y-2">
                  {/* Botão principal: 1 clique faz tudo */}
                  <input
                    ref={fileRefAprovacao}
                    type="file"
                    accept="video/*,.zip"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadEEnviarParaAprovacao(f); e.target.value = "" }}
                  />
                  <button
                    onClick={() => fileRefAprovacao.current?.click()}
                    disabled={enviandoAprovacao}
                    className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors disabled:opacity-50 w-full justify-center"
                  >
                    {enviandoAprovacao ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {enviandoAprovacao ? "Enviando para aprovação..." : "🚀 Enviar para Aprovação"}
                  </button>
                  <p className="text-[11px] text-zinc-600 text-center">Upload → gera link → WhatsApp automático ao solicitante</p>
                  {/* Alternativa: URL externa */}
                  <div className="border-t border-zinc-800 pt-2">
                    <button
                      onClick={() => { setLinkModalTab("url"); setShowLinkModal(true) }}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors w-full justify-center"
                    >
                      <Link2 className="w-3 h-3" /> Usar URL externa (YouTube/Drive)
                    </button>
                  </div>
                  {/* Upload simples de arquivo (sem gerar aprovação) */}
                  <input
                    ref={fileRefFinal}
                    type="file"
                    accept="video/*,.zip"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadVideo(f, "final"); e.target.value = "" }}
                  />
                </div>
              </div>
              {demanda.referencia && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-36 shrink-0">📌 Referência</span>
                  <a href={demanda.referencia} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:underline flex items-center gap-1 truncate">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" /> {demanda.referencia}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ── Checklist ─────────────────────────────────────────────────── */}
          <ChecklistSection demandaId={id as string} />

          {/* ── Comentários ──────────────────────────────────────────────── */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-zinc-500" />
              <h2 className="font-semibold text-zinc-300">Comentários</h2>
            </div>
            <div className="divide-y divide-zinc-800 max-h-64 overflow-y-auto">
              {demanda.comentarios?.length === 0 && (
                <p className="p-4 text-sm text-zinc-500 text-center">Nenhum comentário ainda</p>
              )}
              {demanda.comentarios?.map((c: { id: string; texto: string; createdAt: string; usuario?: { nome: string } }) => (
                <div key={c.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-200">{c.usuario?.nome ?? "Sistema"}</span>
                    <span className="text-xs text-zinc-500">
                      {format(new Date(c.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400">{c.texto}</p>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-zinc-800 flex gap-2">
              <input
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && enviarComentario()}
                placeholder="Adicionar comentário..."
                className="flex-1 text-sm bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200 placeholder:text-zinc-500"
              />
              <button
                onClick={enviarComentario}
                disabled={sendingComment || !comentario.trim()}
                className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Coluna lateral ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Solicitante */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <h2 className="font-semibold text-zinc-300 mb-3">Solicitante</h2>
            {demanda.nomeSolicitante ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-sm">
                  {demanda.nomeSolicitante.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{demanda.nomeSolicitante}</p>
                  <p className="text-xs text-zinc-500">Solicitante externo (WhatsApp)</p>
                </div>
              </div>
            ) : demanda.solicitante ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-sm">
                  {demanda.solicitante.nome.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{demanda.solicitante.nome}</p>
                  <p className="text-xs text-zinc-500">{demanda.solicitante.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Não identificado</p>
            )}
            {/* Telefone de quem solicitou via WhatsApp */}
            {demanda.telefoneSolicitante && (
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <QuickWhatsapp
                  telefone={demanda.telefoneSolicitante}
                  nome={demanda.nomeSolicitante ?? demanda.solicitante?.nome ?? "Solicitante"}
                  label="📱 WhatsApp do solicitante"
                />
              </div>
            )}
          </div>

          {/* Datas */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <h2 className="font-semibold text-zinc-300 mb-3">Datas</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Criado</span>
                <span className="font-medium text-zinc-200">
                  {format(new Date(demanda.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Prazo</span>
                {editMode ? (
                  <input type="date" value={dataLimite} onChange={e => setDataLimite(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/30 text-zinc-200" />
                ) : demanda.dataLimite ? (
                  <span className={cn("font-medium", new Date(demanda.dataLimite) < new Date() ? "text-red-400" : "text-zinc-200")}>
                    {format(new Date(demanda.dataLimite), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                ) : <span className="text-zinc-600 text-xs">—</span>}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1"><Clapperboard className="w-3.5 h-3.5" /> Captação</span>
                {editMode ? (
                  <input type="date" value={dataCaptacao} onChange={e => setDataCaptacao(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/30 text-zinc-200" />
                ) : demanda.dataCaptacao ? (
                  <span className="font-medium text-zinc-200">
                    {format(new Date(demanda.dataCaptacao), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                ) : <span className="text-zinc-600 text-xs">—</span>}
              </div>
            </div>
          </div>

          {/* Aprovação de vídeo */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-zinc-300">Aprovação de Vídeo</h2>
              <button
                onClick={() => { setLinkModalTab("upload"); setShowLinkModal(true) }}
                className="flex items-center gap-1 text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 px-2.5 py-1.5 rounded-lg hover:bg-zinc-700"
              >
                <Upload className="w-3.5 h-3.5" /> Enviar Vídeo
              </button>
            </div>
            {demanda.linkCliente ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  <span className="text-xs text-green-400 truncate flex-1">{demanda.linkCliente}</span>
                  <button onClick={() => { navigator.clipboard.writeText(demanda.linkCliente); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}>
                    {copiado ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300" />}
                  </button>
                </div>
                <Link href={demanda.linkCliente} target="_blank" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                  <ExternalLink className="w-3 h-3" /> Abrir player de aprovação
                </Link>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Nenhum link gerado ainda.</p>
            )}
          </div>

          {/* Análise IA rápida */}
          <IACard demandaId={id as string} />

          {/* Histórico */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-500" />
              <h2 className="font-semibold text-zinc-300">Histórico</h2>
            </div>
            <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
              {demanda.historicos?.map((h: { id: string; statusNovo: string; createdAt: string; origem: string; usuario?: { nome: string } }) => (
                <div key={h.id} className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-zinc-300">
                      {STATUS_LABELS[h.statusNovo] ?? h.statusNovo}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {format(new Date(h.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                      {h.usuario ? ` · ${h.usuario.nome}` : ` · ${h.origem}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Modal gerar link de aprovação (upload ou URL) */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-semibold text-zinc-200 mb-1">Enviar para Aprovação</h3>
            <p className="text-xs text-zinc-500 mb-4">Envie o vídeo final e gere o link de aprovação para o cliente.</p>

            {/* Abas */}
            <div className="flex gap-1 bg-zinc-800 rounded-xl p-1 mb-4">
              <button
                onClick={() => setLinkModalTab("upload")}
                className={cn("flex-1 text-xs py-1.5 rounded-lg transition-colors font-medium", linkModalTab === "upload" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-200")}
              >
                📁 Fazer Upload
              </button>
              <button
                onClick={() => setLinkModalTab("url")}
                className={cn("flex-1 text-xs py-1.5 rounded-lg transition-colors font-medium", linkModalTab === "url" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200")}
              >
                🔗 URL Externa
              </button>
            </div>

            {linkGerado ? (
              /* Link gerado com sucesso */
              <div className="space-y-3">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                  <p className="text-xs text-green-400 font-medium mb-1">✅ Link gerado! WhatsApp enviado ao solicitante.</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-300 truncate flex-1">{linkGerado}</span>
                    <button onClick={() => { navigator.clipboard.writeText(linkGerado); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}>
                      {copiado ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-zinc-500" />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { setShowLinkModal(false); setLinkGerado(""); setUrlVideoInput(""); setLinkModalFile(null) }}
                  className="w-full border border-zinc-700 text-zinc-300 text-sm py-2 rounded-xl hover:bg-zinc-800"
                >
                  Fechar
                </button>
              </div>
            ) : linkModalTab === "upload" ? (
              /* Aba Upload */
              <div className="space-y-3">
                <input
                  ref={fileRefLinkModal}
                  type="file"
                  accept="video/*,.zip"
                  className="hidden"
                  onChange={e => setLinkModalFile(e.target.files?.[0] ?? null)}
                />
                {linkModalFile ? (
                  <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2">
                    <Film className="w-4 h-4 text-purple-400 shrink-0" />
                    <span className="text-xs text-zinc-200 truncate flex-1">{linkModalFile.name}</span>
                    <button onClick={() => setLinkModalFile(null)} className="text-zinc-500 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRefLinkModal.current?.click()}
                    className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-zinc-700 rounded-xl py-6 hover:border-purple-500/50 hover:bg-purple-500/5 transition-colors"
                  >
                    <Upload className="w-5 h-5 text-zinc-500" />
                    <span className="text-xs text-zinc-400">Clique para escolher arquivo</span>
                    <span className="text-[11px] text-zinc-600">mp4, mov, avi, webm · máx 500MB</span>
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={gerarLinkAprovacao}
                    disabled={gerandoLink || !linkModalFile}
                    className="flex-1 flex items-center justify-center gap-2 bg-purple-600 text-white text-sm py-2 rounded-xl hover:bg-purple-500 disabled:opacity-50 font-medium"
                  >
                    {gerandoLink ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</> : <><Send className="w-3.5 h-3.5" /> Enviar para Aprovação</>}
                  </button>
                  <button onClick={() => { setShowLinkModal(false); setLinkModalFile(null) }} className="px-3 border border-zinc-700 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              /* Aba URL */
              <div className="space-y-3">
                <input
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600 text-zinc-200 placeholder:text-zinc-500"
                  placeholder="https://drive.google.com/... ou YouTube/Vimeo"
                  value={urlVideoInput}
                  onChange={e => setUrlVideoInput(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={gerarLinkAprovacao}
                    disabled={gerandoLink || !urlVideoInput.trim()}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white text-sm py-2 rounded-xl hover:bg-blue-500 disabled:opacity-50 font-medium"
                  >
                    {gerandoLink ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando...</> : <><Link2 className="w-3.5 h-3.5" /> Gerar Link</>}
                  </button>
                  <button onClick={() => { setShowLinkModal(false); setUrlVideoInput("") }} className="px-3 border border-zinc-700 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── Componente: Análise IA inline ─────────────────────────────────────────────
function IACard({ demandaId }: { demandaId: string }) {
  const [analise, setAnalise] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function analisar() {
    setLoading(true)
    try {
      const res = await fetch("/api/ia/analisar-demanda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandaId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Erro na análise IA")
      setAnalise(json.sugestao ?? "Sem sugestão retornada.")
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-zinc-300 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-purple-400" /> Análise IA
        </h2>
        {!analise && (
          <button
            onClick={analisar}
            disabled={loading}
            className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1"
          >
            <Sparkles className={cn("w-3 h-3", loading && "animate-pulse")} />
            {loading ? "Analisando..." : "Analisar"}
          </button>
        )}
      </div>
      {analise ? (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
          <p className="text-xs text-purple-300 leading-relaxed">{analise}</p>
          <button onClick={() => setAnalise(null)} className="text-[10px] text-purple-400 hover:underline mt-2">Limpar</button>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Clique em &quot;Analisar&quot; para obter insights da IA sobre esta demanda.</p>
      )}
    </div>
  )
}

// ── Sub-componentes utilitários ───────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const isUrgente = status.includes("urgencia")
  const isConcluido = ["aprovado", "postado", "entregue_cliente"].includes(status)
  const isAtencao = ["impedimento", "reprovado_cliente", "videomaker_recusou"].includes(status)
  return (
    <span className={cn(
      "text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap",
      isUrgente && "bg-red-500/15 text-red-400",
      isConcluido && "bg-green-500/15 text-green-400",
      isAtencao && "bg-orange-500/15 text-orange-400",
      !isUrgente && !isConcluido && !isAtencao && "bg-zinc-800 text-zinc-400"
    )}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function LinkField({ label, value, editMode, onChange }: {
  label: string; value: string; editMode: boolean; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-500 w-44 shrink-0">{label}</span>
      {editMode ? (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://..."
          className="flex-1 text-sm bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200 placeholder:text-zinc-500"
        />
      ) : value ? (
        <a href={value} target="_blank" rel="noopener noreferrer"
          className="text-sm text-blue-400 hover:underline flex items-center gap-1 truncate max-w-[200px]">
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{value}</span>
        </a>
      ) : (
        <span className="text-sm text-zinc-600 italic">Não preenchido</span>
      )}
    </div>
  )
}
