"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { useParams, useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Header } from "@/components/layout/Header"
import {
  ArrowLeft, Calendar, Clock, ExternalLink, MessageCircle, Send, User,
  Video, Link2, CheckCircle2, Copy, Check, Pencil, Save, X,
  ChevronDown, AlertTriangle, Sparkles, UserCheck, Clapperboard, Film,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

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

const STATUS_PROXIMOS: Record<string, string[]> = {
  aguardando_triagem: ["planejamento", "urgencia_pendente_aprovacao", "encerrado"],
  aguardando_aprovacao_interna: ["planejamento", "encerrado"],
  planejamento: ["videomaker_notificado", "encerrado"],
  videomaker_notificado: ["videomaker_aceitou", "videomaker_recusou", "captacao_agendada"],
  videomaker_aceitou: ["captacao_agendada"],
  captacao_agendada: ["captacao_realizada"],
  captacao_realizada: ["brutos_enviados"],
  brutos_enviados: ["fila_edicao", "editor_atribuido"],
  editor_atribuido: ["fila_edicao"],
  fila_edicao: ["editando"],
  editando: ["edicao_finalizada"],
  edicao_finalizada: ["revisao_pendente", "aguardando_aprovacao_cliente"],
  revisao_pendente: ["aprovado_cliente", "reprovado_cliente"],
  aguardando_aprovacao_cliente: ["aprovado_cliente", "reprovado_cliente"],
  aprovado_cliente: ["postagem_pendente", "entregue_cliente"],
  reprovado_cliente: ["editando"],
  postagem_pendente: ["postado"],
  postado: ["entregue_cliente", "encerrado"],
}

interface Videomaker { id: string; nome: string; cidade?: string; status: string }
interface Editor { id: string; nome: string; especialidade?: string; status: string }

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
  const [copiado, setCopiado] = useState(false)
  const [mudandoStatus, setMudandoStatus] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)

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

  // ── SWR ───────────────────────────────────────────────────────────────────
  const { data, mutate } = useSWR(`/api/demandas/${id}`, fetcher)
  const demanda = data?.demanda

  const { data: dataVMs } = useSWR<{ videomakers: Videomaker[] }>("/api/videomakers?status=ativo&limit=100", fetcher)
  const { data: dataEds } = useSWR<{ editores: Editor[] }>("/api/editores?status=ativo&limit=100", fetcher)
  const videomakers = dataVMs?.videomakers ?? []
  const editores = dataEds?.editores ?? []

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
    }
  }

  // ── Mudar status ──────────────────────────────────────────────────────────
  async function mudarStatus(novoStatus: string) {
    setMudandoStatus(true)
    setShowStatusMenu(false)
    try {
      const res = await fetch(`/api/demandas/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusInterno: novoStatus }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao mudar status")
      toast.success(`Status → ${STATUS_LABELS[novoStatus] ?? novoStatus}`)
      mutate()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setMudandoStatus(false)
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

  // ── Gerar link de aprovação ───────────────────────────────────────────────
  async function gerarLinkAprovacao() {
    if (!urlVideoInput.trim()) return
    setGerandoLink(true)
    try {
      const res = await fetch("/api/aprovacao-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandaId: id, urlVideo: urlVideoInput, expiresInDays: 7 }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setLinkGerado(json.link)
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

  const proximosStatus = STATUS_PROXIMOS[demanda.statusInterno] ?? []

  return (
    <>
      <Header
        title={demanda.codigo}
        actions={
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button onClick={cancelarEdicao} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 border border-zinc-300 px-3 py-1.5 rounded-lg">
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
                <button onClick={salvar} disabled={saving} className="flex items-center gap-1.5 text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> {saving ? "Salvando..." : "Salvar"}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 text-sm border border-zinc-300 text-zinc-700 px-3 py-1.5 rounded-lg hover:bg-zinc-50">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
                <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
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
          <div className="bg-white rounded-xl border p-6 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                {editMode ? (
                  <input
                    value={titulo}
                    onChange={e => setTitulo(e.target.value)}
                    className="w-full text-xl font-bold border-b-2 border-purple-300 focus:outline-none focus:border-purple-600 pb-1"
                  />
                ) : (
                  <h1 className="text-xl font-bold text-zinc-900 leading-tight">{demanda.titulo}</h1>
                )}
              </div>
              <StatusBadge status={demanda.statusInterno} />
            </div>

            {editMode ? (
              <textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                rows={3}
                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
              />
            ) : (
              <p className="text-sm text-zinc-600 leading-relaxed">{demanda.descricao}</p>
            )}

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="flex items-center gap-2 text-zinc-600">
                <Video className="w-4 h-4 text-zinc-400" />
                <span className="text-zinc-400">Tipo:</span>
                <span className="font-medium text-zinc-800">{demanda.tipoVideo}</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-600">
                <User className="w-4 h-4 text-zinc-400" />
                <span className="text-zinc-400">Departamento:</span>
                <span className="font-medium text-zinc-800 capitalize">{demanda.departamento}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-400" />
                <span className="text-zinc-400">Cidade:</span>
                {editMode ? (
                  <input value={cidade} onChange={e => setCidade(e.target.value)}
                    className="flex-1 border-b border-zinc-300 focus:outline-none focus:border-purple-500 text-sm px-1" />
                ) : (
                  <span className="font-medium text-zinc-800">{demanda.cidade || "—"}</span>
                )}
              </div>
              {editMode && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-zinc-400" />
                  <span className="text-zinc-400">Local de gravação:</span>
                  <input value={localGravacao} onChange={e => setLocalGravacao(e.target.value)}
                    className="flex-1 border-b border-zinc-300 focus:outline-none focus:border-purple-500 text-sm px-1" />
                </div>
              )}
            </div>
          </div>

          {/* ── Atribuição de equipe ─────────────────────────────────────── */}
          <div className="bg-white rounded-xl border p-5 shadow-sm">
            <h2 className="font-semibold text-zinc-700 mb-4 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-purple-600" /> Equipe da Demanda
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
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
                >
                  <option value="">— Sem videomaker —</option>
                  {videomakers.map(v => (
                    <option key={v.id} value={v.id}>{v.nome}{v.cidade ? ` (${v.cidade})` : ""}</option>
                  ))}
                </select>
                {demanda.videomaker && !editMode && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {demanda.videomaker.nome}
                    {demanda.videomaker.cidade ? ` · ${demanda.videomaker.cidade}` : ""}
                  </p>
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
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
                >
                  <option value="">— Sem editor —</option>
                  {editores.map(e => (
                    <option key={e.id} value={e.id}>{e.nome}{e.especialidade ? ` · ${e.especialidade}` : ""}</option>
                  ))}
                </select>
                {demanda.editor && !editMode && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {demanda.editor.nome}
                    {demanda.editor.especialidade ? ` · ${demanda.editor.especialidade}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Avançar status ───────────────────────────────────────────── */}
          {proximosStatus.length > 0 && (
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <h2 className="font-semibold text-zinc-700 mb-3 flex items-center gap-2">
                <ChevronDown className="w-4 h-4 text-purple-600" /> Avançar Status
              </h2>
              <div className="flex flex-wrap gap-2">
                {proximosStatus.map(s => (
                  <button
                    key={s}
                    onClick={() => mudarStatus(s)}
                    disabled={mudandoStatus}
                    className="flex items-center gap-1.5 text-sm border border-zinc-200 hover:border-purple-400 hover:bg-purple-50 text-zinc-700 hover:text-purple-700 px-3 py-2 rounded-lg transition-all disabled:opacity-50"
                  >
                    {STATUS_LABELS[s] ?? s}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-400 mt-2">Status atual: <span className="font-medium text-zinc-600">{STATUS_LABELS[demanda.statusInterno] ?? demanda.statusInterno}</span></p>
            </div>
          )}

          {/* ── Links ────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border p-5 shadow-sm">
            <h2 className="font-semibold text-zinc-700 mb-4 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-purple-600" /> Links da Produção
            </h2>
            <div className="space-y-3">
              <LinkField
                label="📁 Brutos (material bruto filmado)"
                value={editMode ? linkBrutos : (demanda.linkBrutos ?? "")}
                editMode={editMode}
                onChange={setLinkBrutos}
              />
              <LinkField
                label="🎬 Arquivo Final (vídeo editado)"
                value={editMode ? linkFinal : (demanda.linkFinal ?? "")}
                editMode={editMode}
                onChange={setLinkFinal}
              />
              {demanda.referencia && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-36 shrink-0">📌 Referência</span>
                  <a href={demanda.referencia} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1 truncate">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" /> {demanda.referencia}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ── Comentários ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-zinc-500" />
              <h2 className="font-semibold text-zinc-700">Comentários</h2>
            </div>
            <div className="divide-y max-h-64 overflow-y-auto">
              {demanda.comentarios?.length === 0 && (
                <p className="p-4 text-sm text-zinc-400 text-center">Nenhum comentário ainda</p>
              )}
              {demanda.comentarios?.map((c: { id: string; texto: string; createdAt: string; usuario?: { nome: string } }) => (
                <div key={c.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-800">{c.usuario?.nome ?? "Sistema"}</span>
                    <span className="text-xs text-zinc-400">
                      {format(new Date(c.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600">{c.texto}</p>
                </div>
              ))}
            </div>
            <div className="p-3 border-t flex gap-2">
              <input
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && enviarComentario()}
                placeholder="Adicionar comentário..."
                className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-200"
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
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <h2 className="font-semibold text-zinc-700 mb-3">Solicitante</h2>
            {demanda.solicitante ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm">
                  {demanda.solicitante.nome.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-800">{demanda.solicitante.nome}</p>
                  <p className="text-xs text-zinc-400">{demanda.solicitante.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Não identificado</p>
            )}
          </div>

          {/* Datas */}
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <h2 className="font-semibold text-zinc-700 mb-3">Datas</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Criado</span>
                <span className="font-medium text-zinc-800">
                  {format(new Date(demanda.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Prazo</span>
                {editMode ? (
                  <input type="date" value={dataLimite} onChange={e => setDataLimite(e.target.value)}
                    className="border border-zinc-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-300" />
                ) : demanda.dataLimite ? (
                  <span className={cn("font-medium", new Date(demanda.dataLimite) < new Date() ? "text-red-600" : "text-zinc-800")}>
                    {format(new Date(demanda.dataLimite), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                ) : <span className="text-zinc-400 text-xs">—</span>}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1"><Clapperboard className="w-3.5 h-3.5" /> Captação</span>
                {editMode ? (
                  <input type="date" value={dataCaptacao} onChange={e => setDataCaptacao(e.target.value)}
                    className="border border-zinc-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-300" />
                ) : demanda.dataCaptacao ? (
                  <span className="font-medium text-zinc-800">
                    {format(new Date(demanda.dataCaptacao), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                ) : <span className="text-zinc-400 text-xs">—</span>}
              </div>
            </div>
          </div>

          {/* Aprovação de vídeo */}
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-zinc-700">Aprovação de Vídeo</h2>
              <button
                onClick={() => setShowLinkModal(true)}
                className="flex items-center gap-1 text-xs bg-zinc-900 text-white px-2.5 py-1.5 rounded-lg hover:bg-zinc-700"
              >
                <Link2 className="w-3.5 h-3.5" /> Gerar Link
              </button>
            </div>
            {demanda.linkCliente ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-xs text-green-700 truncate flex-1">{demanda.linkCliente}</span>
                  <button onClick={() => { navigator.clipboard.writeText(demanda.linkCliente); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}>
                    {copiado ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-700" />}
                  </button>
                </div>
                <Link href={demanda.linkCliente} target="_blank" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <ExternalLink className="w-3 h-3" /> Abrir player de aprovação
                </Link>
              </div>
            ) : (
              <p className="text-xs text-zinc-400">Nenhum link gerado ainda.</p>
            )}
          </div>

          {/* Análise IA rápida */}
          <IACard demandaId={id as string} />

          {/* Histórico */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-500" />
              <h2 className="font-semibold text-zinc-700">Histórico</h2>
            </div>
            <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
              {demanda.historicos?.map((h: { id: string; statusNovo: string; createdAt: string; origem: string; usuario?: { nome: string } }) => (
                <div key={h.id} className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-300 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-zinc-700">
                      {STATUS_LABELS[h.statusNovo] ?? h.statusNovo}
                    </p>
                    <p className="text-[10px] text-zinc-400">
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

      {/* Modal gerar link */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-semibold text-zinc-800 mb-1">Gerar Link de Aprovação</h3>
            <p className="text-sm text-zinc-500 mb-4">Cole o link do vídeo final (YouTube, Vimeo, Drive, MP4).</p>
            <input
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              placeholder="https://drive.google.com/... ou YouTube/Vimeo"
              value={urlVideoInput}
              onChange={e => setUrlVideoInput(e.target.value)}
            />
            {linkGerado ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                  <span className="text-xs text-green-700 truncate flex-1">{linkGerado}</span>
                  <button onClick={() => { navigator.clipboard.writeText(linkGerado); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}>
                    {copiado ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-zinc-400" />}
                  </button>
                </div>
                <button onClick={() => { setShowLinkModal(false); setLinkGerado(""); setUrlVideoInput("") }} className="w-full border border-zinc-200 text-sm py-2 rounded-xl hover:bg-zinc-50">Fechar</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={gerarLinkAprovacao} disabled={gerandoLink || !urlVideoInput} className="flex-1 bg-zinc-900 text-white text-sm py-2 rounded-xl hover:bg-zinc-700 disabled:opacity-50">
                  {gerandoLink ? "Gerando..." : "Gerar Link"}
                </button>
                <button onClick={() => setShowLinkModal(false)} className="flex-1 border border-zinc-200 text-sm py-2 rounded-xl hover:bg-zinc-50">Cancelar</button>
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
    <div className="bg-white rounded-xl border p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-zinc-700 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-purple-500" /> Análise IA
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
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
          <p className="text-xs text-purple-800 leading-relaxed">{analise}</p>
          <button onClick={() => setAnalise(null)} className="text-[10px] text-purple-500 hover:underline mt-2">Limpar</button>
        </div>
      ) : (
        <p className="text-xs text-zinc-400">Clique em &quot;Analisar&quot; para obter insights da IA sobre esta demanda.</p>
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
      isUrgente && "bg-red-100 text-red-700",
      isConcluido && "bg-green-100 text-green-700",
      isAtencao && "bg-orange-100 text-orange-700",
      !isUrgente && !isConcluido && !isAtencao && "bg-zinc-100 text-zinc-600"
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
          className="flex-1 text-sm border border-zinc-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
      ) : value ? (
        <a href={value} target="_blank" rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline flex items-center gap-1 truncate max-w-[200px]">
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{value}</span>
        </a>
      ) : (
        <span className="text-sm text-zinc-300 italic">Não preenchido</span>
      )}
    </div>
  )
}
