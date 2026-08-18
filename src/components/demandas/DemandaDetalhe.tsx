"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { useRouter, useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Header } from "@/components/layout/Header"
import { InlineEdit } from "./InlineEdit"
import { ArteViewer } from "@/components/aprovacao/ArteViewer"
import { analisarVideoDoUpload } from "@/lib/video-compat"
import { AprovacaoCriativo } from "@/components/aprovacao/AprovacaoCriativo"
import {
  ArrowLeft, Calendar, Clock, ExternalLink, MessageCircle, Send, User,
  Video, Link2, CheckCircle2, Copy, Check, Pencil, Save, X, XCircle,
  AlertTriangle, RefreshCw, Sparkles, UserCheck, Clapperboard, Film, Trash2, Package, Upload, Loader2, Play, FolderOpen,
  CalendarRange, ArrowUpRight, FileText, Download, Eye,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ChecklistSection } from "@/components/demandas/ChecklistSection"
import { Comentarios } from "@/components/demandas/Comentarios"
import { BriefingResumido } from "@/components/demandas/BriefingResumido"
import { EVENTO_EDICAO, EVENTO_RESPONSAVEL } from "@/lib/status"
import { enviarDocumento, documentoMuitoGrande, ACCEPT_DOCUMENTOS } from "@/lib/upload-documento"
import { erroDaResposta, mensagemDeErro } from "@/lib/erro-cliente"
import { SelecaoChips } from "@/components/demandas/SelecaoChips"
import { QuickWhatsapp } from "@/components/ui/QuickWhatsapp"
import { fetcher } from "@/lib/fetcher"

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

const GROWTH_STATUS_LABELS: Record<string, string> = {
  videomaker_notificado: "Responsável Notificado",
  videomaker_aceitou: "Responsável Aceitou",
  videomaker_recusou: "Responsável Recusou",
  captacao_agendada: "Briefing Agendado",
  captacao_realizada: "Briefing Concluído",
  brutos_enviados: "Materiais Enviados",
  editor_atribuido: "Responsável Atribuído",
  fila_edicao: "Fila de Criação",
  editando: "Em Criação",
  edicao_finalizada: "Criativo Finalizado",
  revisao_pendente: "Revisão Pendente",
  aguardando_aprovacao_cliente: "Aguardando Aprovação",
  aprovado_cliente: "Aprovado pelo Cliente",
  reprovado_cliente: "Ajuste Solicitado",
  postagem_pendente: "Programado",
  postado: "Publicado",
  entregue_cliente: "Finalizado",
}

// A área diz QUEM PRODUZ; o departamento diz QUEM PEDIU. São eixos diferentes, e
// misturá-los quebrava 104 demandas: um vídeo institucional solicitado pelo
// departamento de Growth é produção audiovisual, mas caía na interface de Growth
// — aparecia "Equipe Growth" e o visualizador de artes onde deveria haver
// videomaker, editor e player. Só a área decide a interface.
function isGrowthDemand(d?: { area?: string | null }) {
  return String(d?.area ?? "").toLowerCase() === "design"
}

function statusLabel(status: string, growth: boolean) {
  return (growth ? GROWTH_STATUS_LABELS[status] : undefined) ?? STATUS_LABELS[status] ?? status
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)
}

function formatDetailLabel(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
}

function formatDetailValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Sim" : "Não"
  if (Array.isArray(value)) return value.filter(Boolean).join(", ")
  if (value === null || value === undefined || value === "") return "Não informado"
  return String(value)
}

function getDemandCopy(growth: boolean) {
  if (growth) {
    return {
      teamTitle: "Equipe Growth",
      responsibleLabel: "Responsável",
      productionTitle: "Arquivos e Aprovação",
      rawLabel: "📁 Materiais / Referências (Drive)",
      addRaw: "Adicionar link de materiais",
      rawSaved: "Link de materiais salvo!",
      rawRemoveConfirm: "link de materiais",
      rawUploaded: "✅ Materiais enviados com sucesso!",
      finalLabel: "Arquivos Finais",
      finalSingleLabel: "Arquivo Final",
      finalEditLabel: "🎨 Arquivo final (arte/criativo)",
      finalRemoveConfirm: "este arquivo final",
      finalRemoved: "Arquivo removido!",
      finalRemoveError: "Erro ao remover arquivo",
      addFinalButton: "🚀 Enviar outro arquivo",
      sendApprovalButton: "🚀 Enviar Arte/Criativo para Aprovação",
      finalCountLabel: "arquivo(s)",
      progressHint: "Upload → aprovação → Drive automático",
      uploadModalTitle: "🚀 Enviar arte/criativo para aprovação",
      rawUploadModalTitle: "📁 Upload de Materiais",
      uploadModalDescription: "Envie o arquivo final e gere o link de aprovação para o cliente.",
      rawUploadModalDescription: "Faça upload dos materiais/referências ou informe o link.",
      fileAccept: "image/*,.pdf,.zip,.psd,.ai,.fig,.svg,.webp,.png,.jpg,.jpeg,.mp4,.mov",
      uploadFormat: "imagens, pdf, zip, psd, ai, fig, svg ou vídeo curto",
      contentTypeFallback: "application/octet-stream",
      approvalTitle: "Aprovação do Criativo",
      dateCaptureLabel: "Entrega",
      noInline: "Não é possível visualizar inline.",
      viewAction: "Visualizar",
    }
  }

  return {
    teamTitle: "Equipe da Demanda",
    responsibleLabel: "Responsável",
    productionTitle: "Links da Produção",
    rawLabel: "📁 Brutos (URL do Google Drive)",
    addRaw: "Adicionar link de brutos",
    rawSaved: "Link de brutos salvo!",
    rawRemoveConfirm: "link de brutos",
    rawUploaded: "✅ Brutos enviados com sucesso!",
    finalLabel: "Vídeos Finais",
    finalSingleLabel: "Vídeo Final",
    finalEditLabel: "🎬 Arquivo Final (vídeo editado)",
    finalRemoveConfirm: "este vídeo final",
    finalRemoved: "Vídeo removido!",
    finalRemoveError: "Erro ao remover vídeo",
    addFinalButton: "🚀 Enviar mais um vídeo",
    sendApprovalButton: "🚀 Enviar para Aprovação",
    finalCountLabel: "vídeo(s)",
    progressHint: "Supabase → aprovação → Drive automático",
    uploadModalTitle: "🚀 Enviar para Aprovação",
    rawUploadModalTitle: "📁 Upload de Brutos",
    uploadModalDescription: "Envie o vídeo final e gere o link de aprovação para o cliente.",
    rawUploadModalDescription: "Faça upload do material bruto filmado ou informe o link.",
    fileAccept: "video/*,.zip",
    uploadFormat: "mp4, mov, avi, webm · via Google Drive · sem limite de tamanho",
    contentTypeFallback: "video/mp4",
    approvalTitle: "Aprovação de Vídeo",
    dateCaptureLabel: "Captação",
    noInline: "Não é possível reproduzir inline.",
    viewAction: "Ver vídeo",
  }
}

interface EquipeOpcao { value: string; label: string; subtitle: string; tipoContrato: string; origem: "vm" | "ed" | "user" }
interface ArquivoVideo { id: string; tipoArquivo: string; url: string; nomeArquivo: string; sequencia: number | null; createdAt: string }

/**
 * Avisa que o link de aprovação morreu — e oferece a renovação num clique.
 *
 * A tela mostrava o link em verde com check mesmo depois de vencido. Quem
 * acompanhava a demanda achava que o cliente tinha o vídeo em mãos; o cliente
 * abria e via "Link inválido", sem nenhuma saída na página. Em 17/08/2026 isso
 * valia para 44 das 49 aprovações pendentes.
 *
 * A rota de renovar já existia (PATCH, +30 dias) e nenhuma tela a chamava.
 */
function AvisoLinkExpirado({ linkCliente, expiresAt, onRenovado }: {
  linkCliente?: string | null
  expiresAt?: string | null
  onRenovado: () => void
}) {
  const [renovando, setRenovando] = useState(false)
  if (!linkCliente || !expiresAt) return null
  const venceu = new Date(expiresAt) < new Date()
  if (!venceu) return null

  const token = linkCliente.split("/aprovar/")[1]?.split(/[?#]/)[0]
  const quando = new Date(expiresAt).toLocaleDateString("pt-BR")

  async function renovar() {
    if (!token) return
    setRenovando(true)
    try {
      const r = await fetch(`/api/aprovacao-video/${token}`, { method: "PATCH" })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro ao renovar")
      toast.success("Link renovado por mais 30 dias. Pode reenviar ao cliente.")
      onRenovado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui renovar o link")
    } finally { setRenovando(false) }
  }

  return (
    <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 space-y-2">
      <p className="text-xs text-red-300">
        <b>Este link expirou em {quando}.</b> Quem abrir vê “Link inválido” — o vídeo não chega ao cliente.
      </p>
      <button
        onClick={renovar}
        disabled={renovando || !token}
        className="w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${renovando ? "animate-spin" : ""}`} />
        {renovando ? "Renovando..." : "Renovar por mais 30 dias"}
      </button>
    </div>
  )
}

export function DemandaDetalhe({ demandaId, mode = "page", onClose }: { demandaId: string; mode?: "page" | "modal"; onClose?: () => void }) {
  const id = demandaId
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── Estado geral ──────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false)

  const [saving, setSaving] = useState(false)
  const [salvandoResponsaveis, setSalvandoResponsaveis] = useState(false)
  const [salvandoProdutos, setSalvandoProdutos] = useState(false)
  const [comentario, setComentario] = useState("")
  const [sendingComment, setSendingComment] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkGerado, setLinkGerado] = useState("")
  const [urlVideoInput, setUrlVideoInput] = useState("")
  const [gerandoLink, setGerandoLink] = useState(false)
  const [linkModalTab, setLinkModalTab] = useState<"upload" | "url">("upload")
  const [linkModalFile, setLinkModalFile] = useState<File | null>(null)
  const [linkModalTipo, setLinkModalTipo] = useState<"final" | "brutos">("final")
  const [uploadProgress, setUploadProgress] = useState(0) // 0-100 durante upload Drive
  const fileRefLinkModal = useRef<HTMLInputElement>(null)
  const [playerUrl, setPlayerUrl] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [compartilhando, setCompartilhando] = useState(false)
  // null = ainda não mexemos nesta sessão; a origem da verdade é a demanda.
  const [linkPublicoLocal, setLinkPublicoLocal] = useState<string | null | undefined>(undefined)
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
  // ── Documentos anexados ───────────────────────────────────────────────────
  const [aprovacaoAberta, setAprovacaoAberta] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docUploadProgress, setDocUploadProgress] = useState(0)
  const fileRefDoc = useRef<HTMLInputElement>(null)

  // ── SWR ───────────────────────────────────────────────────────────────────
  const { data, mutate } = useSWR(`/api/demandas/${id}`, fetcher)
  const demanda = data?.demanda
  const isGrowth = isGrowthDemand(demanda)
  const copy = getDemandCopy(isGrowth)

  // Listas atuais para os campos de múltipla escolha. A M2M já vinha no GET —
  // só nunca era renderizada, então a tela mostrava um valor onde havia vários.
  const responsaveisAtuais: string[] = (
    (demanda?.responsaveis as { usuario?: { id?: string } }[] | undefined) ?? []
  )
    .map((r) => r.usuario?.id)
    .filter((v): v is string => !!v)
  const produtosAtuais: string[] = (
    (demanda?.produtos as { produtoId?: string }[] | undefined) ?? []
  )
    .map((p) => p.produtoId)
    .filter((v): v is string => !!v)

  const { data: dataMe } = useSWR("/api/me", fetcher)
  const { data: dataOpcoesCaptacao } = useSWR<{ opcoes: EquipeOpcao[] }>("/api/equipe-disponivel?papel=captacao", fetcher)
  const { data: dataOpcoesEdicao } = useSWR<{ opcoes: EquipeOpcao[] }>("/api/equipe-disponivel?papel=edicao", fetcher)
  const { data: dataProdutos } = useSWR<{ produtos: { id: string; nome: string }[] }>("/api/produtos", fetcher)
  const { data: dataGrowthResponsaveis } = useSWR<{
    responsaveis: { id: string; nome: string; email?: string | null; tipo?: string | null; label: string }[]
  }>(isGrowth ? "/api/growth/responsaveis" : null, fetcher)
  const { data: dataLinhasProjetos } = useSWR<{
    linhas: { id: string; nome: string; descricao?: string | null; ativo: boolean }[]
  }>(isGrowth ? "/api/growth/linhas-projetos?incluirInativas=1" : null, fetcher)
  const opcoesCaptacao = dataOpcoesCaptacao?.opcoes ?? []
  const opcoesEdicao = dataOpcoesEdicao?.opcoes ?? []
  const produtos = dataProdutos?.produtos ?? []
  const papelAtual = String(dataMe?.membership?.papel ?? dataMe?.tipo ?? "").toLowerCase()
  const podeGerenciar = papelAtual === "admin" || papelAtual === "gestor"
  const podeEditar = podeGerenciar || Boolean(dataMe?.permissoes?.editarDemanda)
  const podeExcluir = podeGerenciar || Boolean(dataMe?.permissoes?.excluirDemanda)

  // O atalho ?edit=true só abre o formulário completo para quem realmente pode editar.
  useEffect(() => {
    if (dataMe && searchParams.get("edit") === "true" && podeEditar) setEditMode(true)
  }, [dataMe, searchParams, podeEditar])

  // ── Sincroniza campos ao carregar demanda ─────────────────────────────────
  useEffect(() => {
    if (demanda && !editMode) {
      setTitulo(demanda.titulo ?? "")
      setDescricao(demanda.descricao ?? "")
      setCidade(demanda.cidade ?? "")
      setDataLimite(demanda.dataLimite ? demanda.dataLimite.split("T")[0] : "")
      setDataCaptacao(demanda.dataCaptacao ? demanda.dataCaptacao.split("T")[0] : "")
      setVideomakerId(demanda.videomaker ? `vm:${demanda.videomaker.id}` : "")
      setEditorId(demanda.editor ? `ed:${demanda.editor.id}` : "")
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
      if (!res.ok) throw await erroDaResposta(res, "Não foi possível salvar a demanda.")
      toast.success("Demanda atualizada!")
      setEditMode(false)
      mutate()
    } catch (e) {
      // Título, descrição e prazo não têm input neste formulário (são editados
      // pelo InlineEdit, que mostra o erro no próprio campo). Aqui o toast já
      // carrega a mensagem específica da API, não um "erro ao salvar" genérico.
      toast.error(mensagemDeErro(e, "Não foi possível salvar a demanda."))
    } finally {
      setSaving(false)
    }
  }

  // Salva um único campo (edição inline). Lança ErroApi com a mensagem da API —
  // o InlineEdit mostra esse texto embaixo do próprio campo.
  async function salvarCampo(patch: Record<string, unknown>) {
    const res = await fetch(`/api/demandas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw await erroDaResposta(res, "Não foi possível salvar este campo.")
    await mutate()
  }

  async function excluirDemanda() {
    if (!confirm(`Tem certeza que deseja excluir a demanda ${demanda.codigo}? Esta ação não pode ser desfeita.`)) return
    try {
      const res = await fetch(`/api/demandas/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(err.error ?? "Erro ao excluir")
      }
      toast.success("Demanda excluída!")
      if (mode === "modal") onClose?.()
      else router.push("/demandas")
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
      setVideomakerId(demanda.videomaker ? `vm:${demanda.videomaker.id}` : "")
      setEditorId(demanda.editor ? `ed:${demanda.editor.id}` : "")
      setLinkBrutos(demanda.linkBrutos ?? "")
      setLinkFinal(demanda.linkFinal ?? "")
      setLocalGravacao(demanda.localGravacao ?? "")
      setClassificacao(demanda.classificacao ?? "")
      setProdutoId(demanda.produtos?.[0]?.produtoId ?? "")
    }
  }

  // ── Upload via URL presigned (bypass limite 4.5MB do Vercel) ────────────
  // Captura primeiro frame de um arquivo de vídeo (client-side Canvas)
  async function captureVideoThumbnail(file: File): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = document.createElement("video")
      video.preload = "metadata"
      video.muted = true
      video.playsInline = true
      const objectUrl = URL.createObjectURL(file)
      video.src = objectUrl
      const cleanup = () => URL.revokeObjectURL(objectUrl)

      video.addEventListener("loadedmetadata", () => {
        video.currentTime = Math.min(1, (video.duration || 2) * 0.1)
      }, { once: true })

      video.addEventListener("seeked", () => {
        cleanup()
        try {
          const w = Math.min(video.videoWidth || 640, 800)
          const h = Math.round(w * (video.videoHeight || 360) / (video.videoWidth || 640))
          const canvas = document.createElement("canvas")
          canvas.width = w; canvas.height = h
          canvas.getContext("2d")?.drawImage(video, 0, 0, w, h)
          canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8)
        } catch { resolve(null) }
      }, { once: true })

      video.addEventListener("error", () => { cleanup(); resolve(null) }, { once: true })
    })
  }

  async function uploadPresigned(file: File, tipo: "brutos" | "final"): Promise<string> {
    const contentType = file.type || copy.contentTypeFallback

    // Confere ANTES de subir se o vídeo abre no navegador de quem aprova.
    //
    // Não adianta testar o player daqui: quem envia costuma estar no Mac, onde
    // o Safari toca HEVC sem reclamar — o videomaker vê o vídeo perfeito e sobe
    // tranquilo, e o cliente abre no Chrome e vê preto. Por isso a checagem
    // olha os bytes do arquivo, não o navegador.
    if (tipo === "final") {
      const compat = await analisarVideoDoUpload(file)
      if (!compat.compativel) {
        const seguir = window.confirm(
          `${compat.motivo}\n\n${compat.comoResolver}\n\nEnviar mesmo assim?`
        )
        if (!seguir) throw new Error("Envio cancelado — exporte em H.264 / MP4 e tente de novo.")
      }
    }

    // Valida tamanho (Supabase Pro suporta até 5 GB após configurar no dashboard)
    const MAX_UPLOAD_MB = 490
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      const fileMb = (file.size / (1024 * 1024)).toFixed(0)
      throw new Error(
        `Arquivo muito grande (${fileMb} MB). Limite máximo: ${MAX_UPLOAD_MB} MB.`
      )
    }

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
      // Tenta extrair mensagem legível do JSON de erro do Supabase
      let msg = `HTTP ${uploadRes.status}`
      if (errText) {
        try { msg = (JSON.parse(errText) as { message?: string }).message ?? errText } catch { msg = errText }
      }
      throw new Error(`Falha no upload: ${msg}`)
    }

    // 3. Para vídeos finais: captura thumbnail e faz upload separado para Supabase
    let thumbnailUrl: string | undefined
    if (!isGrowth && tipo === "final" && file.type.startsWith("video/")) {
      try {
        const thumbBlob = await captureVideoThumbnail(file)
        if (thumbBlob) {
          const thumbUrlRes = await fetch(
            `/api/demandas/${id}/upload-url?tipo=thumbnail&contentType=image%2Fjpeg`
          )
          if (thumbUrlRes.ok) {
            const { uploadUrl: thumbUploadUrl, publicUrl: thumbPublicUrl } = await thumbUrlRes.json() as { uploadUrl: string; publicUrl: string }
            const thumbUpRes = await fetch(thumbUploadUrl, {
              method: "PUT",
              headers: { "Content-Type": "image/jpeg" },
              body: thumbBlob,
            })
            if (thumbUpRes.ok) thumbnailUrl = thumbPublicUrl
          }
        }
      } catch { /* falha silenciosa — thumbnail não é crítica */ }
    }

    // 4. Salva a URL na demanda (+ thumbnailUrl se disponível)
    await fetch(`/api/demandas/${id}/upload-video`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: publicUrl, tipo, ...(thumbnailUrl ? { thumbnailUrl } : {}) }),
    })

    return publicUrl
  }

  // ── Upload de documentos (PDF, Word, Excel…) via Supabase presigned URL ───
  async function uploadDocumento(file: File) {
    if (documentoMuitoGrande(file)) {
      toast.error("Arquivo acima de 25 MB — anexe um link ou reduza o arquivo.")
      return
    }
    setUploadingDoc(true)
    setDocUploadProgress(0)
    try {
      await enviarDocumento(id, file, setDocUploadProgress)
      toast.success("📄 Documento anexado!")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao anexar documento")
    } finally {
      setUploadingDoc(false)
      setDocUploadProgress(0)
    }
  }

  async function deletarDocumento(arquivoId: string) {
    if (!confirm("Remover este documento?")) return
    const res = await fetch(`/api/demandas/${id}/upload-video`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: null, tipo: "documento", arquivoId }),
    })
    if (res.ok) { toast.success("Documento removido"); mutate() }
    else toast.error("Erro ao remover")
  }

  // ── Upload via Google Drive (chunks via servidor — sem CORS) ──────────────
  // O browser envia chunks para o nosso servidor, que os repassa ao Google.
  // Evita o problema de CORS que ocorre com PUT direto do browser para googleapis.com
  // usando sessões autenticadas com Service Account.
  async function uploadParaDrive(file: File, tipo: "final" | "brutos"): Promise<string> {
    setUploadProgress(0)

    const CHUNK_SIZE = 4 * 1024 * 1024 // 4 MB por chunk (dentro do limite Vercel 4.5 MB)
    const contentType = file.type || copy.contentTypeFallback
    const ext = file.name.split(".").pop() ?? "mp4"

    // Filename: [produto]_[titulo]_[codigo]
    const sanitize = (s: string) =>
      s.replace(/[/\\:*?"<>|]/g, "").trim().replace(/\s+/g, "_")
    const produtoNome = (demanda as { produtos?: { produto?: { nome?: string } }[] })
      ?.produtos?.[0]?.produto?.nome
    const demandaTitulo = (demanda as { titulo?: string })?.titulo
    const demandaCodigo = (demanda as { codigo?: string })?.codigo ?? id
    const parts: string[] = []
    if (produtoNome) parts.push(sanitize(produtoNome).substring(0, 30))
    if (demandaTitulo) parts.push(sanitize(demandaTitulo).substring(0, 40))
    if (demandaCodigo) parts.push(String(demandaCodigo))
    const fileName = (parts.length > 0 ? parts.join("_") : `${isGrowth ? "arquivo" : "video"}_${tipo}`) + `.${ext}`

    // 1. Criar sessão de upload resumável no Google Drive (server-side)
    const params = new URLSearchParams({
      fileName,
      fileSize: String(file.size),
      contentType,
    })
    const urlRes = await fetch(`/api/demandas/${id}/drive-upload-url?${params}`)
    if (!urlRes.ok) {
      const err = await urlRes.json().catch(() => ({ error: "Erro ao criar sessão Drive" }))
      throw new Error((err as { error?: string }).error ?? "Erro ao criar sessão Drive")
    }
    const { sessionUri, publicUrl } = (await urlRes.json()) as { sessionUri: string; publicUrl: string }

    // 2. Upload em chunks via servidor (server-to-server, sem CORS)
    let offset = 0
    while (offset < file.size) {
      const end   = Math.min(offset + CHUNK_SIZE, file.size)
      const chunk = file.slice(offset, end)

      const res = await fetch(`/api/demandas/${id}/drive-upload-chunk`, {
        method: "POST",
        headers: {
          "Content-Type":   "application/octet-stream",
          "x-session-uri":  sessionUri,
          "x-offset":       String(offset),
          "x-total-size":   String(file.size),
          "x-content-type": contentType,
        },
        body: chunk,
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(json.error ?? `Falha no upload (bytes ${offset}–${end})`)
      }

      offset = end
      setUploadProgress(Math.round((offset / file.size) * 100))
    }

    // 3. Salva URL do Drive na demanda
    await fetch(`/api/demandas/${id}/upload-video`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: publicUrl, tipo }),
    })

    return publicUrl
  }

  // ── Atribuição rápida (sem entrar em edit mode) ───────────────────────────
  async function atribuirRapido(campo: "videomakerId" | "editorId", valor: string) {
    try {
      const res = await fetch(`/api/demandas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor || null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(err.error ?? "Erro ao atribuir")
      }
      const label = campo === "videomakerId" ? "Videomaker atribuído!" : "Editor atribuído!"
      toast.success(label)
      await mutate()
    } catch (e) {
      toast.error(mensagemDeErro(e))
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

  // ── Enviar vídeo (upload + aprovação para final | apenas upload para brutos) ─
  function abrirModalUpload(tipo: "final" | "brutos") {
    setLinkModalTipo(tipo)
    setLinkModalTab("upload")
    setLinkModalFile(null)
    setLinkGerado("")
    setUrlVideoInput("")
    setShowLinkModal(true)
  }

  async function gerarLinkAprovacao() {
    if (linkModalTab === "upload" && !linkModalFile) return
    if (linkModalTab === "url" && !urlVideoInput.trim()) return
    setGerandoLink(true)
    try {
      let videoUrl = urlVideoInput.trim()

      if (linkModalTab === "upload" && linkModalFile) {
        // Vídeo final → Google Drive (sem limite de tamanho)
        // Brutos → Supabase (arquivos menores, fluxo interno)
        if (linkModalTipo === "final") {
          videoUrl = await uploadPresigned(linkModalFile, "final")
          setLinkFinal(videoUrl)
        } else {
          videoUrl = await uploadPresigned(linkModalFile, "brutos")
          setLinkBrutos(videoUrl)
        }
      } else {
        // URL externa: salva diretamente no DB
        await fetch(`/api/demandas/${id}/upload-video`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: videoUrl, tipo: linkModalTipo }),
        })
        if (linkModalTipo === "final") setLinkFinal(videoUrl)
        else setLinkBrutos(videoUrl)
      }

      // Brutos: apenas salvar, sem gerar link de aprovação
      if (linkModalTipo === "brutos") {
      toast.success(copy.rawUploaded)
        setShowLinkModal(false)
        setLinkModalFile(null)
        setUrlVideoInput("")
        mutate()
        return
      }

      // Final: gerar link de aprovação + mover status
      const res = await fetch("/api/aprovacao-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 30 dias, não 7.
        //
        // Sete dias não cabem no ciclo real: o cliente viaja, o material fica
        // para a semana seguinte, e quando ele abre o link já morreu. Em
        // 17/08/2026, 44 das 49 aprovações pendentes estavam expiradas — a mais
        // antiga esperando desde abril. Cada uma dessas é um vídeo pronto que
        // não vira publicação.
        //
        // O texto que vai no WhatsApp já dizia "válido por 30 dias" quando o
        // valor não era informado: a tela mandava 7 e prometia 30.
        body: JSON.stringify({ demandaId: id, urlVideo: videoUrl, expiresInDays: 30 }),
      })
      const text = await res.text()
      let json: { ok?: boolean; link?: string; error?: string } = {}
      try { json = JSON.parse(text) } catch { /* body não é JSON */ }
      if (!res.ok) throw new Error(json.error ?? (text.slice(0, 200) || `Erro HTTP ${res.status}`))
      setLinkGerado(json.link ?? "")

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

  // ── Excluir link de vídeo ────────────────────────────────────────────────
  // ── Confirmação de videomaker para cobertura ────────────────────────────
  const [confirmandoVM, setConfirmandoVM] = useState(false)
  async function confirmarVideomaker(aceite: boolean) {
    setConfirmandoVM(true)
    try {
      const novoStatus = aceite ? "videomaker_aceitou" : "videomaker_recusou"
      await fetch(`/api/demandas/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusInterno: novoStatus, origem: "manual" }),
      })
      if (!aceite) {
        // Liberar vaga do videomaker
        await fetch(`/api/demandas/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videomakerId: null }),
        })
        toast.success("Videomaker recusou. Demanda aguardando novo videomaker.")
      } else {
        toast.success("Confirmado! Videomaker aceito.")
      }
      mutate()
    } catch {
      toast.error("Erro ao atualizar confirmação")
    } finally { setConfirmandoVM(false) }
  }

  // ── Aprovação de demanda externa ─────────────────────────────────────────
  const [aprovandoDemanda, setAprovandoDemanda] = useState(false)
  const [recusando, setRecusando] = useState(false)
  const [motivoRecusa, setMotivoRecusa] = useState("")

  async function aprovarDemanda() {
    setAprovandoDemanda(true)
    try {
      const res = await fetch(`/api/demandas/${id}/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "aprovar" }),
      })
      const err = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((err as { error?: string }).error ?? "Erro ao aprovar")
      toast.success("Demanda aprovada! Solicitante notificado.")
      mutate()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro") }
    finally { setAprovandoDemanda(false) }
  }

  async function recusarDemanda() {
    if (!motivoRecusa.trim()) return
    setAprovandoDemanda(true)
    try {
      const res = await fetch(`/api/demandas/${id}/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "recusar", motivo: motivoRecusa }),
      })
      const err = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((err as { error?: string }).error ?? "Erro ao recusar")
      toast.success("Demanda recusada. Solicitante notificado.")
      setRecusando(false)
      setMotivoRecusa("")
      mutate()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro") }
    finally { setAprovandoDemanda(false) }
  }

  // ── Quick Brutos (sem editMode) ──────────────────────────────────────────
  const [quickBrutosInput, setQuickBrutosInput] = useState("")
  const [showQuickBrutos, setShowQuickBrutos] = useState(false)
  const [savingBrutos, setSavingBrutos] = useState(false)

  // ── Converter em Evento de Cobertura ────────────────────────────────────
  const [convertendoEvento, setConvertendoEvento] = useState(false)
  async function converterEmEvento() {
    if (!confirm("Criar um Evento de Cobertura a partir desta demanda?\n\nOs dados (título, local, data, videomaker) serão copiados para o novo evento.")) return
    setConvertendoEvento(true)
    try {
      const res = await fetch(`/api/demandas/${id}/converter-evento`, { method: "POST" })
      const json = await res.json().catch(() => ({} as { cobertura?: { id: string }; error?: string }))
      if (!res.ok) throw new Error(json.error ?? "Erro ao converter")
      toast.success("✅ Evento criado! Redirecionando...")
      mutate()
      setTimeout(() => router.push(`/coberturas/${json.cobertura.id}`), 1200)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao converter em evento")
      setConvertendoEvento(false)
    }
  }

  // ── Pastas de Cobertura ──────────────────────────────────────────────────
  const [editingFolder, setEditingFolder] = useState<"brutos" | "final" | null>(null)
  const [folderBrutosInput, setFolderBrutosInput] = useState("")
  const [folderFinalInput, setFolderFinalInput] = useState("")
  const [savingFolder, setSavingFolder] = useState(false)
  async function salvarFolder(campo: "linkFolderBrutos" | "linkFolderFinal") {
    const value = campo === "linkFolderBrutos" ? folderBrutosInput : folderFinalInput
    if (!value.trim()) return
    setSavingFolder(true)
    try {
      await fetch(`/api/demandas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: value.trim() }),
      })
      toast.success("Link da pasta salvo!")
      setEditingFolder(null)
      mutate()
    } catch {
      toast.error("Erro ao salvar link da pasta")
    } finally { setSavingFolder(false) }
  }
  async function salvarQuickBrutos() {
    if (!quickBrutosInput.trim()) return
    setSavingBrutos(true)
    try {
      await fetch(`/api/demandas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkBrutos: quickBrutosInput.trim() }),
      })
      toast.success(copy.rawSaved)
      setShowQuickBrutos(false)
      setQuickBrutosInput("")
      mutate()
    } catch {
      toast.error("Erro ao salvar link")
    } finally { setSavingBrutos(false) }
  }

  async function deleteVideoLink(tipo: "brutos" | "final", arquivoId?: string) {
    if (!confirm(`Remover ${tipo === "brutos" ? copy.rawRemoveConfirm : copy.finalRemoveConfirm}?`)) return
    try {
      await fetch(`/api/demandas/${id}/upload-video`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: null, tipo, ...(arquivoId ? { arquivoId } : {}) }),
      })
      if (tipo === "brutos") setLinkBrutos("")
      else setLinkFinal("")
      toast.success(copy.finalRemoved)
      mutate()
    } catch {
      toast.error(copy.finalRemoveError)
    }
  }

  // ── Helper para player de vídeo ──────────────────────────────────────────
  function getEmbedUrl(url: string): { type: "video" | "image" | "youtube" | "drive" | "external"; embedUrl: string } {
    if (isImageUrl(url)) {
      return { type: "image", embedUrl: url }
    }
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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!demanda) {
    if (mode === "modal") {
      return (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
          <div className="animate-spin w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full" />
        </div>
      )
    }
    return (
      <>
        <Header title="Carregando..." />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full" />
        </div>
      </>
    )
  }

  // ── Link público de acompanhamento (somente leitura, revogável) ───────────
  // Sem edição local, o estado vem da própria demanda — assim reabrir o modal
  // mostra "Link ativo" para quem já compartilhou antes.
  const linkPublico =
    linkPublicoLocal !== undefined
      ? linkPublicoLocal
      : demanda.publicTokenAtivo && demanda.publicToken
        ? `${typeof window !== "undefined" ? window.location.origin : ""}/d/${demanda.publicToken}`
        : null

  async function compartilhar(rotacionar = false) {
    setCompartilhando(true)
    try {
      const res = await fetch(`/api/demandas/${demanda.id}/compartilhar${rotacionar ? "?rotacionar=1" : ""}`, { method: "POST" })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "Erro ao gerar link")
      setLinkPublicoLocal(j.link)
      await navigator.clipboard.writeText(j.link).catch(() => null)
      toast.success(rotacionar ? "Novo link gerado e copiado (o anterior parou de funcionar)" : "Link copiado!")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar link")
    } finally {
      setCompartilhando(false)
    }
  }

  async function revogarLink() {
    if (!confirm("Revogar o link? Quem já recebeu deixa de conseguir abrir.")) return
    setCompartilhando(true)
    try {
      const res = await fetch(`/api/demandas/${demanda.id}/compartilhar`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao revogar")
      setLinkPublicoLocal(null)
      toast.success("Link revogado.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao revogar")
    } finally {
      setCompartilhando(false)
    }
  }

  const acoes = (
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
          {podeExcluir && (
            <button onClick={excluirDemanda} className="flex items-center gap-1.5 text-sm border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          )}
          {podeEditar && (
            linkPublico ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { navigator.clipboard.writeText(linkPublico); toast.success("Link copiado!") }}
                  title={linkPublico}
                  className="flex items-center gap-1.5 text-sm border border-emerald-700/50 text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10"
                >
                  <Link2 className="w-3.5 h-3.5" /> Link ativo
                </button>
                <button
                  onClick={revogarLink}
                  disabled={compartilhando}
                  title="Revogar o link"
                  className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => compartilhar(false)}
                disabled={compartilhando}
                title="Gerar link de acompanhamento (somente leitura) para enviar a alguém de fora"
                className="flex items-center gap-1.5 text-sm border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
              >
                <Link2 className="w-3.5 h-3.5" /> {compartilhando ? "Gerando..." : "Compartilhar"}
              </button>
            )
          )}
          {podeEditar && (
            <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 text-sm border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg hover:bg-zinc-800">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          )}
          {mode === "page" && (
            <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
          )}
        </>
      )}
    </div>
  )

  // Prévia da aprovação (Growth): artes finais + copy dos detalhes de entrega
  const artesPrevia = ((demanda.arquivos ?? []) as Array<{ tipoArquivo: string; url: string; sequencia: number | null }>)
    .filter((a) => a.tipoArquivo === "final")
    .sort((a, b) => (a.sequencia ?? 0) - (b.sequencia ?? 0))
    .map((a) => a.url)
  const copyPrevia = (() => {
    const det = demanda.detalhesEntrega as Record<string, unknown> | null | undefined
    if (det) for (const [k, v] of Object.entries(det)) if (/copy|legenda|caption/i.test(k) && typeof v === "string" && v.trim()) return v
    return demanda.descricao ?? ""
  })()

  const corpo = (
    <>
      {/* Modal de aprovação de criativo (in-app) — tela do cliente com Aprovar/Solicitar ajuste */}
      {aprovacaoAberta && demanda.linkCliente && (
        <div className="fixed inset-0 z-[75] bg-black/80 overflow-y-auto" onClick={(e) => { if (e.target !== e.currentTarget) return; setAprovacaoAberta(false); mutate() }}>
          <div className="min-h-full flex items-start justify-center p-4">
            <div className="w-full max-w-5xl my-6 bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
                <span className="text-sm font-semibold text-zinc-200">Aprovação — {demanda.codigo}</span>
                <button onClick={() => { setAprovacaoAberta(false); mutate() }} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800" aria-label="Fechar"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-5">
                <AprovacaoCriativo token={demanda.linkCliente.split("/aprovar/")[1]} onAprovado={() => mutate()} />
              </div>
            </div>
          </div>
        </div>
      )}
      <main className="flex-1 p-6 grid grid-cols-1 gap-6 lg:grid-cols-3 max-w-6xl mx-auto w-full">
        {/* ── Coluna principal ────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {isGrowth ? (
            <>
              {/* ── HERO Growth: arte + aprovação no topo ─────────────────── */}
              <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
                <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
                  <ArteViewer artes={artesPrevia} />
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <InlineEdit
                          value={demanda.titulo ?? ""}
                          canEdit={podeEditar}
                          tipo="text"
                          placeholder="Sem título"
                          onSave={(v) => salvarCampo({ titulo: v })}
                          display={<span className="text-lg font-bold text-zinc-100 leading-tight">{demanda.titulo || "Sem título"}</span>}
                        />
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 flex-wrap mt-1">
                          <span className="px-2 py-0.5 rounded-full bg-zinc-800">{demanda.tipoVideo}</span>
                          {demanda.produtos?.[0]?.produto?.nome && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300"><Package className="w-3 h-3" /> {demanda.produtos[0].produto.nome}</span>
                          )}
                          {demanda.linhaProjetoRef?.nome && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300">{demanda.linhaProjetoRef.nome}</span>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={demanda.statusInterno} isGrowth={isGrowth} />
                    </div>

                    {copyPrevia && (
                      <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Copy / legenda</p>
                          <button onClick={() => { navigator.clipboard.writeText(copyPrevia); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }} className="text-[11px] text-zinc-400 hover:text-white inline-flex items-center gap-1">
                            {copiado ? <><Check className="w-3 h-3 text-emerald-400" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar</>}
                          </button>
                        </div>
                        <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{copyPrevia}</p>
                      </div>
                    )}

                    {/* Ação de aprovação — única e clara */}
                    {artesPrevia.length === 0 ? (
                      <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        Anexe a arte final (seção <b>Arquivos e Aprovação</b> abaixo) para poder enviar ao cliente.
                      </div>
                    ) : demanda.linkCliente ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                          <span className="text-xs text-green-400 truncate flex-1">{demanda.linkCliente}</span>
                          <button onClick={() => { navigator.clipboard.writeText(demanda.linkCliente); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }} title="Copiar link">
                            {copiado ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300" />}
                          </button>
                        </div>
                        <AvisoLinkExpirado
                          linkCliente={demanda.linkCliente}
                          expiresAt={demanda.aprovacoesVideo?.[0]?.expiresAt}
                          onRenovado={() => mutate()}
                        />
                        <button onClick={() => setAprovacaoAberta(true)} className="w-full flex items-center justify-center gap-1.5 text-sm bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-semibold py-2.5 rounded-xl">
                          <Eye className="w-4 h-4" /> Abrir aprovação
                        </button>
                        <a href={demanda.linkCliente} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300">
                          <ExternalLink className="w-3 h-3" /> abrir em nova aba
                        </a>
                      </div>
                    ) : (
                      <button onClick={() => abrirModalUpload("final")} className="w-full flex items-center justify-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-semibold py-3 rounded-xl text-sm">
                        <Send className="w-4 h-4" /> Enviar para aprovação
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Briefing */}
              <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">Briefing</p>
                <InlineEdit
                  value={demanda.descricao ?? ""}
                  canEdit={podeEditar}
                  tipo="textarea"
                  placeholder="Adicionar briefing…"
                  onSave={(v) => salvarCampo({ descricao: v })}
                  display={<BriefingResumido texto={demanda.descricao ?? ""} vazio={<span className="italic text-zinc-600 text-sm">Adicionar briefing…</span>} />}
                />
              </div>
            </>
          ) : (
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <InlineEdit
                  value={demanda.titulo ?? ""}
                  canEdit={podeEditar}
                  tipo="text"
                  placeholder="Sem título"
                  onSave={(v) => salvarCampo({ titulo: v })}
                  display={<span className="text-xl font-bold text-zinc-100 leading-tight">{demanda.titulo || "Sem título"}</span>}
                />
              </div>
              <StatusBadge status={demanda.statusInterno} isGrowth={isGrowth} />
            </div>

            <InlineEdit
              value={demanda.descricao ?? ""}
              canEdit={podeEditar}
              tipo="textarea"
              placeholder="Adicionar descrição / briefing…"
              onSave={(v) => salvarCampo({ descricao: v })}
              display={<BriefingResumido texto={demanda.descricao ?? ""} vazio={<span className="italic text-zinc-600 text-sm">Adicionar descrição / briefing…</span>} />}
            />

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="flex items-center gap-2 text-zinc-400">
                <Video className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-500">Tipo:</span>
                <span className="font-medium text-zinc-200">{demanda.tipoVideo}</span>
              </div>
              {demanda.formato && (
                <div className="flex items-center gap-2 text-zinc-400">
                  <Film className="w-4 h-4 text-zinc-500" />
                  <span className="text-zinc-500">Formato:</span>
                  <span className="font-medium text-zinc-200">
                    {demanda.formato}
                    <span className="ml-1 text-zinc-500">
                      {demanda.formato === "9:16" ? "vertical" : demanda.formato === "16:9" ? "horizontal" : ""}
                    </span>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-zinc-400">
                <User className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-500">Departamento:</span>
                <span className="font-medium text-zinc-200 capitalize">{demanda.departamento}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-500">Cidade:</span>
                <InlineEdit
                  value={demanda.cidade ?? ""}
                  canEdit={podeEditar}
                  tipo="text"
                  placeholder="—"
                  onSave={(v) => salvarCampo({ cidade: v })}
                  display={<span className="font-medium text-zinc-200">{demanda.cidade || "—"}</span>}
                />
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
          )}

          {isGrowth && demanda.detalhesEntrega && Object.keys(demanda.detalhesEntrega).length > 0 && (
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
              <h2 className="font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" /> Detalhes do Criativo
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(demanda.detalhesEntrega)
                  .filter(([, value]) => value !== null && value !== undefined && value !== "")
                  .map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-950/30 px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        {formatDetailLabel(key)}
                      </p>
                      <p className="mt-1 text-sm text-zinc-300 whitespace-pre-wrap break-words">
                        {formatDetailValue(value)}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ── Banner: Demanda externa aguardando aprovação interna ─────── */}
          {demanda.statusInterno === "aguardando_aprovacao_interna" && !editMode && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                <span className="text-lg">📥</span>
                Demanda externa aguardando aprovação
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Enviada por{" "}
                <strong className="text-zinc-300">
                  {demanda.solicitante?.nome ?? "solicitante externo"}
                </strong>{" "}
                via formulário público. Revise os dados e aprove para entrar na fila de produção, ou recuse com um motivo.
              </p>
              {recusando && (
                <textarea
                  value={motivoRecusa}
                  onChange={e => setMotivoRecusa(e.target.value)}
                  placeholder="Motivo da recusa (será comunicado ao solicitante via WhatsApp)"
                  rows={2}
                  className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              )}
              <div className="flex gap-2 flex-wrap">
                {!recusando ? (
                  <>
                    <button
                      onClick={aprovarDemanda}
                      disabled={aprovandoDemanda}
                      className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Aprovar demanda
                    </button>
                    <button
                      onClick={() => setRecusando(true)}
                      className="flex items-center gap-1.5 border border-red-500/50 text-red-400 hover:bg-red-900/20 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" /> Recusar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={recusarDemanda}
                      disabled={aprovandoDemanda || !motivoRecusa.trim()}
                      className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <XCircle className="w-4 h-4" /> Confirmar Recusa
                    </button>
                    <button
                      onClick={() => { setRecusando(false); setMotivoRecusa("") }}
                      className="text-sm text-zinc-500 hover:text-zinc-300 px-2 transition-colors"
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Produto & Classificação ─────────────────────────────────── */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
            <h2 className="font-semibold text-zinc-300 mb-4 flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-400" /> Produto & Classificação
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Produto */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">
                  {editMode ? "Produto vinculado" : "Equipamentos / produtos"}
                </label>
                {editMode ? (
                  <select
                    disabled={!podeEditar}
                    value={produtoId}
                    onChange={e => setProdutoId(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">— Sem produto —</option>
                    {produtos.map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                ) : (
                  /* Vários equipamentos. O <select> único mandava um id só, e a rota
                     substitui o conjunto — os demais equipamentos eram apagados. */
                  <SelecaoChips
                    valores={produtosAtuais}
                    disabled={!podeEditar}
                    salvando={salvandoProdutos}
                    vazio="— Sem produto —"
                    rotuloAdicionar="+ Adicionar equipamento…"
                    opcoes={produtos.map(p => ({ value: p.id, label: p.nome }))}
                    onChange={async (novos) => {
                      setSalvandoProdutos(true)
                      try {
                        const r = await fetch(`/api/demandas/${id}/produto`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ produtoIds: novos }),
                        })
                        if (!r.ok) throw await erroDaResposta(r, "Não foi possível vincular o equipamento.")
                        await mutate()
                      } catch (e) {
                        toast.error(mensagemDeErro(e, "Não foi possível vincular o equipamento."))
                      } finally {
                        setSalvandoProdutos(false)
                      }
                    }}
                  />
                )}
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
                  disabled={!podeEditar}
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
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
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
              <UserCheck className="w-4 h-4 text-purple-400" /> {copy.teamTitle}
            </h2>
            {isGrowth ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" /> {copy.responsibleLabel}
                  </p>
                  {/* Vários responsáveis. Antes era um <select> único que mandava
                      `responsavelId`; como setResponsaveis substitui a lista inteira,
                      abrir o card e tocar aqui reduzia 3 responsáveis a 1 sem avisar. */}
                  <SelecaoChips
                    valores={responsaveisAtuais}
                    disabled={!podeEditar}
                    salvando={salvandoResponsaveis}
                    vazio="— Sem responsável —"
                    rotuloAdicionar="+ Adicionar responsável…"
                    opcoes={(dataGrowthResponsaveis?.responsaveis ?? []).map((p) => ({
                      value: p.id,
                      label: p.label ?? `${p.nome}${p.tipo ? ` · ${p.tipo}` : ""}`,
                    }))}
                    onChange={async (novos) => {
                      setSalvandoResponsaveis(true)
                      try {
                        await salvarCampo({ responsavelIds: novos })
                      } catch (e) {
                        toast.error(mensagemDeErro(e, "Não foi possível salvar os responsáveis."))
                      } finally {
                        setSalvandoResponsaveis(false)
                      }
                    }}
                  />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" /> Linha / Projeto
                  </p>
                  <InlineEdit
                    value={demanda.linhaProjetoRef?.id ?? ""}
                    canEdit={podeEditar}
                    tipo="select"
                    options={[
                      { value: "", label: "— Sem linha/projeto —" },
                      ...(dataLinhasProjetos?.linhas ?? []).map((linha: { id: string; nome: string; ativo: boolean }) => ({
                        value: linha.id,
                        label: `${linha.nome}${linha.ativo ? "" : " · Inativa"}`,
                      })),
                    ]}
                    onSave={(value) => salvarCampo({ linhaProjetoId: value || null })}
                    display={
                      <span className={cn(
                        "block rounded-lg border bg-zinc-950/30 px-3 py-2 min-h-10 text-sm font-medium",
                        demanda.linhaProjetoRef?.nome || demanda.linhaProjeto
                          ? "border-zinc-800 text-zinc-200"
                          : "border-dashed border-zinc-800 text-zinc-500"
                      )}>
                        {demanda.linhaProjetoRef?.nome ?? demanda.linhaProjeto ?? "— Sem linha/projeto —"}
                      </span>
                    }
                  />
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Videomaker */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5 flex items-center gap-1">
                  <Clapperboard className="w-3.5 h-3.5" /> Videomaker (Captação)
                </label>
                <select
                  disabled={!podeEditar}
                  value={editMode ? videomakerId : (demanda.videomaker ? `vm:${demanda.videomaker.id}` : "")}
                  onChange={e => {
                    if (editMode) {
                      setVideomakerId(e.target.value)
                    } else {
                      atribuirRapido("videomakerId", e.target.value)
                    }
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">— Sem videomaker —</option>
                  {opcoesCaptacao.filter(o => o.tipoContrato === "externo").length > 0 && (
                    <optgroup label="Externos (freelance)">
                      {opcoesCaptacao.filter(o => o.tipoContrato === "externo").map(o => (
                        <option key={o.value} value={o.value}>{o.label}{o.subtitle ? ` · ${o.subtitle}` : ""}</option>
                      ))}
                    </optgroup>
                  )}
                  {opcoesCaptacao.filter(o => o.tipoContrato !== "externo").length > 0 && (
                    <optgroup label="Internos / Social">
                      {opcoesCaptacao.filter(o => o.tipoContrato !== "externo").map(o => (
                        <option key={o.value} value={o.value}>{o.label}{o.subtitle ? ` · ${o.subtitle}` : ""}{o.origem === "user" ? " 📱" : o.origem === "ed" ? " ✂️" : ""}</option>
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
                  disabled={!podeEditar}
                  value={editMode ? editorId : (demanda.editor ? `ed:${demanda.editor.id}` : "")}
                  onChange={e => {
                    if (editMode) {
                      setEditorId(e.target.value)
                    } else {
                      atribuirRapido("editorId", e.target.value)
                    }
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">— Sem editor —</option>
                  {opcoesEdicao.filter(o => o.tipoContrato === "interno").length > 0 && (
                    <optgroup label="Internos (equipe)">
                      {opcoesEdicao.filter(o => o.tipoContrato === "interno").map(o => (
                        <option key={o.value} value={o.value}>{o.label}{o.subtitle ? ` · ${o.subtitle}` : ""}{o.origem === "user" ? " 📱" : ""}</option>
                      ))}
                    </optgroup>
                  )}
                  {opcoesEdicao.filter(o => o.tipoContrato !== "interno").length > 0 && (
                    <optgroup label="Externos (freelance)">
                      {opcoesEdicao.filter(o => o.tipoContrato !== "interno").map(o => (
                        <option key={o.value} value={o.value}>{o.label}{o.subtitle ? ` · ${o.subtitle}` : ""}{o.origem === "vm" ? " 📷" : ""}</option>
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
            )}
          </div>

          {/* ── Banner de confirmação de cobertura ──────────────────────── */}
          {!isGrowth && demanda.statusInterno === "videomaker_notificado" && demanda.videomaker && !editMode && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                <span className="text-lg">⏳</span>
                Aguardando confirmação de <strong>{demanda.videomaker.nome}</strong> via WhatsApp
              </p>
              <p className="text-xs text-zinc-400">A mensagem foi enviada com local, data e condições de pagamento. Confirme aqui quando o videomaker responder.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => confirmarVideomaker(true)}
                  disabled={confirmandoVM}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" /> Confirmou (SIM)
                </button>
                <button
                  onClick={() => confirmarVideomaker(false)}
                  disabled={confirmandoVM}
                  className="flex items-center gap-1.5 bg-red-600/80 hover:bg-red-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  <X className="w-4 h-4" /> Recusou (NÃO)
                </button>
              </div>
            </div>
          )}

          {/* ── Links ────────────────────────────────────────────────────── */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
            <h2 className="font-semibold text-zinc-300 mb-4 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-purple-400" /> {copy.productionTitle}
            </h2>
            <div className="space-y-3">
              {/* Brutos — apenas URL (Drive), sem upload de arquivo */}
              <div>
                <LinkField
                  label={copy.rawLabel}
                  value={editMode ? linkBrutos : (demanda.linkBrutos ?? "")}
                  editMode={editMode}
                  onChange={setLinkBrutos}
                />
                {!editMode && demanda.linkBrutos && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      onClick={() => deleteVideoLink("brutos")}
                      className="flex items-center gap-1 text-xs text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Remover
                    </button>
                  </div>
                )}
                {/* Quick Brutos — botão rápido sem entrar em editMode */}
                {!editMode && !demanda.linkBrutos && (
                  <div className="mt-1.5">
                    {!showQuickBrutos ? (
                      <button
                        onClick={() => setShowQuickBrutos(true)}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-purple-400 transition-colors"
                      >
                        <Upload className="w-3 h-3" /> {copy.addRaw}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="url"
                          value={quickBrutosInput}
                          onChange={e => setQuickBrutosInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && salvarQuickBrutos()}
                          placeholder="https://drive.google.com/..."
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                          autoFocus
                        />
                        <button onClick={salvarQuickBrutos} disabled={savingBrutos || !quickBrutosInput.trim()}
                          className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-1.5 rounded-lg disabled:opacity-50">
                          {savingBrutos ? "..." : "Salvar"}
                        </button>
                        <button onClick={() => { setShowQuickBrutos(false); setQuickBrutosInput("") }}
                          className="text-zinc-500 hover:text-zinc-300"><X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Vídeos Finais — lista multi-vídeo */}
              <div>
                {editMode ? (
                  <LinkField
                    label={copy.finalEditLabel}
                    value={linkFinal}
                    editMode={true}
                    onChange={setLinkFinal}
                  />
                ) : (
                  <div>
                    {/* Header com contador */}
                    {(() => {
                      const videosFinais: ArquivoVideo[] = (demanda.arquivos ?? []).filter(
                        (a: ArquivoVideo) => a.tipoArquivo === "final"
                      )
                      // Fallback: demandas antigas com linkFinal mas sem registros Arquivo
                      const temArquivos = videosFinais.length > 0
                      const temLinkLegado = !temArquivos && !!demanda.linkFinal

                      return (
                        <>
                          <p className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-2">
                            {isGrowth ? "🎨" : "🎬"} {copy.finalLabel}
                            {videosFinais.length > 0 && (
                              <span className="bg-purple-600/20 text-purple-300 border border-purple-600/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {videosFinais.length}
                              </span>
                            )}
                          </p>

                          {/* Lista de vídeos */}
                          {temArquivos && (
                            <div className="space-y-1.5 mb-2">
                              {videosFinais.map((arq: ArquivoVideo) => (
                                <div key={arq.id} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-2.5 py-2 border border-zinc-700/40">
                                  <span className="text-[10px] font-mono font-bold text-purple-400 bg-purple-600/10 border border-purple-600/20 rounded px-1.5 py-0.5 shrink-0">
                                    {String(arq.sequencia ?? 0).padStart(3, "0")}
                                  </span>
                                  <span className={cn(
                                    "text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded-full border",
                                    arq.url.includes("drive.google.com")
                                      ? "bg-blue-900/40 text-blue-300 border-blue-700/40"
                                      : "bg-zinc-700/60 text-zinc-400 border-zinc-600/40"
                                  )}>
                                    {arq.url.includes("drive.google.com") ? "☁️ Drive" : "🗄 Supabase"}
                                  </span>
                                  <span className="text-xs text-zinc-400 truncate flex-1 min-w-0" title={arq.url}>
                                    {arq.url.includes("drive.google.com") ? "Google Drive" : arq.nomeArquivo}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => setPlayerUrl(arq.url)} title={copy.viewAction}
                                      className="p-1 text-zinc-500 hover:text-purple-400 transition-colors">
                                      <Play className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => {navigator.clipboard.writeText(arq.url); toast.success("Link copiado!")}}
                                      title="Copiar link" className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => deleteVideoLink("final", arq.id)} title="Remover"
                                      className="p-1 text-zinc-600 hover:text-red-400 transition-colors">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Fallback legado: linkFinal sem registro Arquivo */}
                          {temLinkLegado && (
                            <div className="flex items-center gap-2 mb-2">
                              <button onClick={() => setPlayerUrl(demanda.linkFinal!)}
                                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-purple-400 transition-colors">
                                <Play className="w-3 h-3" /> {copy.viewAction}
                              </button>
                              <button onClick={() => deleteVideoLink("final")}
                                className="flex items-center gap-1 text-xs text-zinc-600 hover:text-red-400 transition-colors">
                                <Trash2 className="w-3 h-3" /> Remover
                              </button>
                            </div>
                          )}

                          {/* Botão de enviar (sempre visível) */}
                          <button
                            onClick={() => abrirModalUpload("final")}
                            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors w-full justify-center"
                          >
                            <Send className="w-4 h-4" />
                            {videosFinais.length > 0 ? copy.addFinalButton : copy.sendApprovalButton}
                          </button>
                          <p className="text-[11px] text-zinc-600 text-center mt-1">
                            {videosFinais.length > 0
                              ? `${videosFinais.length} ${copy.finalCountLabel} → aprovação gera link individual`
                              : copy.progressHint}
                          </p>
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
              {demanda.referencia && demanda.referencia.split("\n").filter(Boolean).map((url: string, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-36 shrink-0">{i === 0 ? "📌 Referência" : ""}</span>
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:underline flex items-center gap-1 truncate">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" /> {url}
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* ── Documentos Anexados ─────────────────────────────────────── */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-zinc-300 flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" /> Documentos
                {(() => {
                  const docs = (demanda.arquivos ?? []).filter((a: ArquivoVideo) => a.tipoArquivo === "documento")
                  return docs.length > 0 ? (
                    <span className="bg-sky-600/20 text-sky-300 border border-sky-600/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {docs.length}
                    </span>
                  ) : null
                })()}
              </h2>
              <button
                onClick={() => fileRefDoc.current?.click()}
                disabled={uploadingDoc}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 border border-sky-600/30 font-medium transition-colors disabled:opacity-50"
              >
                {uploadingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploadingDoc ? `${docUploadProgress}%` : "Anexar"}
              </button>
              <input
                ref={fileRefDoc}
                type="file"
                className="hidden"
                accept={ACCEPT_DOCUMENTOS}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadDocumento(f); e.target.value = "" } }}
              />
            </div>
            {(() => {
              const docs: ArquivoVideo[] = (demanda.arquivos ?? []).filter((a: ArquivoVideo) => a.tipoArquivo === "documento")
              if (docs.length === 0) {
                return (
                  <p className="text-xs text-zinc-600 text-center py-3">
                    Nenhum anexo. Clique em &quot;Anexar&quot; para adicionar PDF, Word, Excel ou imagem (PNG, JPEG) — até 25 MB cada.
                  </p>
                )
              }
              return (
                <div className="space-y-2">
                  {docs.map((arq: ArquivoVideo) => {
                    const ext = arq.nomeArquivo.split(".").pop()?.toUpperCase() ?? "?"
                    const extColor: Record<string, string> = {
                      PDF: "text-red-400 bg-red-900/30 border-red-700/40",
                      DOC: "text-blue-400 bg-blue-900/30 border-blue-700/40",
                      DOCX: "text-blue-400 bg-blue-900/30 border-blue-700/40",
                      XLS: "text-green-400 bg-green-900/30 border-green-700/40",
                      XLSX: "text-green-400 bg-green-900/30 border-green-700/40",
                      PPT: "text-orange-400 bg-orange-900/30 border-orange-700/40",
                      PPTX: "text-orange-400 bg-orange-900/30 border-orange-700/40",
                    }
                    const colorClass = extColor[ext] ?? "text-zinc-400 bg-zinc-800/60 border-zinc-600/40"
                    return (
                      <div key={arq.id} className="flex items-center gap-2.5 bg-zinc-800/50 rounded-lg px-3 py-2.5 border border-zinc-700/40">
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0", colorClass)}>
                          {ext}
                        </span>
                        <span className="text-sm text-zinc-300 truncate flex-1 min-w-0" title={arq.nomeArquivo}>
                          {arq.nomeArquivo}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <a href={arq.url} target="_blank" rel="noopener noreferrer" title="Baixar"
                            className="p-1 text-zinc-500 hover:text-sky-400 transition-colors">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                          <button onClick={() => deletarDocumento(arq.id)} title="Remover"
                            className="p-1 text-zinc-600 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* ── Pastas de Cobertura ──────────────────────────────────────── */}
          {demanda.tipoVideo?.toLowerCase().includes("cobertura") && (
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
              <h2 className="font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-amber-400" /> Pastas de Cobertura
              </h2>
              <div className="space-y-3">
                {/* Material Bruto */}
                <div>
                  <p className="text-xs text-zinc-500 mb-1">📁 Material Bruto (Google Drive)</p>
                  {demanda.linkFolderBrutos && editingFolder !== "brutos" ? (
                    <div className="flex items-center gap-2">
                      <a href={demanda.linkFolderBrutos} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 truncate">
                        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" /> Abrir pasta
                      </a>
                      <button onClick={() => { setFolderBrutosInput(demanda.linkFolderBrutos ?? ""); setEditingFolder("brutos") }}
                        className="p-0.5 text-zinc-600 hover:text-zinc-300">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  ) : editingFolder === "brutos" ? (
                    <div className="flex items-center gap-2">
                      <input value={folderBrutosInput} onChange={e => setFolderBrutosInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") salvarFolder("linkFolderBrutos"); if (e.key === "Escape") setEditingFolder(null) }}
                        placeholder="https://drive.google.com/..."
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-amber-500"
                        autoFocus
                      />
                      <button onClick={() => salvarFolder("linkFolderBrutos")} disabled={savingFolder || !folderBrutosInput.trim()}
                        className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2 py-1.5 rounded disabled:opacity-50">
                        {savingFolder ? "..." : "Salvar"}
                      </button>
                      <button onClick={() => setEditingFolder(null)} className="text-zinc-500 hover:text-zinc-300">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setFolderBrutosInput(""); setEditingFolder("brutos") }}
                      className="text-xs text-zinc-500 hover:text-amber-400 transition-colors">
                      + Adicionar link da pasta
                    </button>
                  )}
                </div>

                {/* Material Pronto */}
                <div>
                  <p className="text-xs text-zinc-500 mb-1">📁 Material Pronto (Google Drive)</p>
                  {demanda.linkFolderFinal && editingFolder !== "final" ? (
                    <div className="flex items-center gap-2">
                      <a href={demanda.linkFolderFinal} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 truncate">
                        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" /> Abrir pasta
                      </a>
                      <button onClick={() => { setFolderFinalInput(demanda.linkFolderFinal ?? ""); setEditingFolder("final") }}
                        className="p-0.5 text-zinc-600 hover:text-zinc-300">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  ) : editingFolder === "final" ? (
                    <div className="flex items-center gap-2">
                      <input value={folderFinalInput} onChange={e => setFolderFinalInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") salvarFolder("linkFolderFinal"); if (e.key === "Escape") setEditingFolder(null) }}
                        placeholder="https://drive.google.com/..."
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-amber-500"
                        autoFocus
                      />
                      <button onClick={() => salvarFolder("linkFolderFinal")} disabled={savingFolder || !folderFinalInput.trim()}
                        className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2 py-1.5 rounded disabled:opacity-50">
                        {savingFolder ? "..." : "Salvar"}
                      </button>
                      <button onClick={() => setEditingFolder(null)} className="text-zinc-500 hover:text-zinc-300">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setFolderFinalInput(""); setEditingFolder("final") }}
                      className="text-xs text-zinc-500 hover:text-amber-400 transition-colors">
                      + Adicionar link da pasta
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Converter em Evento ──────────────────────────────────────── */}
          {demanda.tipoVideo?.toLowerCase().includes("cobertura") && (
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
              <h2 className="font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                <CalendarRange className="w-4 h-4 text-purple-400" /> Evento de Cobertura
              </h2>
              {demanda.coberturaId ? (
                /* Já vinculado */
                <div className="flex items-center justify-between bg-purple-600/10 border border-purple-600/20 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-purple-300 font-medium">Evento criado</span>
                  </div>
                  <Link
                    href={`/coberturas/${demanda.coberturaId}`}
                    className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    Abrir Evento <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
              ) : (
                /* Ainda não convertida */
                <div>
                  <p className="text-xs text-zinc-500 mb-3">
                    Converta esta demanda em um Evento de Cobertura para gerenciar uploads por dia, checklist de equipamentos e relatório de produção.
                  </p>
                  <button
                    onClick={converterEmEvento}
                    disabled={convertendoEvento}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {convertendoEvento
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Criando evento...</>
                      : <><CalendarRange className="w-3.5 h-3.5" /> Converter em Evento</>
                    }
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Checklist ─────────────────────────────────────────────────── */}
          <ChecklistSection demandaId={id as string} />

          {/* ── Comentários ──────────────────────────────────────────────── */}
          {/* Extraído para componente próprio. A versão anterior lia `c.texto`,
              campo que não existe no modelo (é `comentario`) — os comentários
              apareciam em branco, o que ajuda a explicar as zero utilizações em
              produção. */}
          <Comentarios
            demandaId={id}
            comentarios={demanda.comentarios ?? []}
            onEnviado={() => mutate()}
          />
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
                <InlineEdit
                  value={demanda.dataLimite ? demanda.dataLimite.split("T")[0] : ""}
                  canEdit={podeEditar}
                  tipo="date"
                  placeholder="—"
                  onSave={(v) => salvarCampo({ dataLimite: v || null })}
                  display={demanda.dataLimite
                    ? <span className={cn("font-medium", new Date(demanda.dataLimite) < new Date() ? "text-red-400" : "text-zinc-200")}>{format(new Date(demanda.dataLimite), "dd/MM/yyyy", { locale: ptBR })}</span>
                    : <span className="text-zinc-600 text-xs">—</span>}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1"><Clapperboard className="w-3.5 h-3.5" /> {copy.dateCaptureLabel}</span>
                <InlineEdit
                  value={demanda.dataCaptacao ? demanda.dataCaptacao.split("T")[0] : ""}
                  canEdit={podeEditar}
                  tipo="date"
                  placeholder="—"
                  onSave={(v) => salvarCampo({ dataCaptacao: v || null })}
                  display={demanda.dataCaptacao
                    ? <span className="font-medium text-zinc-200">{format(new Date(demanda.dataCaptacao), "dd/MM/yyyy", { locale: ptBR })}</span>
                    : <span className="text-zinc-600 text-xs">—</span>}
                />
              </div>
            </div>
          </div>

          {/* Aprovação — no Growth fica no hero (topo). Aqui só audiovisual. */}
          {!isGrowth && (
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <h2 className="font-semibold text-zinc-300 mb-3">{copy.approvalTitle}</h2>
            {demanda.linkCliente ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  <span className="text-xs text-green-400 truncate flex-1">{demanda.linkCliente}</span>
                  <button onClick={() => { navigator.clipboard.writeText(demanda.linkCliente); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}>
                    {copiado ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300" />}
                  </button>
                </div>
                {/* Ver o vídeo aqui dentro, sem sair para o link do cliente.
                    Quem acompanha a demanda precisa conferir o que foi enviado
                    para aprovação — antes só dava abrindo a página pública. */}
                <AvisoLinkExpirado
                  linkCliente={demanda.linkCliente}
                  expiresAt={demanda.aprovacoesVideo?.[0]?.expiresAt}
                  onRenovado={() => mutate()}
                />
                {demanda.linkFinal && (
                  <button
                    onClick={() => setPlayerUrl(demanda.linkFinal!)}
                    className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-sm font-medium py-2.5 rounded-lg transition-colors"
                  >
                    <Play className="w-4 h-4" /> Ver o vídeo enviado
                  </button>
                )}
                <Link href={demanda.linkCliente} target="_blank" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                  <ExternalLink className="w-3 h-3" /> Abrir a página que o cliente vê
                </Link>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Nenhum link gerado ainda.</p>
            )}
          </div>
          )}

          {/* Postagem */}
          {demanda.postagemTipo && (
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
              <h2 className="font-semibold text-zinc-300 mb-3">Postagem</h2>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Plataforma:</span>
                  <span className="text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded font-medium capitalize">
                    {demanda.postagemTipo}
                  </span>
                </div>
                {demanda.dataPostagem && (
                  <p className="text-xs text-zinc-500">
                    Postado em {format(new Date(demanda.dataPostagem), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
                {demanda.linkPostagem && (
                  <a href={demanda.linkPostagem} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                    <ExternalLink className="w-3 h-3" /> Ver postagem
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Análise IA rápida */}
          <IACard demandaId={id as string} />

          {/* Histórico */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-500" />
              <h2 className="font-semibold text-zinc-300">Histórico</h2>
            </div>
            <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
              {demanda.historicos?.map((h: { id: string; statusNovo: string; createdAt: string; origem: string; observacao?: string | null; usuario?: { nome: string } }) => {
                // Edição e troca de responsável não são status: entram no mesmo
                // histórico com um marcador próprio, e o que descreve o evento é a
                // observação ("Editou título e prazo"), não o rótulo de coluna.
                const ehEvento = h.statusNovo === EVENTO_EDICAO || h.statusNovo === EVENTO_RESPONSAVEL
                return (
                <div key={h.id} className="flex items-start gap-2">
                  <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0",
                    ehEvento ? "bg-zinc-500" : "bg-purple-400")} />
                  <div>
                    <p className="text-xs font-medium text-zinc-300">
                      {ehEvento ? (h.observacao ?? "Editou a demanda") : statusLabel(h.statusNovo, isGrowth)}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {format(new Date(h.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                      {h.usuario ? ` · ${h.usuario.nome}` : ` · ${h.origem}`}
                    </p>
                  </div>
                </div>
                )
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Modal gerar link de aprovação (upload ou URL) */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-semibold text-zinc-200 mb-1">
              {linkModalTipo === "brutos" ? copy.rawUploadModalTitle : copy.uploadModalTitle}
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              {linkModalTipo === "brutos"
                ? copy.rawUploadModalDescription
                : copy.uploadModalDescription}
            </p>

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
                  onClick={() => { setShowLinkModal(false); setLinkGerado(""); setUrlVideoInput(""); setLinkModalFile(null); setLinkModalTipo("final") }}
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
                  accept={copy.fileAccept}
                  className="hidden"
                  onChange={e => setLinkModalFile(e.target.files?.[0] ?? null)}
                />
                {linkModalFile ? (
                  <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2">
                    {isGrowth ? <FileText className="w-4 h-4 text-purple-400 shrink-0" /> : <Film className="w-4 h-4 text-purple-400 shrink-0" />}
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
                    {linkModalTipo === "final"
                      ? <span className="text-[11px] text-emerald-600">{copy.uploadFormat}</span>
                      : <span className="text-[11px] text-zinc-600">{isGrowth ? copy.uploadFormat : "mp4, mov, avi, webm · máx 49 MB"}</span>
                    }
                  </button>
                )}
                {/* Barra de progresso do upload Drive */}
                {gerandoLink && linkModalTipo === "final" && uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>Enviando para o Google Drive…</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={gerarLinkAprovacao}
                    disabled={gerandoLink || !linkModalFile}
                    className="flex-1 flex items-center justify-center gap-2 bg-purple-600 text-white text-sm py-2 rounded-xl hover:bg-purple-500 disabled:opacity-50 font-medium"
                  >
                    {gerandoLink
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {linkModalTipo === "final" && uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%…` : "Enviando…"}</>
                      : linkModalTipo === "brutos"
                        ? <><Upload className="w-3.5 h-3.5" /> {isGrowth ? "Enviar Materiais" : "Enviar Brutos"}</>
                        : <><Send className="w-3.5 h-3.5" /> {isGrowth ? "Enviar Criativo" : "Enviar para Aprovação"}</>
                    }
                  </button>
                  <button onClick={() => { setShowLinkModal(false); setLinkModalFile(null); setLinkModalTipo("final"); setUploadProgress(0) }} className="px-3 border border-zinc-700 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800">
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
                    {gerandoLink
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</>
                      : linkModalTipo === "brutos"
                        ? <><Upload className="w-3.5 h-3.5" /> {isGrowth ? "Salvar URL dos materiais" : "Salvar URL Brutos"}</>
                        : <><Link2 className="w-3.5 h-3.5" /> Gerar Link</>
                    }
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

      {/* ── Player de vídeo ─────────────────────────────────────────────── */}
      {playerUrl && (() => {
        const { type, embedUrl } = getEmbedUrl(playerUrl)
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
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
              ) : type === "image" ? (
                <img src={embedUrl} alt={copy.finalSingleLabel} className="max-h-[80vh] w-full object-contain rounded-xl bg-black" />
              ) : type === "youtube" || type === "drive" ? (
                <iframe src={embedUrl} className="w-full aspect-video rounded-xl border-0" allowFullScreen />
              ) : (
                <div className="text-center text-white p-12 bg-zinc-900 rounded-xl">
                  <p className="mb-4 text-zinc-400">{copy.noInline}</p>
                  <a href={playerUrl} target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300 underline">
                    Abrir em nova aba →
                  </a>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </>
  )

  if (mode === "modal") {
    // Só fecha em clique direto no fundo. Antes qualquer clique que chegasse aqui
    // por bubbling fechava o modal — inclusive na margem em volta do card e na
    // barra de rolagem —, e quem estava editando um campo perdia o contexto no meio.
    return (
      <div
        className="fixed inset-0 z-[60] bg-black/70 overflow-y-auto"
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      >
        <div
          className="min-h-full w-full flex items-start justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
        >
          <div className="w-full max-w-6xl my-4 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-3.5 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-sm text-zinc-300">{demanda.codigo}</span>
                <StatusBadge status={demanda.statusInterno} isGrowth={isGrowth} />
              </div>
              <div className="flex items-center gap-2">
                {acoes}
                <button onClick={() => onClose?.()} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800" aria-label="Fechar">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {corpo}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Header title={demanda.codigo} actions={acoes} />
      {corpo}
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
      const text = await res.text()
      let json: { error?: string; sugestao?: string } = {}
      try { json = JSON.parse(text) } catch { /* not JSON */ }
      if (!res.ok) throw new Error(json.error ?? (text.slice(0, 200) || "Erro na análise IA"))
      setAnalise(json.sugestao ?? "Sem sugestão retornada.")
    } catch (e) {
      toast.error(mensagemDeErro(e))
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
function StatusBadge({ status, isGrowth = false }: { status: string; isGrowth?: boolean }) {
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
      {statusLabel(status, isGrowth)}
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
