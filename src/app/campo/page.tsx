"use client"

export const dynamic = "force-dynamic"

import { useState, useRef, useCallback, useEffect } from "react"
import { signOut, useSession } from "next-auth/react"
import useSWR from "swr"
import {
  Home,
  CalendarRange,
  FileText,
  Calendar,
  Images,
  CheckSquare,
  Square,
  Upload,
  LogOut,
  MapPin,
  Loader2,
  CheckCircle2,
  Play,
  Trophy,
  ChevronDown,
  ChevronUp,
  Camera,
  Search,
  Image as ImageIcon,
  Video,
  X,
  Plus,
  Clock,
  AlertCircle,
  Sparkles,
  ExternalLink,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ─── Design Tokens ───────────────────────────────────────────────────────────
const NAV_BG = "#06142E"
const CARD_BG = "#0A1F3F"
const ACCENT = "#00A58A"

// ─── Types ───────────────────────────────────────────────────────────────────
type TabId = "inicio" | "eventos" | "demandas" | "agenda" | "galeria"

interface ChecklistItem {
  id: string
  dia: number
  texto: string
  categoria: string
  concluido: boolean
}

interface UploadItem {
  id: string
  dia: number
  titulo: string | null
  url: string
  thumbnailUrl: string | null
  createdAt: string
}

interface Cobertura {
  id: string
  titulo: string
  slug: string
  tipo: string
  status: string
  cliente: string | null
  local: string | null
  cidade: string | null
  dataInicio: string
  dataFim: string
  totalDias: number
  produto: { id: string; nome: string } | null
  checklist: ChecklistItem[]
  uploads: UploadItem[]
  equipe: { id: string; funcao: string }[]
  _count: { uploads: number; checklist: number }
}

interface Demanda {
  id: string
  codigo: string
  titulo: string
  descricao: string | null
  statusVisivel: string
  statusInterno: string
  tipoVideo: string | null
  prioridade: string | null
  dataLimite: string | null
  cidade: string | null
  localGravacao: string | null
  linkFolderBrutos: string | null
  linkFolderFinal: string | null
  produtos: { produto: { nome: string } }[]
}

interface AgendaEvento {
  id: string
  titulo: string
  descricao: string | null
  inicio: string
  fim: string | null
  local: string | null
  tipo: string | null
}

interface AgendaCobertura {
  id: string
  titulo: string
  tipo: string
  status: string
  dataInicio: string
  dataFim: string
  local: string | null
  cidade: string | null
  slug: string
}

interface RankingItem {
  posicao: number
  videomakerId: string
  nome: string
  total: number
  isMeu: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_LABEL: Record<string, string> = {
  entrada: "Entrada",
  em_andamento: "Em andamento",
  editando: "Editando",
  revisao: "Revisão",
  aprovacao: "Aprovação",
  para_postar: "Para Postar",
  finalizado: "Finalizado",
}

const STATUS_COLOR: Record<string, string> = {
  entrada: "bg-zinc-700 text-zinc-300",
  em_andamento: "bg-blue-900/70 text-blue-300",
  editando: "bg-violet-900/70 text-violet-300",
  revisao: "bg-amber-900/70 text-amber-300",
  aprovacao: "bg-orange-900/70 text-orange-300",
  para_postar: "bg-emerald-900/70 text-emerald-300",
  finalizado: "bg-green-900/70 text-green-300",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

// ─── Bottom Navigation ────────────────────────────────────────────────────────
const NAV_TABS: { id: TabId; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string }[] = [
  { id: "inicio", icon: Home, label: "Início" },
  { id: "eventos", icon: CalendarRange, label: "Eventos" },
  { id: "demandas", icon: FileText, label: "Demandas" },
  { id: "agenda", icon: Calendar, label: "Agenda" },
  { id: "galeria", icon: Images, label: "Galeria" },
]

function BottomNav({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  return (
    <nav
      className="shrink-0 flex items-stretch border-t"
      style={{ backgroundColor: NAV_BG, borderColor: "rgba(255,255,255,0.08)" }}
    >
      {NAV_TABS.map(({ id, icon: Icon, label }) => {
        const active = tab === id
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors"
          >
            <Icon
              className="w-5 h-5 transition-colors"
              style={{ color: active ? ACCENT : "rgba(255,255,255,0.4)" }}
            />
            <span
              className="text-[10px] font-medium transition-colors"
              style={{ color: active ? ACCENT : "rgba(255,255,255,0.4)" }}
            >
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

// ─── Tab Início ──────────────────────────────────────────────────────────────
function TabInicio({
  coberturas,
  ranking,
  minhaPosicao,
  meuTotal,
}: {
  coberturas: Cobertura[]
  ranking: RankingItem[]
  minhaPosicao: number | null
  meuTotal: number
}) {
  const { data: session } = useSession()
  const [expanded, setExpanded] = useState<string | null>(coberturas[0]?.id ?? null)

  const hoje = new Date()
  const saudacao =
    hoje.getHours() < 12 ? "Bom dia" : hoje.getHours() < 18 ? "Boa tarde" : "Boa noite"

  const nome = session?.user?.name?.split(" ")[0] ?? "Equipe"

  return (
    <div className="p-4 space-y-5">
      {/* Header saudação */}
      <div>
        <p className="text-xs" style={{ color: ACCENT }}>
          {saudacao} 👋
        </p>
        <h1 className="text-xl font-bold text-white">{nome}!</h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          {hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Ranking semanal */}
      {(minhaPosicao || ranking.length > 0) && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: CARD_BG, border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-sm font-semibold text-white">Ranking da Semana</span>
          </div>
          {minhaPosicao && (
            <div
              className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl"
              style={{ backgroundColor: `${ACCENT}15`, border: `1px solid ${ACCENT}40` }}
            >
              <span className="text-lg font-bold" style={{ color: ACCENT }}>
                #{minhaPosicao}
              </span>
              <span className="text-sm text-white font-medium">Você esta semana</span>
              <span className="ml-auto text-xs" style={{ color: ACCENT }}>
                {meuTotal} upload(s)
              </span>
            </div>
          )}
          <div className="space-y-2">
            {ranking.slice(0, 5).map((r) => (
              <div key={r.videomakerId} className="flex items-center gap-2">
                <span
                  className="text-xs font-bold w-5 text-center"
                  style={{ color: r.posicao === 1 ? "#FFD700" : "rgba(255,255,255,0.4)" }}
                >
                  {r.posicao === 1 ? "🥇" : `#${r.posicao}`}
                </span>
                <span
                  className={cn("text-sm flex-1", r.isMeu ? "font-semibold text-white" : "text-zinc-300")}
                >
                  {r.nome}
                </span>
                <span className="text-xs text-zinc-500">{r.total} uploads</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wallet Cards — eventos */}
      {coberturas.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase mb-3 tracking-wide">
            Eventos Ativos
          </p>
          <div className="space-y-3">
            {coberturas.map((c) => {
              const isOpen = expanded === c.id
              const checklistPct =
                c._count.checklist > 0
                  ? Math.round(
                      (c.checklist.filter((i) => i.concluido).length / c._count.checklist) * 100
                    )
                  : 0

              return (
                <div
                  key={c.id}
                  className="rounded-2xl overflow-hidden cursor-pointer"
                  style={{
                    backgroundColor: CARD_BG,
                    border: "1px solid rgba(255,255,255,0.07)",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
                  }}
                  onClick={() => setExpanded(isOpen ? null : c.id)}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: `${ACCENT}20`, color: ACCENT }}
                          >
                            {c.tipo}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-white truncate">{c.titulo}</h3>
                        {(c.local || c.cidade) && (
                          <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {[c.local, c.cidade].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-zinc-500">Checklist</span>
                        <span className="text-[10px]" style={{ color: ACCENT }}>
                          {checklistPct}%
                        </span>
                      </div>
                      <div className="h-1 bg-zinc-700 rounded-full">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${checklistPct}%`, backgroundColor: ACCENT }}
                        />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mt-3">
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Upload className="w-3 h-3" />
                        {c._count.uploads} upload(s)
                      </span>
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Clock className="w-3 h-3" />
                        {formatDate(c.dataInicio)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <CalendarRange className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-500">Nenhum evento ativo</p>
        </div>
      )}
    </div>
  )
}

// ─── Tab Eventos ──────────────────────────────────────────────────────────────
function TabEventos({
  coberturas,
  videomakerId,
  onReload,
}: {
  coberturas: Cobertura[]
  videomakerId: string | null
  onReload: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<Record<string, "checklist" | "upload" | "galeria">>({})
  const [diaAtivo, setDiaAtivo] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [togglingItem, setTogglingItem] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)

  const getCategoriaLabel = (cat: string) => {
    const map: Record<string, string> = {
      equipamento: "Equipamento",
      logistica: "Logística",
      conteudo: "Conteúdo",
      entrega: "Entrega",
    }
    return map[cat] ?? cat
  }

  const getCategoriaColor = (cat: string) => {
    const map: Record<string, string> = {
      equipamento: "text-blue-400",
      logistica: "text-amber-400",
      conteudo: "text-purple-400",
      entrega: "text-green-400",
    }
    return map[cat] ?? "text-zinc-400"
  }

  const handleToggleChecklist = async (coberturaId: string, itemId: string, concluido: boolean) => {
    setTogglingItem(itemId)
    try {
      await fetch(`/api/coberturas/${coberturaId}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, concluido: !concluido }),
      })
      onReload()
    } catch {
      toast.error("Erro ao atualizar checklist")
    } finally {
      setTogglingItem(null)
    }
  }

  const handleUpload = useCallback(
    async (coberturaId: string, files: FileList, tipo: "foto" | "video") => {
      const slug = coberturas.find((c) => c.id === coberturaId)?.slug ?? coberturaId
      const dia = diaAtivo[coberturaId] ?? 1
      const membroEquipe = coberturas.find((c) => c.id === coberturaId)?.equipe?.[0]

      for (const file of Array.from(files)) {
        const uploadKey = `${coberturaId}-${file.name}`
        setUploading((p) => ({ ...p, [uploadKey]: true }))
        setUploadProgress((p) => ({ ...p, [uploadKey]: 0 }))

        try {
          // 1. Get presigned URL
          const contentType = file.type || (tipo === "video" ? "video/mp4" : "image/jpeg")
          const urlRes = await fetch(
            `/api/coberturas/${coberturaId}/uploads/upload-url?tipo=${tipo}&contentType=${encodeURIComponent(contentType)}`
          )
          if (!urlRes.ok) throw new Error("Erro ao gerar URL de upload")
          const { uploadUrl, publicUrl } = await urlRes.json()

          // 2. Upload via XHR para ter progresso
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                setUploadProgress((p) => ({
                  ...p,
                  [uploadKey]: Math.round((e.loaded / e.total) * 100),
                }))
              }
            }
            xhr.onload = () =>
              xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
            xhr.onerror = () => reject(new Error("Falha na conexão"))
            xhr.open("PUT", uploadUrl)
            xhr.setRequestHeader("Content-Type", contentType)
            xhr.send(file)
          })

          // 3. Gerar thumbnail para fotos via Canvas
          let thumbnailUrl: string | null = null
          if (tipo === "foto") {
            try {
              const bitmap = await createImageBitmap(file)
              const canvas = document.createElement("canvas")
              const max = 400
              const ratio = Math.min(max / bitmap.width, max / bitmap.height)
              canvas.width = Math.round(bitmap.width * ratio)
              canvas.height = Math.round(bitmap.height * ratio)
              canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
              const thumbBlob = await new Promise<Blob | null>((res) =>
                canvas.toBlob(res, "image/jpeg", 0.8)
              )
              if (thumbBlob) {
                const thumbRes = await fetch(
                  `/api/coberturas/${coberturaId}/uploads/upload-url?tipo=thumbnail&contentType=image/jpeg`
                )
                if (thumbRes.ok) {
                  const { uploadUrl: thumbUploadUrl, publicUrl: thumbPublicUrl } = await thumbRes.json()
                  await fetch(thumbUploadUrl, {
                    method: "PUT",
                    headers: { "Content-Type": "image/jpeg" },
                    body: thumbBlob,
                  })
                  thumbnailUrl = thumbPublicUrl
                }
              }
            } catch (e) {
              console.warn("Thumbnail generation failed:", e)
            }
          }

          // 4. Salvar upload no banco
          const saveRes = await fetch(`/api/coberturas/${coberturaId}/uploads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: publicUrl,
              tipo,
              dia,
              titulo: file.name.replace(/\.[^/.]+$/, ""),
              thumbnailUrl,
              membroId: membroEquipe?.id ?? null,
              tamanhoBytes: file.size,
            }),
          })
          if (!saveRes.ok) throw new Error("Erro ao salvar upload")

          // 5. Para fotos: indexar faces no background
          if (tipo === "foto") {
            const savedUpload = await saveRes.json()
            void indexFaces(publicUrl, savedUpload.upload?.id ?? savedUpload.id)
          }

          toast.success(`${tipo === "foto" ? "Foto" : "Vídeo"} enviado!`)
          onReload()
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Erro no upload")
        } finally {
          setUploading((p) => ({ ...p, [uploadKey]: false }))
          setUploadProgress((p) => ({ ...p, [uploadKey]: 0 }))
        }
      }
    },
    [coberturas, diaAtivo, onReload]
  )

  // Indexar faces em uma foto (client-side, background)
  async function indexFaces(photoUrl: string, uploadId: string) {
    try {
      const faceapi = await import("@vladmandic/face-api")
      const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/"

      if (!(faceapi.nets.ssdMobilenetv1.isLoaded)) {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
      }

      const img = new window.Image()
      img.crossOrigin = "anonymous"
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error("Img load failed"))
        img.src = photoUrl
      })

      const detections = await faceapi
        .detectAllFaces(img)
        .withFaceLandmarks()
        .withFaceDescriptors()

      for (const det of detections) {
        await fetch("/api/campo/face-descriptors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadId,
            descriptor: Array.from(det.descriptor),
          }),
        }).catch(() => null)
      }
    } catch (e) {
      console.warn("Face indexing failed:", e)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-base font-bold text-white">Meus Eventos</h2>

      {coberturas.length === 0 && (
        <div className="text-center py-12">
          <CalendarRange className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-500">Você não está escalado em nenhum evento</p>
        </div>
      )}

      {coberturas.map((c) => {
        const isOpen = expanded === c.id
        const currentSubTab = subTab[c.id] ?? "checklist"
        const dia = diaAtivo[c.id] ?? 1
        const totalDias = c.totalDias || 1

        const diasList = Array.from({ length: totalDias }, (_, i) => i + 1)
        const checklistDia = c.checklist.filter((item) => item.dia === dia)
        const checklistConcluidos = checklistDia.filter((i) => i.concluido).length
        const checklistPct = checklistDia.length > 0 ? Math.round((checklistConcluidos / checklistDia.length) * 100) : 0

        const uploadsDia = c.uploads.filter((u) => u.dia === dia)

        // Agrupar checklist por categoria
        const checklistPorCategoria: Record<string, ChecklistItem[]> = {}
        for (const item of checklistDia) {
          if (!checklistPorCategoria[item.categoria]) checklistPorCategoria[item.categoria] = []
          checklistPorCategoria[item.categoria].push(item)
        }

        return (
          <div
            key={c.id}
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: CARD_BG, border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {/* Header do card */}
            <button
              className="w-full p-4 text-left"
              onClick={() => setExpanded(isOpen ? null : c.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-500 mb-0.5">{c.tipo}</p>
                  <h3 className="text-sm font-semibold text-white truncate">{c.titulo}</h3>
                  {(c.local || c.cidade) && (
                    <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {[c.local, c.cidade].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-zinc-500">
                      {formatDate(c.dataInicio)} – {formatDate(c.dataFim)}
                    </span>
                    <span className="text-xs" style={{ color: ACCENT }}>
                      {checklistPct}% ✓
                    </span>
                  </div>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0 mt-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0 mt-1" />
                )}
              </div>
            </button>

            {/* Conteúdo expandido */}
            {isOpen && (
              <div>
                {/* Seletor de dia */}
                {totalDias > 1 && (
                  <div
                    className="flex gap-2 px-4 pb-2 overflow-x-auto"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {diasList.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDiaAtivo((p) => ({ ...p, [c.id]: d }))}
                        className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors"
                        style={
                          dia === d
                            ? { backgroundColor: ACCENT, color: "#fff" }
                            : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }
                        }
                      >
                        Dia {d}
                      </button>
                    ))}
                  </div>
                )}

                {/* Sub-tabs */}
                <div
                  className="flex border-b"
                  style={{ borderColor: "rgba(255,255,255,0.07)" }}
                >
                  {(["checklist", "upload", "galeria"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setSubTab((p) => ({ ...p, [c.id]: st }))}
                      className="flex-1 py-2 text-xs font-medium capitalize transition-colors border-b-2"
                      style={
                        currentSubTab === st
                          ? { color: ACCENT, borderColor: ACCENT }
                          : { color: "rgba(255,255,255,0.4)", borderColor: "transparent" }
                      }
                    >
                      {st === "checklist" ? "✓ Checklist" : st === "upload" ? "↑ Upload" : "◻ Galeria"}
                    </button>
                  ))}
                </div>

                {/* Checklist */}
                {currentSubTab === "checklist" && (
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">
                        {checklistConcluidos}/{checklistDia.length} concluídos
                      </span>
                      <span className="text-xs font-semibold" style={{ color: ACCENT }}>
                        {checklistPct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-700 rounded-full">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${checklistPct}%`, backgroundColor: ACCENT }}
                      />
                    </div>

                    {Object.entries(checklistPorCategoria).map(([cat, items]) => (
                      <div key={cat}>
                        <p
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wide mb-1.5",
                            getCategoriaColor(cat)
                          )}
                        >
                          {getCategoriaLabel(cat)}
                        </p>
                        <div className="space-y-1">
                          {items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => handleToggleChecklist(c.id, item.id, item.concluido)}
                              disabled={togglingItem === item.id}
                              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left transition-colors active:scale-98"
                              style={{
                                backgroundColor: item.concluido
                                  ? "rgba(0,165,138,0.1)"
                                  : "rgba(255,255,255,0.04)",
                                border: item.concluido
                                  ? `1px solid ${ACCENT}30`
                                  : "1px solid rgba(255,255,255,0.06)",
                              }}
                            >
                              {togglingItem === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-zinc-400 shrink-0" />
                              ) : item.concluido ? (
                                <CheckCircle2
                                  className="w-4 h-4 shrink-0"
                                  style={{ color: ACCENT }}
                                />
                              ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-zinc-600 shrink-0" />
                              )}
                              <span
                                className={cn(
                                  "text-sm",
                                  item.concluido ? "text-zinc-400 line-through" : "text-zinc-200"
                                )}
                              >
                                {item.texto}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {checklistDia.length === 0 && (
                      <p className="text-sm text-zinc-500 text-center py-4">
                        Sem itens para o Dia {dia}
                      </p>
                    )}
                  </div>
                )}

                {/* Upload */}
                {currentSubTab === "upload" && (
                  <div className="p-4 space-y-4">
                    <p className="text-xs text-zinc-400">Upload para o Dia {dia}</p>

                    {/* Botões de upload */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          setUploadingFor(`${c.id}-foto`)
                          fileInputRef.current?.setAttribute(
                            "data-cobertura",
                            c.id
                          )
                          fileInputRef.current?.setAttribute("data-tipo", "foto")
                          fileInputRef.current?.setAttribute(
                            "accept",
                            "image/*"
                          )
                          fileInputRef.current?.removeAttribute("multiple")
                          fileInputRef.current?.setAttribute("multiple", "true")
                          fileInputRef.current?.click()
                        }}
                        className="flex flex-col items-center gap-2 py-4 rounded-xl border border-dashed border-zinc-600 hover:border-zinc-400 transition-colors"
                      >
                        <Camera className="w-6 h-6 text-zinc-400" />
                        <span className="text-xs text-zinc-400">Fotos</span>
                      </button>
                      <button
                        onClick={() => {
                          setUploadingFor(`${c.id}-video`)
                          fileInputRef.current?.setAttribute("data-cobertura", c.id)
                          fileInputRef.current?.setAttribute("data-tipo", "video")
                          fileInputRef.current?.setAttribute("accept", "video/*")
                          fileInputRef.current?.removeAttribute("multiple")
                          fileInputRef.current?.click()
                        }}
                        className="flex flex-col items-center gap-2 py-4 rounded-xl border border-dashed border-zinc-600 hover:border-zinc-400 transition-colors"
                      >
                        <Video className="w-6 h-6 text-zinc-400" />
                        <span className="text-xs text-zinc-400">Vídeo</span>
                      </button>
                    </div>

                    {/* Progresso de uploads ativos */}
                    {Object.entries(uploading)
                      .filter(([k, v]) => k.startsWith(c.id) && v)
                      .map(([key]) => (
                        <div key={key} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400">Enviando...</span>
                            <span className="text-xs" style={{ color: ACCENT }}>
                              {uploadProgress[key] ?? 0}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-zinc-700 rounded-full">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${uploadProgress[key] ?? 0}%`,
                                backgroundColor: ACCENT,
                              }}
                            />
                          </div>
                        </div>
                      ))}

                    {/* Uploads recentes do dia */}
                    {uploadsDia.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 mb-2">Enviados hoje</p>
                        <div className="grid grid-cols-3 gap-2">
                          {uploadsDia.slice(0, 9).map((up) => (
                            <div
                              key={up.id}
                              className="aspect-video rounded-lg overflow-hidden bg-zinc-700 relative"
                            >
                              {up.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={up.thumbnailUrl}
                                  alt={up.titulo ?? "Upload"}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Video className="w-4 h-4 text-zinc-500" />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Galeria simples */}
                {currentSubTab === "galeria" && (
                  <div className="p-4">
                    {c.uploads.length === 0 ? (
                      <p className="text-sm text-zinc-500 text-center py-8">
                        Nenhum upload ainda
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5">
                        {c.uploads.map((up) => (
                          <a
                            key={up.id}
                            href={up.url}
                            target="_blank"
                            rel="noreferrer"
                            className="aspect-video rounded-lg overflow-hidden bg-zinc-700 relative block"
                          >
                            {up.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={up.thumbnailUrl}
                                alt={up.titulo ?? "Upload"}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Video className="w-4 h-4 text-zinc-500" />
                              </div>
                            )}
                            <div className="absolute bottom-1 right-1">
                              <span className="text-[9px] bg-black/60 text-white px-1 py-0.5 rounded">
                                D{up.dia}
                              </span>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Input de arquivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => {
          const files = e.target.files
          const coberturaId = fileInputRef.current?.getAttribute("data-cobertura") ?? ""
          const tipo = (fileInputRef.current?.getAttribute("data-tipo") ?? "video") as "foto" | "video"
          if (files && files.length > 0 && coberturaId) {
            handleUpload(coberturaId, files, tipo)
          }
          // Reset
          e.target.value = ""
          setUploadingFor(null)
        }}
      />
    </div>
  )
}

// ─── Tab Demandas ─────────────────────────────────────────────────────────────
function TabDemandas({ demandas }: { demandas: Demanda[] }) {
  const prioridadeColor: Record<string, string> = {
    urgente: "text-red-400",
    alta: "text-orange-400",
    normal: "text-zinc-400",
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-base font-bold text-white">Minhas Demandas</h2>

      {demandas.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-500">Nenhuma demanda ativa</p>
        </div>
      )}

      {demandas.map((d) => {
        const isVencida = d.dataLimite && new Date(d.dataLimite) < new Date()
        return (
          <a
            key={d.id}
            href={`/demandas/${d.id}`}
            target="_blank"
            rel="noreferrer"
            className="block rounded-2xl p-4 transition-opacity active:opacity-70"
            style={{ backgroundColor: CARD_BG, border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium",
                  STATUS_COLOR[d.statusVisivel] ?? "bg-zinc-700 text-zinc-300"
                )}
              >
                {STATUS_LABEL[d.statusVisivel] ?? d.statusVisivel}
              </span>
              {d.prioridade && d.prioridade !== "normal" && (
                <span
                  className={cn("text-[10px] font-bold uppercase", prioridadeColor[d.prioridade] ?? "")}
                >
                  {d.prioridade}
                </span>
              )}
            </div>

            <p className="text-[10px] text-zinc-500 font-mono">{d.codigo}</p>
            <h3 className="text-sm font-semibold text-white mt-0.5 line-clamp-2">{d.titulo}</h3>

            {d.produtos?.[0] && (
              <p className="text-xs text-zinc-500 mt-1">{d.produtos[0].produto.nome}</p>
            )}

            <div className="flex items-center gap-3 mt-2">
              {d.dataLimite && (
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    isVencida ? "text-red-400" : "text-zinc-500"
                  )}
                >
                  <Clock className="w-3 h-3" />
                  {formatDate(d.dataLimite)}
                </span>
              )}
              {(d.cidade || d.localGravacao) && (
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <MapPin className="w-3 h-3" />
                  {d.cidade ?? d.localGravacao}
                </span>
              )}
            </div>

            {/* Links de pastas */}
            {(d.linkFolderBrutos || d.linkFolderFinal) && (
              <div className="flex gap-2 mt-2">
                {d.linkFolderBrutos && (
                  <a
                    href={d.linkFolderBrutos}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Brutos
                  </a>
                )}
                {d.linkFolderFinal && (
                  <a
                    href={d.linkFolderFinal}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg"
                    style={{
                      backgroundColor: `${ACCENT}15`,
                      color: ACCENT,
                    }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Final
                  </a>
                )}
              </div>
            )}
          </a>
        )
      })}
    </div>
  )
}

// ─── Tab Agenda ───────────────────────────────────────────────────────────────
function TabAgenda({
  eventos,
  coberturas,
}: {
  eventos: AgendaEvento[]
  coberturas: AgendaCobertura[]
}) {
  const hoje = new Date()

  const allItems = [
    ...eventos.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      inicio: e.inicio,
      local: e.local,
      tipo: "evento" as const,
      extra: e.tipo,
    })),
    ...coberturas.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      inicio: c.dataInicio,
      local: [c.local, c.cidade].filter(Boolean).join(", "),
      tipo: "cobertura" as const,
      extra: c.tipo,
      slug: c.slug,
    })),
  ].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-base font-bold text-white">Agenda — Próximos 7 dias</h2>

      {allItems.length === 0 && (
        <div className="text-center py-12">
          <Calendar className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-500">Nada agendado nos próximos 7 dias</p>
        </div>
      )}

      {allItems.map((item) => {
        const dt = new Date(item.inicio)
        const isHoje = dt.toDateString() === hoje.toDateString()

        return (
          <div
            key={`${item.tipo}-${item.id}`}
            className="rounded-2xl p-4"
            style={{
              backgroundColor: CARD_BG,
              border: isHoje ? `1px solid ${ACCENT}50` : "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="shrink-0 rounded-xl px-2.5 py-1.5 text-center min-w-[42px]"
                style={{
                  backgroundColor: isHoje ? ACCENT : "rgba(255,255,255,0.06)",
                }}
              >
                <p className="text-[10px] text-white/70 leading-none">
                  {dt.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()}
                </p>
                <p className="text-lg font-bold text-white leading-tight">{dt.getDate()}</p>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {isHoje && (
                    <span className="text-[10px] font-bold" style={{ color: ACCENT }}>
                      HOJE
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-500">
                    {item.tipo === "cobertura" ? "Cobertura" : "Evento"} · {formatTime(item.inicio)}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-white truncate">{item.titulo}</h3>
                {item.local && (
                  <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />
                    {item.local}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Face Search Modal ────────────────────────────────────────────────────────
function FaceSearchModal({
  slug,
  titulo,
  onClose,
}: {
  slug: string
  titulo: string
  onClose: () => void
}) {
  const [step, setStep] = useState<"idle" | "capturing" | "searching" | "done" | "error">("idle")
  const [results, setResults] = useState<
    Array<{ uploadId: string; url: string; thumbnailUrl: string | null; dia: number; tipo: string }>
  >([])
  const [errorMsg, setErrorMsg] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSelfie(file: File) {
    setStep("searching")
    try {
      const faceapi = await import("@vladmandic/face-api")
      const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/"

      if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
      }

      const img = new window.Image()
      img.crossOrigin = "anonymous"
      const objectUrl = URL.createObjectURL(file)
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej()
        img.src = objectUrl
      })

      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor()

      URL.revokeObjectURL(objectUrl)

      if (!detection) {
        setErrorMsg("Rosto não detectado na selfie. Tente novamente com boa iluminação.")
        setStep("error")
        return
      }

      const res = await fetch(`/api/publico/cobertura/${slug}/face-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptor: Array.from(detection.descriptor) }),
      })
      const data = await res.json()
      setResults(data.matches ?? [])
      setStep("done")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro desconhecido")
      setStep("error")
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ backgroundColor: NAV_BG }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 border-b"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <button onClick={onClose} className="p-1">
          <X className="w-5 h-5 text-zinc-400" />
        </button>
        <div>
          <h2 className="text-sm font-bold text-white">Buscar por Rosto</h2>
          <p className="text-xs text-zinc-500 truncate">{titulo}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {step === "idle" && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${ACCENT}20` }}
            >
              <Sparkles className="w-8 h-8" style={{ color: ACCENT }} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white mb-2">Encontre-se nas fotos</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Tire uma selfie e o sistema encontrará todas as fotos e vídeos do evento onde você
                aparece.
              </p>
            </div>
            <button
              onClick={() => {
                setStep("capturing")
                fileInputRef.current?.click()
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm text-white"
              style={{ backgroundColor: ACCENT }}
            >
              <Camera className="w-4 h-4" />
              Tirar Selfie
            </button>
          </div>
        )}

        {step === "capturing" && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: ACCENT }} />
            <p className="text-sm text-zinc-400">Aguardando selfie...</p>
          </div>
        )}

        {step === "searching" && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${ACCENT}20` }}
            >
              <Search className="w-6 h-6 animate-pulse" style={{ color: ACCENT }} />
            </div>
            <p className="text-sm font-medium text-white">Analisando rosto...</p>
            <p className="text-xs text-zinc-500">Isso pode levar alguns segundos</p>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-sm text-red-400">{errorMsg}</p>
            <button
              onClick={() => setStep("idle")}
              className="px-4 py-2 rounded-xl text-sm text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Tentar Novamente
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {results.length > 0
                  ? `${results.length} resultado(s) encontrado(s)`
                  : "Nenhuma foto encontrada"}
              </h3>
              <button onClick={() => setStep("idle")} className="text-xs" style={{ color: ACCENT }}>
                Tentar novamente
              </button>
            </div>

            {results.length === 0 && (
              <div className="text-center py-8">
                <ImageIcon className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
                <p className="text-sm text-zinc-500">
                  Você não foi encontrado nas fotos deste evento.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {results.map((r) => (
                <a
                  key={r.uploadId}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square rounded-xl overflow-hidden bg-zinc-800 relative block"
                >
                  {r.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.thumbnailUrl}
                      alt="Resultado"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-zinc-500" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1">
                    <span className="text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded-full">
                      Dia {r.dia}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleSelfie(file)
          e.target.value = ""
        }}
      />
    </div>
  )
}

// ─── Tab Galeria ──────────────────────────────────────────────────────────────
function TabGaleria({ coberturas }: { coberturas: Cobertura[] }) {
  const [faceSearchTarget, setFaceSearchTarget] = useState<{
    slug: string
    titulo: string
  } | null>(null)

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-base font-bold text-white">Galeria de Eventos</h2>
      <p className="text-xs text-zinc-500">
        Compartilhe o link ou QR Code do evento com os participantes.
      </p>

      {coberturas.length === 0 && (
        <div className="text-center py-12">
          <Images className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-500">Nenhum evento disponível</p>
        </div>
      )}

      {coberturas.map((c) => {
        const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/e/${c.slug}`

        return (
          <div
            key={c.id}
            className="rounded-2xl p-4 space-y-3"
            style={{ backgroundColor: CARD_BG, border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div>
              <h3 className="text-sm font-semibold text-white">{c.titulo}</h3>
              {c.cidade && (
                <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {c.cidade}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 flex-1 truncate font-mono">/e/{c.slug}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl)
                  toast.success("Link copiado!")
                }}
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: `${ACCENT}20`, color: ACCENT }}
              >
                Copiar
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
              >
                Abrir
              </a>
            </div>

            <button
              onClick={() => setFaceSearchTarget({ slug: c.slug, titulo: c.titulo })}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed text-sm font-medium"
              style={{ borderColor: `${ACCENT}40`, color: ACCENT }}
            >
              <Search className="w-4 h-4" />
              Buscar por Rosto
            </button>
          </div>
        )
      })}

      {faceSearchTarget && (
        <FaceSearchModal
          slug={faceSearchTarget.slug}
          titulo={faceSearchTarget.titulo}
          onClose={() => setFaceSearchTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CampoPage() {
  const [tab, setTab] = useState<TabId>("inicio")
  const { data: session } = useSession()

  // Fetch eventos/coberturas do campo
  const { data: eventosData, mutate: mutateEventos } = useSWR<{
    coberturas: Cobertura[]
    videomakerId: string | null
  }>("/api/campo/eventos", fetcher, { refreshInterval: 30000 })

  // Fetch demandas
  const { data: demandasData } = useSWR<{
    demandas: Demanda[]
  }>("/api/campo/demandas", fetcher, { refreshInterval: 30000 })

  // Fetch agenda
  const { data: agendaData } = useSWR<{
    eventos: AgendaEvento[]
    coberturas: AgendaCobertura[]
  }>("/api/campo/agenda", fetcher, { refreshInterval: 60000 })

  // Fetch ranking
  const { data: rankingData } = useSWR<{
    ranking: RankingItem[]
    minhaPosicao: number | null
    meuTotal: number
  }>("/api/campo/ranking", fetcher, { refreshInterval: 60000 })

  const coberturas = eventosData?.coberturas ?? []
  const demandas = demandasData?.demandas ?? []
  const agendaEventos = agendaData?.eventos ?? []
  const agendaCoberturas = agendaData?.coberturas ?? []
  const ranking = rankingData?.ranking ?? []
  const minhaPosicao = rankingData?.minhaPosicao ?? null
  const meuTotal = rankingData?.meuTotal ?? 0

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ backgroundColor: NAV_BG }}
    >
      {/* Header fixo */}
      <header
        className="shrink-0 flex items-center justify-between px-4 py-3 border-b"
        style={{ backgroundColor: NAV_BG, borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: ACCENT }}
          >
            <Play className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <span className="text-sm font-bold text-white">NuFlow</span>
          <span className="text-xs text-zinc-500 ml-1">Campo</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sair
        </button>
      </header>

      {/* Conteúdo scrollable */}
      <main className="flex-1 overflow-y-auto">
        {tab === "inicio" && (
          <TabInicio
            coberturas={coberturas}
            ranking={ranking}
            minhaPosicao={minhaPosicao}
            meuTotal={meuTotal}
          />
        )}
        {tab === "eventos" && (
          <TabEventos
            coberturas={coberturas}
            videomakerId={eventosData?.videomakerId ?? null}
            onReload={() => mutateEventos()}
          />
        )}
        {tab === "demandas" && <TabDemandas demandas={demandas} />}
        {tab === "agenda" && (
          <TabAgenda eventos={agendaEventos} coberturas={agendaCoberturas} />
        )}
        {tab === "galeria" && <TabGaleria coberturas={coberturas} />}
      </main>

      <BottomNav tab={tab} setTab={setTab} />
    </div>
  )
}
