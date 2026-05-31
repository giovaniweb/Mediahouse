"use client"

import { useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import Link from "next/link"
import {
  ArrowLeft, CalendarRange, Users, CheckSquare, Upload, BarChart2, MapPin, Clock,
  Plus, Check, Loader2, ExternalLink, Trash2, Copy, QrCode, Play, Download,
  User, ChevronRight, X, AlertCircle
} from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Membro = {
  id: string
  nome: string
  funcao: string
  diariasTotal: number
  diariasEfetuadas: number
  valorDiaria: number | null
  videomaker: { id: string; nome: string; cidade: string | null } | null
  _count: { uploads: number }
}

type ChecklistItem = {
  id: string
  dia: number
  texto: string
  categoria: string
  concluido: boolean
  concluidoEm: string | null
}

type UploadItem = {
  id: string
  dia: number
  tipo: string
  momento: string
  titulo: string | null
  url: string
  thumbnailUrl: string | null
  duracao: number | null
  membro: { id: string; nome: string; funcao: string } | null
}

type Cobertura = {
  id: string
  titulo: string
  slug: string
  tipo: string
  status: string
  descricao: string | null
  cliente: string | null
  local: string | null
  cidade: string | null
  dataInicio: string
  dataFim: string
  totalDias: number
  diasAtivos: number
  linkDrive: string | null
  linkDownloadPublico: boolean
  senhaDownload: string | null
  produto: { id: string; nome: string } | null
  equipe: Membro[]
  checklist: ChecklistItem[]
  uploads: UploadItem[]
}

type RelatorioConteudo = {
  resumo_executivo?: string
  performance_equipe?: { nome: string; funcao: string; uploads_realizados: number; avaliacao: string; pontos_fortes: string }[]
  destaques_por_dia?: { dia: number; destaque: string; volume: number; melhoria: string }[]
  recomendacoes?: string[]
  score_producao?: number
  pontos_atencao?: string[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const TIPO_LABEL: Record<string, string> = {
  congresso: "Congresso", feira: "Feira", evento_corporativo: "Corporativo",
  show: "Show", lancamento: "Lançamento", outro: "Outro",
}
const MOMENTO_LABEL: Record<string, string> = {
  abertura: "Abertura", palestra: "Palestra", workshop: "Workshop",
  coquetel: "Coquetel", exposicao: "Exposição", bastidores: "Bastidores",
  encerramento: "Encerramento", outro: "Outro",
}
const FUNCAO_LABEL: Record<string, string> = {
  captacao: "Captação", edicao: "Edição", fotografia: "Fotografia",
  drone: "Drone", suporte: "Suporte", social_media: "Social Media",
}
const STATUS_STYLE: Record<string, string> = {
  planejamento: "bg-zinc-700 text-zinc-300",
  em_andamento: "bg-blue-900/60 text-blue-300",
  concluido: "bg-emerald-900/60 text-emerald-300",
  cancelado: "bg-red-900/40 text-red-400",
}

type Tab = "visao" | "equipe" | "checklist" | "uploads" | "relatorio"

function captureVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    const url = URL.createObjectURL(file)
    video.src = url
    video.muted = true
    video.preload = "metadata"
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 2) * 0.1)
    }
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = 320
        canvas.height = 180
        canvas.getContext("2d")?.drawImage(video, 0, 0, 320, 180)
        canvas.toBlob(
          (blob) => { URL.revokeObjectURL(url); resolve(blob) },
          "image/jpeg", 0.8
        )
      } catch { URL.revokeObjectURL(url); resolve(null) }
    }
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
  })
}

export default function EventoDetailPage() {
  const params = useParams()
  const router = useRouter()
  const coberturaId = params.id as string

  const [tab, setTab] = useState<Tab>("visao")
  const [diaChecklist, setDiaChecklist] = useState(1)
  const [diaUploads, setDiaUploads] = useState<number | "">("")
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)
  const [relatorioConteudo, setRelatorioConteudo] = useState<RelatorioConteudo | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [diaUploadFile, setDiaUploadFile] = useState(1)
  const [showQR, setShowQR] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data, mutate } = useSWR<{ cobertura: Cobertura }>(
    `/api/coberturas/${coberturaId}`,
    fetcher
  )
  const cobertura = data?.cobertura

  // Checklist grouped por categoria para dia selecionado
  const checklistDia = cobertura?.checklist.filter((c) => c.dia === diaChecklist) ?? []
  const checklistPct =
    checklistDia.length > 0
      ? Math.round((checklistDia.filter((c) => c.concluido).length / checklistDia.length) * 100)
      : 0

  // Uploads filtrados
  const uploadsFiltrados = cobertura?.uploads.filter(
    (u) => !diaUploads || u.dia === diaUploads
  ) ?? []

  const publicUrl = typeof window !== "undefined"
    ? `${window.location.origin}/e/${cobertura?.slug}`
    : ""

  const toggleChecklist = async (itemId: string, concluido: boolean) => {
    await fetch(`/api/coberturas/${coberturaId}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, concluido }),
    })
    mutate()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !cobertura) return
    e.target.value = ""

    setUploading(true)
    setUploadProgress(0)

    try {
      // 1. Capturar thumbnail
      let thumbnailUrl: string | null = null
      if (file.type.startsWith("video/")) {
        const thumbBlob = await captureVideoThumbnail(file)
        if (thumbBlob) {
          const thumbRes = await fetch(
            `/api/coberturas/${coberturaId}/uploads/upload-url?tipo=thumbnail&contentType=image%2Fjpeg&dia=${diaUploadFile}`
          )
          if (thumbRes.ok) {
            const { uploadUrl, publicUrl: pubUrl } = await thumbRes.json()
            await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: thumbBlob })
            thumbnailUrl = pubUrl
          }
        }
      }

      // 2. Upload do arquivo
      const urlRes = await fetch(
        `/api/coberturas/${coberturaId}/uploads/upload-url?tipo=video&contentType=${encodeURIComponent(file.type || "video/mp4")}&dia=${diaUploadFile}`
      )
      if (!urlRes.ok) throw new Error("Erro ao gerar URL de upload")
      const { uploadUrl, publicUrl: pubUrl } = await urlRes.json()

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error("Falha na conexão"))
        xhr.open("PUT", uploadUrl)
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4")
        xhr.send(file)
      })

      // 3. Registrar upload
      await fetch(`/api/coberturas/${coberturaId}/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: pubUrl,
          thumbnailUrl,
          dia: diaUploadFile,
          tipo: file.type.startsWith("image/") ? "foto" : "video",
          titulo: file.name.replace(/\.[^.]+$/, ""),
          tamanhoBytes: file.size,
        }),
      })

      toast.success("Upload realizado com sucesso!")
      mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload")
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const deleteUpload = async (uploadId: string) => {
    if (!confirm("Remover este upload?")) return
    await fetch(`/api/coberturas/${coberturaId}/uploads?uploadId=${uploadId}`, { method: "DELETE" })
    toast.success("Upload removido")
    mutate()
  }

  const gerarRelatorio = async () => {
    setGerandoRelatorio(true)
    setRelatorioConteudo(null)
    try {
      const res = await fetch(`/api/coberturas/${coberturaId}/relatorio`, { method: "POST" })
      const text = await res.text()
      let json: { conteudo?: RelatorioConteudo; error?: string } = {}
      try { json = JSON.parse(text) } catch { /**/ }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setRelatorioConteudo(json.conteudo ?? null)
      toast.success("Relatório gerado com sucesso!")
      setTab("relatorio")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar relatório")
    } finally {
      setGerandoRelatorio(false)
    }
  }

  const toggleLinkPublico = async () => {
    await fetch(`/api/coberturas/${coberturaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkDownloadPublico: !cobertura?.linkDownloadPublico }),
    })
    mutate()
  }

  if (!cobertura) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "visao", label: "Visão Geral", icon: CalendarRange },
    { id: "equipe", label: "Equipe", icon: Users },
    { id: "checklist", label: "Checklist", icon: CheckSquare },
    { id: "uploads", label: "Uploads", icon: Upload },
    { id: "relatorio", label: "Relatório IA", icon: BarChart2 },
  ]

  const diaOptions = Array.from({ length: cobertura.totalDias }, (_, i) => i + 1)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push("/eventos")} className="text-zinc-500 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_STYLE[cobertura.status])}>
              {cobertura.status.replace("_", " ")}
            </span>
            <span className="text-[10px] text-zinc-500">{TIPO_LABEL[cobertura.tipo]}</span>
          </div>
          <h1 className="text-lg font-bold text-white truncate">{cobertura.titulo}</h1>
        </div>
        <button
          onClick={gerarRelatorio}
          disabled={gerandoRelatorio}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {gerandoRelatorio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart2 className="w-3.5 h-3.5" />}
          Relatório IA
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "Equipe", value: cobertura.equipe.length, icon: Users, color: "text-blue-400" },
          { label: "Uploads", value: cobertura.uploads.length, icon: Upload, color: "text-purple-400" },
          { label: "Dias", value: `${cobertura.totalDias}d`, icon: Clock, color: "text-emerald-400" },
          { label: "Checklist", value: `${checklistPct}%`, icon: CheckSquare, color: "text-amber-400" },
        ].map((k) => (
          <div key={k.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <k.icon className={cn("w-3.5 h-3.5", k.color)} />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{k.label}</span>
            </div>
            <p className="text-lg font-bold text-white">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-5 border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-purple-500 text-white font-medium"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Visão Geral */}
      {tab === "visao" && (
        <div className="space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Informações</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Cliente", cobertura.cliente],
                ["Local", cobertura.local],
                ["Cidade", cobertura.cidade],
                ["Produto", cobertura.produto?.nome],
              ].map(([k, v]) => v ? (
                <div key={k as string}>
                  <p className="text-xs text-zinc-500">{k}</p>
                  <p className="text-zinc-200">{v}</p>
                </div>
              ) : null)}
              <div>
                <p className="text-xs text-zinc-500">Período</p>
                <p className="text-zinc-200">
                  {new Date(cobertura.dataInicio).toLocaleDateString("pt-BR")} até{" "}
                  {new Date(cobertura.dataFim).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>
            {cobertura.descricao && (
              <p className="text-sm text-zinc-400 whitespace-pre-wrap">{cobertura.descricao}</p>
            )}
            {cobertura.linkDrive && (
              <a
                href={cobertura.linkDrive}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Pasta no Google Drive
              </a>
            )}
          </div>

          {/* Link Público */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Link de Download Público</h3>
              <button
                onClick={toggleLinkPublico}
                className={cn(
                  "text-xs px-3 py-1 rounded-full transition-colors",
                  cobertura.linkDownloadPublico
                    ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50"
                    : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                )}
              >
                {cobertura.linkDownloadPublico ? "Ativo" : "Inativo"}
              </button>
            </div>
            {cobertura.linkDownloadPublico && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
                  <span className="text-xs text-zinc-300 truncate flex-1 font-mono">{publicUrl}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Copiado!") }}
                    className="shrink-0 p-1 text-zinc-400 hover:text-white"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a href={publicUrl} target="_blank" rel="noreferrer" className="shrink-0 p-1 text-zinc-400 hover:text-white">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setShowQR(!showQR)}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
                  >
                    <QrCode className="w-4 h-4" />
                    {showQR ? "Ocultar QR Code" : "Mostrar QR Code"}
                  </button>
                </div>
                {showQR && (
                  <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl w-fit">
                    <QRCodeSVG value={publicUrl} size={160} />
                    <p className="text-[10px] text-zinc-600">Escaneie para acessar os vídeos</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Equipe */}
      {tab === "equipe" && (
        <EquipeTab coberturaId={coberturaId} equipe={cobertura.equipe} onMutate={mutate} uploads={cobertura.uploads} />
      )}

      {/* Tab: Checklist */}
      {tab === "checklist" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex gap-1 flex-wrap">
              {diaOptions.map((d) => (
                <button
                  key={d}
                  onClick={() => setDiaChecklist(d)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-lg transition-colors",
                    diaChecklist === d
                      ? "bg-purple-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-white"
                  )}
                >
                  Dia {d}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${checklistPct}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400">{checklistPct}%</span>
            </div>
          </div>

          {["equipamento", "logistica", "conteudo", "entrega"].map((cat) => {
            const items = checklistDia.filter((c) => c.categoria === cat)
            if (items.length === 0) return null
            return (
              <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3 capitalize">
                  {cat}
                </h4>
                <div className="space-y-2">
                  {items.map((item) => (
                    <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                      <button
                        onClick={() => toggleChecklist(item.id, !item.concluido)}
                        className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0",
                          item.concluido
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-zinc-600 group-hover:border-zinc-400"
                        )}
                      >
                        {item.concluido && <Check className="w-3 h-3" />}
                      </button>
                      <span className={cn("text-sm", item.concluido ? "text-zinc-500 line-through" : "text-zinc-200")}>
                        {item.texto}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tab: Uploads */}
      {tab === "uploads" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setDiaUploads("")}
                className={cn("px-3 py-1 text-xs rounded-lg transition-colors",
                  diaUploads === "" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
                )}
              >
                Todos
              </button>
              {diaOptions.map((d) => (
                <button key={d} onClick={() => setDiaUploads(d)}
                  className={cn("px-3 py-1 text-xs rounded-lg transition-colors",
                    diaUploads === d ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
                  )}
                >
                  Dia {d}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <select
                value={diaUploadFile}
                onChange={(e) => setDiaUploadFile(parseInt(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300"
              >
                {diaOptions.map((d) => <option key={d} value={d}>Dia {d}</option>)}
              </select>
              <input ref={fileInputRef} type="file" accept="video/*,image/*" className="hidden" onChange={handleFileUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Upload
              </button>
            </div>
          </div>
          {uploading && (
            <div className="space-y-1">
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 text-right">{uploadProgress}%</p>
            </div>
          )}

          {uploadsFiltrados.length === 0 ? (
            <div className="text-center py-10 text-zinc-500">
              <Upload className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum upload ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {uploadsFiltrados.map((u) => (
                <div key={u.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden group">
                  <div className="relative aspect-video bg-zinc-800">
                    {u.thumbnailUrl ? (
                      <img src={u.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play className="w-6 h-6 text-zinc-600" />
                      </div>
                    )}
                    <div className="absolute top-1.5 left-1.5">
                      <span className="text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                        Dia {u.dia}
                      </span>
                    </div>
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-6 h-6 bg-black/70 hover:bg-blue-900 rounded flex items-center justify-center"
                      >
                        <Download className="w-3 h-3 text-white" />
                      </a>
                      <button
                        onClick={() => deleteUpload(u.id)}
                        className="w-6 h-6 bg-black/70 hover:bg-red-900 rounded flex items-center justify-center"
                      >
                        <Trash2 className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-xs text-zinc-300 truncate">{u.titulo ?? "Sem título"}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] text-zinc-600">{MOMENTO_LABEL[u.momento] ?? u.momento}</span>
                      {u.membro && (
                        <span className="text-[9px] text-zinc-600 truncate">· {u.membro.nome}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Relatório IA */}
      {tab === "relatorio" && (
        <div className="space-y-4">
          {!relatorioConteudo && !gerandoRelatorio && (
            <div className="text-center py-12">
              <BarChart2 className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
              <p className="text-sm text-zinc-400 mb-3">Nenhum relatório gerado ainda.</p>
              <button
                onClick={gerarRelatorio}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg"
              >
                Gerar Relatório IA
              </button>
            </div>
          )}
          {gerandoRelatorio && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 mx-auto mb-3 text-purple-400 animate-spin" />
              <p className="text-sm text-zinc-400">Analisando evento com IA...</p>
            </div>
          )}
          {relatorioConteudo && (
            <div className="space-y-4">
              {relatorioConteudo.score_producao !== undefined && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-purple-600/20 border-2 border-purple-500 flex items-center justify-center">
                    <span className="text-2xl font-bold text-purple-300">{relatorioConteudo.score_producao}</span>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Score de Produção</p>
                    <p className="text-sm text-zinc-300 mt-1">
                      {relatorioConteudo.score_producao >= 80 ? "Excelente performance! 🎉" :
                       relatorioConteudo.score_producao >= 60 ? "Boa performance, com pontos a melhorar." :
                       "Performance abaixo do esperado. Veja as recomendações."}
                    </p>
                  </div>
                </div>
              )}
              {relatorioConteudo.resumo_executivo && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Resumo Executivo</h4>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{relatorioConteudo.resumo_executivo}</p>
                </div>
              )}
              {relatorioConteudo.performance_equipe && relatorioConteudo.performance_equipe.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Performance da Equipe</h4>
                  <div className="space-y-3">
                    {relatorioConteudo.performance_equipe.map((m, i) => (
                      <div key={i} className="border-l-2 border-purple-600/40 pl-3">
                        <p className="text-sm font-medium text-zinc-200">{m.nome} <span className="text-zinc-500 text-xs">({m.funcao})</span></p>
                        <p className="text-xs text-zinc-400 mt-0.5">{m.avaliacao}</p>
                        <p className="text-xs text-emerald-400 mt-0.5">✓ {m.pontos_fortes}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {relatorioConteudo.recomendacoes && relatorioConteudo.recomendacoes.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Recomendações</h4>
                  <ul className="space-y-1.5">
                    {relatorioConteudo.recomendacoes.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                        <ChevronRight className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {relatorioConteudo.pontos_atencao && relatorioConteudo.pontos_atencao.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">⚠️ Pontos de Atenção</h4>
                  <ul className="space-y-1.5">
                    {relatorioConteudo.pontos_atencao.map((p, i) => (
                      <li key={i} className="text-sm text-amber-300">{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                onClick={gerarRelatorio}
                disabled={gerandoRelatorio}
                className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white"
              >
                {gerandoRelatorio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart2 className="w-3.5 h-3.5" />}
                Gerar novo relatório
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-component: Equipe Tab ──────────────────────────────────────────────────

function EquipeTab({
  coberturaId, equipe, uploads, onMutate
}: {
  coberturaId: string
  equipe: Membro[]
  uploads: UploadItem[]
  onMutate: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ nome: "", funcao: "captacao", token: "", diariasTotal: 1, valorDiaria: "" })
  const [saving, setSaving] = useState(false)

  const papel = form.funcao === "edicao" ? "edicao" : "captacao"
  const { data: opcoesData } = useSWR<{ opcoes: { value: string; label: string; subtitle: string; tipoContrato: string; origem: string }[] }>(
    `/api/equipe-disponivel?papel=${papel}`,
    (url: string) => fetch(url).then((r) => r.json())
  )
  const opcoes = opcoesData?.opcoes ?? []

  // Produtividade por membro
  const uploadsPorMembro: Record<string, number> = {}
  for (const u of uploads) {
    if (u.membro?.id) uploadsPorMembro[u.membro.id] = (uploadsPorMembro[u.membro.id] ?? 0) + 1
  }
  const maxUploads = Math.max(...Object.values(uploadsPorMembro), 1)

  const handleAdd = async () => {
    if (!form.nome) return
    setSaving(true)
    try {
      const res = await fetch(`/api/coberturas/${coberturaId}/equipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          funcao: form.funcao,
          token: form.token || null,
          diariasTotal: form.diariasTotal,
          valorDiaria: form.valorDiaria ? parseFloat(form.valorDiaria) : null,
        }),
      })
      if (!res.ok) throw new Error("Erro ao adicionar")
      setAdding(false)
      setForm({ nome: "", funcao: "captacao", token: "", diariasTotal: 1, valorDiaria: "" })
      onMutate()
      toast.success("Membro adicionado!")
    } catch { toast.error("Erro ao adicionar membro") } finally { setSaving(false) }
  }

  const handleRemove = async (membroId: string) => {
    if (!confirm("Remover membro?")) return
    const res = await fetch(`/api/coberturas/${coberturaId}/equipe?membroId=${membroId}`, { method: "DELETE" })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erro ao remover" }))
      toast.error(err.error ?? "Erro ao remover")
    } else { onMutate(); toast.success("Membro removido") }
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"

  return (
    <div className="space-y-4">
      {/* Tabela produtividade */}
      {equipe.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Produtividade</h3>
          </div>
          <div className="divide-y divide-zinc-800">
            {equipe.map((m) => {
              const up = uploadsPorMembro[m.id] ?? 0
              return (
                <div key={m.id} className="p-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                    {m.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-200 truncate">{m.nome}</p>
                      <span className="text-[9px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full capitalize">
                        {m.funcao}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all"
                          style={{ width: `${(up / maxUploads) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-400 shrink-0">{up} uploads</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Adicionar membro */}
      {adding ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-medium text-zinc-200">Novo Membro</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Pessoa cadastrada</label>
              <select
                value={form.token}
                onChange={(e) => {
                  const op = opcoes.find((o) => o.value === e.target.value)
                  setForm((f) => ({ ...f, token: e.target.value, nome: op?.label ?? f.nome }))
                }}
                className={inputClass}
              >
                <option value="">Selecionar...</option>
                {opcoes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}{o.subtitle ? ` · ${o.subtitle}` : ""}{o.tipoContrato === "externo" ? " (externo)" : " (interno)"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Nome (obrigatório)</label>
              <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do membro" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Função</label>
              <select value={form.funcao} onChange={(e) => setForm((f) => ({ ...f, funcao: e.target.value }))} className={inputClass}>
                {Object.entries({ captacao: "Captação", edicao: "Edição", fotografia: "Fotografia", drone: "Drone", suporte: "Suporte", social_media: "Social Media" }).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Diárias</label>
              <input type="number" min={0} value={form.diariasTotal}
                onChange={(e) => setForm((f) => ({ ...f, diariasTotal: parseInt(e.target.value) || 0 }))}
                className={inputClass} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400">Cancelar</button>
            <button onClick={handleAdd} disabled={saving || !form.nome}
              className="flex-1 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50">
              {saving ? "..." : "Adicionar"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar membro à equipe
        </button>
      )}
    </div>
  )
}
