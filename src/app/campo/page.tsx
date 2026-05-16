"use client"

export const dynamic = "force-dynamic"

import { useState, useRef, useCallback, useEffect } from "react"
import { signOut, useSession } from "next-auth/react"
import useSWR from "swr"
import {
  CalendarRange,
  FileText,
  Calendar,
  Images,
  LogOut,
  MapPin,
  Loader2,
  CheckCircle2,
  Camera,
  Search,
  Image as ImageIcon,
  Video,
  X,
  Clock,
  AlertCircle,
  Sparkles,
  ExternalLink,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ─── Design Tokens ───────────────────────────────────────────────────────────
const NAV_BG = "#06142E"
const CARD_BG = "#0B2A32"
const ACCENT = "#00A58A"
const GREEN = "#7DD37B"
const LINE = "rgba(234,244,244,.11)"
const MUTED = "rgba(234,244,244,.62)"
const TEXT = "#EAF4F4"
const SOFT = "rgba(0,165,138,.16)"

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
const NAV_TABS: { id: TabId; label: string }[] = [
  { id: "inicio", label: "Início" },
  { id: "eventos", label: "Eventos" },
  { id: "demandas", label: "Demandas" },
  { id: "agenda", label: "Agenda" },
  { id: "galeria", label: "Galeria" },
]

function NavIcon({ id, active }: { id: TabId; active: boolean }) {
  const col = active ? GREEN : "rgba(234,244,244,.48)"
  const sw = 1.8
  if (id === "inicio") return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>
    </svg>
  )
  if (id === "eventos") return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <rect x={3} y={4} width={18} height={18} rx={2}/><path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  )
  if (id === "demandas") return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l2 2 4-4"/><rect x={5} y={5} width={14} height={14} rx={1}/>
    </svg>
  )
  if (id === "agenda") return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3v4M17 3v4M4 8h16"/><rect x={4} y={5} width={16} height={16} rx={1}/>
    </svg>
  )
  // galeria
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <rect x={4} y={5} width={16} height={14} rx={1}/><path d="m4 16 5-5 4 4 2-2 5 5"/>
    </svg>
  )
}

function BottomNav({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  return (
    <nav style={{
      position: "absolute",
      left: 14, right: 14, bottom: 12, height: 72,
      background: "rgba(8,28,42,.78)",
      border: `1px solid ${LINE}`,
      borderRadius: 28,
      display: "grid",
      gridTemplateColumns: "repeat(5,1fr)",
      zIndex: 80,
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      boxShadow: "0 18px 42px rgba(0,0,0,.48)",
    }}>
      {NAV_TABS.map(({ id, label }) => {
        const active = tab === id
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              border: 0,
              background: "transparent",
              color: active ? TEXT : "rgba(234,244,244,.48)",
              fontSize: 9.8,
              fontWeight: 560,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              borderRadius: 20,
              margin: "6px 2px",
              position: "relative",
              cursor: "pointer",
            }}
          >
            <NavIcon id={id} active={active} />
            {label}
            {active && (
              <span style={{
                position: "absolute",
                bottom: 4,
                width: 4, height: 4, borderRadius: "50%",
                background: ACCENT,
              }} />
            )}
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
  onTabChange,
}: {
  coberturas: Cobertura[]
  ranking: RankingItem[]
  minhaPosicao: number | null
  meuTotal: number
  onTabChange: (t: TabId) => void
}) {
  const { data: session } = useSession()
  const nome = session?.user?.name?.split(" ")[0] ?? "Equipe"
  const primeiroEvento = coberturas[0] ?? null

  const checklistPct = primeiroEvento && primeiroEvento._count.checklist > 0
    ? Math.round((primeiroEvento.checklist.filter((i) => i.concluido).length / primeiroEvento._count.checklist) * 100)
    : 0

  const maxUploads = ranking.length > 0 ? Math.max(...ranking.map(r => r.total), 1) : 1

  return (
    <div style={{ padding: "54px 18px 0" }}>
      {/* Row: greeting + avatar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>Olá, {nome} 👋</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Bem-vindo ao NuFlow.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 14, background: SOFT,
            display: "grid", placeItems: "center", color: "#BFF7D0", fontSize: 16, fontWeight: 700,
          }}>
            {session?.user?.name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 11.5, color: MUTED, background: "transparent", border: 0, cursor: "pointer",
            }}
          >
            <LogOut style={{ width: 13, height: 13 }} />
            Sair
          </button>
        </div>
      </div>

      {/* Hero event card */}
      <div style={{ fontSize: 13, color: MUTED, fontWeight: 650, margin: "0 0 9px" }}>Evento do dia</div>
      {primeiroEvento ? (
        <div style={{
          height: 274,
          borderRadius: 26,
          overflow: "hidden",
          background: "linear-gradient(135deg, rgba(0,65,98,.86), rgba(0,165,138,.44)), url('https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=900&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          border: "1px solid rgba(0,165,138,.34)",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 18px 40px rgba(0,165,138,.18), inset 0 1px 0 rgba(255,255,255,.08)",
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "7px 12px", borderRadius: 999,
            background: "rgba(0,165,138,.18)", color: "#BFF7D0",
            fontSize: 12, fontWeight: 700, width: "max-content",
          }}>
            {primeiroEvento.status === "em_andamento" ? "Evento de hoje" : primeiroEvento.status}
          </span>
          <h2 style={{
            fontSize: 27, lineHeight: 1.02, letterSpacing: "-.04em", fontWeight: 730,
            margin: "12px 0 9px", maxWidth: 295, color: TEXT,
          }}>
            {primeiroEvento.titulo}
          </h2>
          <div style={{ fontSize: 15, fontWeight: 570, color: "rgba(234,244,244,.84)", marginBottom: 8 }}>
            {[primeiroEvento.local, primeiroEvento.cidade].filter(Boolean).join(" · ")}
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(234,244,244,.72)", marginTop: 2 }}>
            ◷ {formatDate(primeiroEvento.dataInicio)} – {formatDate(primeiroEvento.dataFim)} · Checklist {checklistPct}%
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: "auto" }}>
            <button
              onClick={() => onTabChange("eventos")}
              style={{
                height: 51, borderRadius: 16,
                border: "1px solid rgba(234,244,244,.20)",
                background: "rgba(234,244,244,.11)",
                color: "white", fontWeight: 670,
                backdropFilter: "blur(14px)",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ☁️ Upload
            </button>
            <button
              onClick={() => onTabChange("eventos")}
              style={{
                height: 51, borderRadius: 16,
                border: "1px solid rgba(234,244,244,.20)",
                background: "rgba(234,244,244,.11)",
                color: "white", fontWeight: 670,
                backdropFilter: "blur(14px)",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Detalhes ›
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          height: 160, borderRadius: 26, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 10,
          border: `1px dashed ${LINE}`, background: "rgba(234,244,244,.025)",
        }}>
          <CalendarRange style={{ width: 32, height: 32, color: MUTED }} />
          <p style={{ fontSize: 13, color: MUTED }}>Nenhum evento ativo</p>
        </div>
      )}

      {/* Ranking */}
      {ranking.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: MUTED, fontWeight: 650, margin: "18px 0 9px" }}>Ranking da semana</div>
          <div style={{
            borderRadius: 24, border: `1px solid ${LINE}`,
            background: "linear-gradient(180deg,rgba(234,244,244,.05),rgba(234,244,244,.02))",
            padding: 16, marginBottom: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <b style={{ color: TEXT }}>Videomakers</b>
                <div style={{ fontSize: 11, color: MUTED }}>Gamificação por entrega</div>
              </div>
              <div style={{
                width: 38, height: 38, borderRadius: 14, background: SOFT,
                display: "grid", placeItems: "center", color: "#BFF7D0", fontSize: 18,
              }}>🏆</div>
            </div>
            {minhaPosicao && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 12, marginBottom: 10,
                background: SOFT, border: `1px solid rgba(0,165,138,.3)`,
              }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>#{minhaPosicao}</span>
                <span style={{ fontSize: 13, color: TEXT }}>Você esta semana</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: ACCENT }}>{meuTotal} upload(s)</span>
              </div>
            )}
            {ranking.slice(0, 5).map((r) => (
              <div key={r.videomakerId} style={{
                display: "grid", gridTemplateColumns: "24px 34px 1fr auto",
                gap: 10, alignItems: "center", padding: "8px 0",
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 999,
                  background: "rgba(234,244,244,.055)",
                  display: "grid", placeItems: "center",
                  fontSize: 11, color: "#cdd2df",
                }}>
                  {r.posicao}
                </div>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: `linear-gradient(135deg, #0F3F48, #06142E)`,
                  display: "grid", placeItems: "center",
                  fontSize: 15, color: TEXT,
                  border: `1px solid ${LINE}`,
                }}>
                  {r.nome.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 650, color: r.isMeu ? TEXT : MUTED }}>{r.nome}</div>
                  <div style={{ height: 4, borderRadius: 999, background: "rgba(234,244,244,.08)", marginTop: 5, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 999,
                      background: `linear-gradient(90deg, ${ACCENT}, ${GREEN})`,
                      width: `${Math.round((r.total / maxUploads) * 100)}%`,
                    }} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#d9dce7" }}>{r.total} pts</div>
              </div>
            ))}
          </div>
        </>
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

  // ── Wallet state ──
  const [positions, setPositions] = useState<number[]>([])
  useEffect(() => {
    setPositions(coberturas.map((_, i) => i))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coberturas.length])

  function bringToFront(index: number) {
    setPositions((prev) => {
      const pos = prev[index]
      if (pos === 0) return prev
      return prev.map((p) => (p < pos ? p + 1 : p === pos ? 0 : p))
    })
  }

  const POS_STYLES: Record<number, React.CSSProperties> = {
    0: { top: 0, height: 315, zIndex: 40, filter: "saturate(1.05) brightness(1.03)", transform: "scale(1)" },
    1: { top: 286, height: 142, zIndex: 30, filter: "saturate(.95) brightness(.88)", transform: "scale(.992)" },
    2: { top: 410, height: 142, zIndex: 20, filter: "saturate(.90) brightness(.82)", transform: "scale(.982)" },
    3: { top: 534, height: 142, zIndex: 10, filter: "saturate(.86) brightness(.76)", transform: "scale(.972)" },
  }

  const THEMES = [
    "linear-gradient(135deg, rgba(0,65,98,.90), rgba(0,165,138,.50))",
    "linear-gradient(135deg, #004162, #007284)",
    "linear-gradient(135deg, #014651, #00A58A)",
    "linear-gradient(135deg, #161514, #014651)",
  ]

  const activeIndex = positions.indexOf(0)
  const activeCobertura = coberturas[activeIndex] ?? coberturas[0] ?? null

  // derive panel state from the active card
  const dia = diaAtivo[activeCobertura?.id ?? ""] ?? 1
  const currentSubTab = subTab[activeCobertura?.id ?? ""] ?? "checklist"

  const checklistDia = activeCobertura ? activeCobertura.checklist.filter((item) => item.dia === dia) : []
  const checklistConcluidos = checklistDia.filter((i) => i.concluido).length
  const checklistPct = checklistDia.length > 0 ? Math.round((checklistConcluidos / checklistDia.length) * 100) : 0
  const uploadsDia = activeCobertura ? activeCobertura.uploads.filter((u) => u.dia === dia) : []

  const checklistPorCategoria: Record<string, ChecklistItem[]> = {}
  for (const item of checklistDia) {
    if (!checklistPorCategoria[item.categoria]) checklistPorCategoria[item.categoria] = []
    checklistPorCategoria[item.categoria].push(item)
  }

  return (
    <div style={{ padding: "54px 18px 0" }}>
      {/* Intro row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 32, lineHeight: .98, letterSpacing: "-.045em", margin: 0, fontWeight: 700, color: TEXT }}>
            Eventos
          </h2>
          <p style={{ fontSize: 13, color: MUTED, margin: "8px 0 0" }}>
            {coberturas.length > 0 ? `${coberturas.length} evento(s) ativo(s)` : "Nenhum evento ativo"}
          </p>
        </div>
        <div style={{
          width: 58, height: 58, borderRadius: 24,
          border: `1px solid rgba(0,165,138,.55)`,
          background: "rgba(0,165,138,.07)",
          fontSize: 24, color: "#BFF7D0",
          display: "grid", placeItems: "center",
        }}>🎬</div>
      </div>

      {coberturas.length === 0 ? (
        <div style={{
          height: 200, borderRadius: 26, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 12,
          border: `1px dashed ${LINE}`, background: "rgba(234,244,244,.025)",
        }}>
          <CalendarRange style={{ width: 36, height: 36, color: MUTED }} />
          <p style={{ fontSize: 13, color: MUTED }}>Você não está escalado em nenhum evento</p>
        </div>
      ) : (
        <>
          {/* Wallet stage */}
          <div style={{
            height: 620,
            border: `1px solid ${LINE}`,
            borderRadius: 34,
            background: "linear-gradient(180deg,rgba(234,244,244,.04),rgba(234,244,244,.015))",
            overflow: "hidden",
            position: "relative",
            marginBottom: 20,
          }}>
            {coberturas.slice(0, 4).map((c, index) => {
              const pos = positions[index] ?? index
              const cChecklistDia = c.checklist.filter((i) => i.dia === (diaAtivo[c.id] ?? 1))
              const cPct = cChecklistDia.length > 0
                ? Math.round((cChecklistDia.filter((i) => i.concluido).length / cChecklistDia.length) * 100)
                : 0
              const isActive = pos === 0
              return (
                <article
                  key={c.id}
                  style={{
                    position: "absolute",
                    left: 0, right: 0,
                    borderRadius: 27,
                    overflow: "hidden",
                    border: `1px solid ${LINE}`,
                    boxShadow: "0 18px 46px rgba(0,0,0,.38)",
                    background: THEMES[index % 4],
                    transition: "top .55s cubic-bezier(.22,1,.36,1), height .55s cubic-bezier(.22,1,.36,1), transform .55s cubic-bezier(.22,1,.36,1), filter .25s ease",
                    cursor: pos !== 0 ? "pointer" : "default",
                    ...POS_STYLES[Math.min(pos, 3)],
                  }}
                  onClick={() => { if (pos !== 0) bringToFront(index) }}
                >
                  {isActive ? (
                    /* Expanded card */
                    <div style={{ padding: "22px 20px 16px", height: "100%", display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center",
                          padding: "6px 12px", borderRadius: 999,
                          background: "rgba(0,165,138,.22)", color: "#BFF7D0",
                          fontSize: 11.5, fontWeight: 700,
                        }}>
                          {c.status === "em_andamento" ? "Em andamento" : c.status}
                        </span>
                        <span style={{ fontSize: 12, color: "rgba(234,244,244,.7)" }}>
                          {formatDate(c.dataInicio)}
                        </span>
                      </div>
                      <h3 style={{
                        fontSize: 26, lineHeight: 1.02, letterSpacing: "-.04em",
                        fontWeight: 730, color: TEXT, margin: "0 0 8px", maxWidth: 280,
                      }}>
                        {c.titulo}
                      </h3>
                      {(c.local || c.cidade) && (
                        <div style={{ fontSize: 14, fontWeight: 570, color: "rgba(234,244,244,.8)", marginBottom: 6 }}>
                          📍 {[c.local, c.cidade].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: "rgba(234,244,244,.6)", marginBottom: 14 }}>
                        ✓ Checklist {cPct}% · {c._count.uploads} upload(s)
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: "auto" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSubTab((p) => ({ ...p, [c.id]: "upload" })) }}
                          style={{
                            height: 46, borderRadius: 14,
                            border: "1px solid rgba(234,244,244,.22)",
                            background: "rgba(234,244,244,.12)",
                            color: "white", fontWeight: 670,
                            backdropFilter: "blur(14px)", cursor: "pointer", fontSize: 13,
                          }}
                        >
                          ☁️ Upload
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSubTab((p) => ({ ...p, [c.id]: "checklist" })) }}
                          style={{
                            height: 46, borderRadius: 14,
                            border: "1px solid rgba(234,244,244,.22)",
                            background: "rgba(0,165,138,.22)",
                            color: "white", fontWeight: 670,
                            backdropFilter: "blur(14px)", cursor: "pointer", fontSize: 13,
                          }}
                        >
                          ✓ Checklist
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Collapsed card */
                    <div style={{
                      padding: "44px 20px 16px", height: "100%",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: "rgba(234,244,244,.55)", marginBottom: 4 }}>
                          {c.status}
                        </div>
                        <div style={{
                          fontSize: 18, fontWeight: 700, color: TEXT,
                          letterSpacing: "-.03em", whiteSpace: "nowrap",
                          overflow: "hidden", textOverflow: "ellipsis", maxWidth: "70vw",
                        }}>
                          {c.titulo}
                        </div>
                        {c.cidade && (
                          <div style={{ fontSize: 12, color: "rgba(234,244,244,.55)", marginTop: 4 }}>
                            📍 {c.cidade}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 22, opacity: .7 }}>›</div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          {/* Detail panel for active card */}
          {activeCobertura && (
            <div style={{
              borderRadius: 24, border: `1px solid ${LINE}`,
              background: "rgba(234,244,244,.03)", overflow: "hidden",
            }}>
              {/* Sub-tabs */}
              <div style={{
                display: "flex",
                borderBottom: `1px solid ${LINE}`,
              }}>
                {(["checklist", "upload", "galeria"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setSubTab((p) => ({ ...p, [activeCobertura.id]: st }))}
                    style={{
                      flex: 1, padding: "12px 4px", fontSize: 12.5, fontWeight: 600,
                      background: "transparent", border: 0,
                      borderBottom: currentSubTab === st ? `2px solid ${ACCENT}` : "2px solid transparent",
                      color: currentSubTab === st ? ACCENT : MUTED,
                      cursor: "pointer",
                    }}
                  >
                    {st === "checklist" ? "✓ Checklist" : st === "upload" ? "↑ Upload" : "◻ Galeria"}
                  </button>
                ))}
              </div>

              {/* Seletor de dia */}
              {activeCobertura.totalDias > 1 && (
                <div style={{ display: "flex", gap: 8, padding: "12px 16px 4px", overflowX: "auto", scrollbarWidth: "none" }}>
                  {Array.from({ length: activeCobertura.totalDias }, (_, i) => i + 1).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDiaAtivo((p) => ({ ...p, [activeCobertura.id]: d }))}
                      style={{
                        flexShrink: 0, padding: "5px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                        background: dia === d ? ACCENT : "rgba(234,244,244,.08)",
                        color: dia === d ? "#fff" : MUTED,
                        border: 0, cursor: "pointer",
                      }}
                    >
                      Dia {d}
                    </button>
                  ))}
                </div>
              )}

              {/* Checklist */}
              {currentSubTab === "checklist" && (
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: MUTED }}>{checklistConcluidos}/{checklistDia.length} concluídos</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>{checklistPct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: "rgba(234,244,244,.08)", marginBottom: 14, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${ACCENT}, ${GREEN})`, width: `${checklistPct}%`, transition: "width .3s" }} />
                  </div>
                  {Object.entries(checklistPorCategoria).map(([cat, items]) => (
                    <div key={cat} style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, color: cat === "equipamento" ? "#60a5fa" : cat === "logistica" ? "#fbbf24" : cat === "conteudo" ? "#c084fc" : GREEN }}>
                        {getCategoriaLabel(cat)}
                      </p>
                      {items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleToggleChecklist(activeCobertura.id, item.id, item.concluido)}
                          disabled={togglingItem === item.id}
                          style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 12px", borderRadius: 14, marginBottom: 6,
                            background: item.concluido ? "rgba(0,165,138,.1)" : "rgba(234,244,244,.04)",
                            border: `1px solid ${item.concluido ? "rgba(0,165,138,.25)" : LINE}`,
                            cursor: "pointer",
                          }}
                        >
                          {togglingItem === item.id
                            ? <Loader2 style={{ width: 16, height: 16, flexShrink: 0, color: ACCENT }} className="animate-spin" />
                            : item.concluido
                              ? <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0, color: ACCENT }} />
                              : <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(234,244,244,.25)", flexShrink: 0 }} />
                          }
                          <span style={{ fontSize: 13.5, color: item.concluido ? MUTED : TEXT, textDecoration: item.concluido ? "line-through" : "none", textAlign: "left" }}>
                            {item.texto}
                          </span>
                        </button>
                      ))}
                      {checklistDia.length === 0 && (
                        <p style={{ fontSize: 13, color: MUTED, textAlign: "center", padding: 16 }}>Sem itens para o Dia {dia}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Upload */}
              {currentSubTab === "upload" && (
                <div style={{ padding: 16 }}>
                  <p style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>Upload para o Dia {dia}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <button
                      onClick={() => {
                        setUploadingFor(`${activeCobertura.id}-foto`)
                        fileInputRef.current?.setAttribute("data-cobertura", activeCobertura.id)
                        fileInputRef.current?.setAttribute("data-tipo", "foto")
                        fileInputRef.current?.setAttribute("accept", "image/*")
                        fileInputRef.current?.removeAttribute("multiple")
                        fileInputRef.current?.setAttribute("multiple", "true")
                        fileInputRef.current?.click()
                      }}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                        padding: "18px 4px", borderRadius: 18,
                        border: `1px dashed rgba(234,244,244,.22)`,
                        background: "rgba(234,244,244,.035)", cursor: "pointer",
                      }}
                    >
                      <Camera style={{ width: 26, height: 26, color: MUTED }} />
                      <span style={{ fontSize: 12, color: MUTED }}>Fotos</span>
                    </button>
                    <button
                      onClick={() => {
                        setUploadingFor(`${activeCobertura.id}-video`)
                        fileInputRef.current?.setAttribute("data-cobertura", activeCobertura.id)
                        fileInputRef.current?.setAttribute("data-tipo", "video")
                        fileInputRef.current?.setAttribute("accept", "video/*")
                        fileInputRef.current?.removeAttribute("multiple")
                        fileInputRef.current?.click()
                      }}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                        padding: "18px 4px", borderRadius: 18,
                        border: `1px dashed rgba(0,165,138,.35)`,
                        background: "rgba(0,165,138,.06)", cursor: "pointer",
                      }}
                    >
                      <Video style={{ width: 26, height: 26, color: ACCENT }} />
                      <span style={{ fontSize: 12, color: ACCENT }}>Vídeo</span>
                    </button>
                  </div>

                  {/* Upload progress bars */}
                  {Object.entries(uploading).filter(([k, v]) => k.startsWith(activeCobertura.id) && v).map(([key]) => (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: MUTED }}>Enviando...</span>
                        <span style={{ fontSize: 12, color: ACCENT }}>{uploadProgress[key] ?? 0}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: "rgba(234,244,244,.08)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${ACCENT}, ${GREEN})`, width: `${uploadProgress[key] ?? 0}%`, transition: "width .2s" }} />
                      </div>
                    </div>
                  ))}

                  {/* Recent uploads grid */}
                  {uploadsDia.length > 0 && (
                    <div>
                      <p style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Enviados — Dia {dia}</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                        {uploadsDia.slice(0, 9).map((up) => (
                          <div key={up.id} style={{ aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", background: "rgba(234,244,244,.06)" }}>
                            {up.thumbnailUrl
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={up.thumbnailUrl} alt={up.titulo ?? "Upload"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <Video style={{ width: 16, height: 16, color: MUTED }} />
                                </div>
                            }
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Galeria */}
              {currentSubTab === "galeria" && (
                <div style={{ padding: 16 }}>
                  {activeCobertura.uploads.length === 0 ? (
                    <p style={{ fontSize: 13, color: MUTED, textAlign: "center", padding: 24 }}>Nenhum upload ainda</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                      {activeCobertura.uploads.map((up) => (
                        <a key={up.id} href={up.url} target="_blank" rel="noreferrer"
                          style={{ display: "block", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", background: "rgba(234,244,244,.06)", position: "relative" }}>
                          {up.thumbnailUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={up.thumbnailUrl} alt={up.titulo ?? "Upload"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Video style={{ width: 14, height: 14, color: MUTED }} />
                              </div>
                          }
                          <div style={{ position: "absolute", bottom: 4, right: 4 }}>
                            <span style={{ fontSize: 9, background: "rgba(0,0,0,.65)", color: "white", padding: "1px 5px", borderRadius: 4 }}>D{up.dia}</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

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
          e.target.value = ""
          setUploadingFor(null)
        }}
      />
    </div>
  )
}

// ─── Tab Demandas ─────────────────────────────────────────────────────────────
const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  entrada:      { bg: "rgba(234,244,244,.08)", color: MUTED },
  em_andamento: { bg: "rgba(96,165,250,.15)",  color: "#93c5fd" },
  editando:     { bg: "rgba(167,139,250,.15)", color: "#c4b5fd" },
  revisao:      { bg: "rgba(251,191,36,.13)",  color: "#fcd34d" },
  aprovacao:    { bg: "rgba(251,146,60,.13)",  color: "#fdba74" },
  para_postar:  { bg: "rgba(52,211,153,.13)",  color: "#6ee7b7" },
  finalizado:   { bg: "rgba(0,165,138,.18)",   color: "#BFF7D0" },
}

function TabDemandas({ demandas }: { demandas: Demanda[] }) {
  return (
    <div style={{ padding: "54px 18px 0" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 32, lineHeight: .98, letterSpacing: "-.045em", margin: 0, fontWeight: 700, color: TEXT }}>
          Demandas
        </h2>
        <p style={{ fontSize: 13, color: MUTED, margin: "8px 0 0" }}>
          {demandas.length > 0 ? `${demandas.length} demanda(s) ativa(s)` : "Nenhuma demanda ativa"}
        </p>
      </div>

      {demandas.length === 0 && (
        <div style={{
          height: 200, borderRadius: 26, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 12,
          border: `1px dashed ${LINE}`, background: "rgba(234,244,244,.025)",
        }}>
          <FileText style={{ width: 36, height: 36, color: MUTED }} />
          <p style={{ fontSize: 13, color: MUTED }}>Nenhuma demanda ativa</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {demandas.map((d) => {
          const isVencida = d.dataLimite && new Date(d.dataLimite) < new Date()
          const pill = STATUS_PILL[d.statusVisivel] ?? { bg: "rgba(234,244,244,.08)", color: MUTED }
          return (
            <a
              key={d.id}
              href={`/demandas/${d.id}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "block", borderRadius: 18, padding: 14,
                background: "rgba(234,244,244,.035)",
                border: `1px solid ${LINE}`,
                textDecoration: "none",
              }}
            >
              {/* Status + prioridade */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <span style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 999, fontWeight: 700,
                  background: pill.bg, color: pill.color,
                }}>
                  {STATUS_LABEL[d.statusVisivel] ?? d.statusVisivel}
                </span>
                {d.prioridade && d.prioridade !== "normal" && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, textTransform: "uppercase",
                    color: d.prioridade === "urgente" ? "#f87171" : "#fb923c",
                  }}>
                    {d.prioridade}
                  </span>
                )}
              </div>

              <p style={{ fontSize: 10, color: MUTED, fontFamily: "monospace", marginBottom: 2 }}>{d.codigo}</p>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: "0 0 4px", lineHeight: 1.3 }}>{d.titulo}</h3>

              {d.produtos?.[0] && (
                <p style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>{d.produtos[0].produto.nome}</p>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {d.dataLimite && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: isVencida ? "#f87171" : MUTED }}>
                    <Clock style={{ width: 12, height: 12 }} />
                    {formatDate(d.dataLimite)}
                  </span>
                )}
                {(d.cidade || d.localGravacao) && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: MUTED }}>
                    <MapPin style={{ width: 12, height: 12 }} />
                    {d.cidade ?? d.localGravacao}
                  </span>
                )}
              </div>

              {/* Links de pastas */}
              {(d.linkFolderBrutos || d.linkFolderFinal) && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {d.linkFolderBrutos && (
                    <a href={d.linkFolderBrutos} target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, fontSize: 10,
                        padding: "4px 10px", borderRadius: 8,
                        background: "rgba(234,244,244,.07)", color: MUTED, textDecoration: "none",
                      }}>
                      <ExternalLink style={{ width: 11, height: 11 }} /> Brutos
                    </a>
                  )}
                  {d.linkFolderFinal && (
                    <a href={d.linkFolderFinal} target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, fontSize: 10,
                        padding: "4px 10px", borderRadius: 8,
                        background: SOFT, color: ACCENT, textDecoration: "none",
                      }}>
                      <ExternalLink style={{ width: 11, height: 11 }} /> Final
                    </a>
                  )}
                </div>
              )}
            </a>
          )
        })}
      </div>
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
    <div style={{ padding: "54px 18px 0" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 32, lineHeight: .98, letterSpacing: "-.045em", margin: 0, fontWeight: 700, color: TEXT }}>
          Agenda
        </h2>
        <p style={{ fontSize: 13, color: MUTED, margin: "8px 0 0" }}>Próximos 7 dias</p>
      </div>

      {allItems.length === 0 && (
        <div style={{
          height: 200, borderRadius: 26, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 12,
          border: `1px dashed ${LINE}`, background: "rgba(234,244,244,.025)",
        }}>
          <Calendar style={{ width: 36, height: 36, color: MUTED }} />
          <p style={{ fontSize: 13, color: MUTED }}>Nada agendado nos próximos 7 dias</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {allItems.map((item) => {
          const dt = new Date(item.inicio)
          const isHoje = dt.toDateString() === hoje.toDateString()
          const mesLabel = dt.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()

          return (
            <div
              key={`${item.tipo}-${item.id}`}
              style={{
                borderRadius: 18, padding: 14,
                background: "rgba(234,244,244,.035)",
                border: `1px solid ${isHoje ? "rgba(0,165,138,.45)" : LINE}`,
                boxShadow: isHoje ? `0 0 0 1px ${SOFT}` : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                {/* Date badge */}
                <div style={{
                  flexShrink: 0, borderRadius: 14, padding: "8px 10px", textAlign: "center", minWidth: 48,
                  background: isHoje ? ACCENT : "rgba(234,244,244,.07)",
                }}>
                  <p style={{ fontSize: 9.5, color: "rgba(255,255,255,.7)", lineHeight: 1, marginBottom: 2 }}>{mesLabel}</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: TEXT, lineHeight: 1 }}>{dt.getDate()}</p>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    {isHoje && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: ACCENT, letterSpacing: ".04em" }}>HOJE</span>
                    )}
                    <span style={{
                      fontSize: 10.5, padding: "2px 8px", borderRadius: 999, fontWeight: 600,
                      background: item.tipo === "cobertura" ? SOFT : "rgba(234,244,244,.07)",
                      color: item.tipo === "cobertura" ? ACCENT : MUTED,
                    }}>
                      {item.tipo === "cobertura" ? "Cobertura" : "Evento"}
                    </span>
                    <span style={{ fontSize: 11, color: MUTED }}>{formatTime(item.inicio)}</span>
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.titulo}
                  </h3>
                  {item.local && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, fontSize: 12, color: MUTED }}>
                      <MapPin style={{ width: 12, height: 12, flexShrink: 0 }} />
                      {item.local}
                    </div>
                  )}
                </div>

                {/* Accent dot for today */}
                {isHoje && (
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: ACCENT, flexShrink: 0, marginTop: 4 }} />
                )}
              </div>
            </div>
          )
        })}
      </div>
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
  const [activeGaleriaTab, setActiveGaleriaTab] = useState<"feed" | "minha">("feed")

  return (
    <div style={{ padding: "54px 18px 0" }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 32, lineHeight: .98, letterSpacing: "-.045em", margin: 0, fontWeight: 700, color: TEXT }}>
          Galeria
        </h2>
        <p style={{ fontSize: 13, color: MUTED, margin: "8px 0 0" }}>
          Links e busca por rosto
        </p>
      </div>

      {/* Sub-tab pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {(["feed", "minha"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveGaleriaTab(t)}
            style={{
              padding: "7px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600,
              background: activeGaleriaTab === t ? SOFT : "rgba(234,244,244,.06)",
              color: activeGaleriaTab === t ? ACCENT : MUTED,
              border: `1px solid ${activeGaleriaTab === t ? "rgba(0,165,138,.35)" : LINE}`,
              cursor: "pointer",
            }}
          >
            {t === "feed" ? "Eventos" : "Minha Galeria"}
          </button>
        ))}
      </div>

      {coberturas.length === 0 && (
        <div style={{
          height: 200, borderRadius: 26, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 12,
          border: `1px dashed ${LINE}`, background: "rgba(234,244,244,.025)",
        }}>
          <Images style={{ width: 36, height: 36, color: MUTED }} />
          <p style={{ fontSize: 13, color: MUTED }}>Nenhum evento disponível</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {coberturas.map((c, idx) => {
          const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/e/${c.slug}`
          const hasUploads = c._count.uploads > 0

          return (
            <div
              key={c.id}
              style={{
                borderRadius: 22, overflow: "hidden",
                border: `1px solid ${LINE}`,
              }}
            >
              {/* Hero strip with gradient */}
              <div style={{
                height: idx === 0 ? 140 : 90,
                background: idx === 0
                  ? "linear-gradient(135deg, rgba(0,65,98,.9), rgba(0,165,138,.55))"
                  : "linear-gradient(135deg, rgba(0,40,60,.9), rgba(0,90,80,.6))",
                padding: "16px 18px",
                display: "flex", flexDirection: "column", justifyContent: "flex-end",
              }}>
                <h3 style={{ fontSize: idx === 0 ? 18 : 15, fontWeight: 730, color: TEXT, margin: 0, letterSpacing: "-.03em" }}>
                  {c.titulo}
                </h3>
                {c.cidade && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 12, color: "rgba(234,244,244,.72)" }}>
                    <MapPin style={{ width: 11, height: 11 }} />
                    {c.cidade} · {hasUploads ? `${c._count.uploads} upload(s)` : "Sem uploads"}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ padding: "12px 14px", background: "rgba(234,244,244,.025)", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Link row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: MUTED, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                    /e/{c.slug}
                  </span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Link copiado!") }}
                    style={{
                      flexShrink: 0, padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                      background: SOFT, color: ACCENT, border: 0, cursor: "pointer",
                    }}
                  >
                    Copiar
                  </button>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flexShrink: 0, padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                      background: "rgba(234,244,244,.07)", color: MUTED, textDecoration: "none",
                    }}
                  >
                    Abrir
                  </a>
                </div>

                {/* Face search button */}
                {activeGaleriaTab === "minha" && (
                  <button
                    onClick={() => setFaceSearchTarget({ slug: c.slug, titulo: c.titulo })}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      padding: "12px 0", borderRadius: 14,
                      border: `1px dashed rgba(0,165,138,.4)`, background: "transparent",
                      color: ACCENT, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    <Search style={{ width: 16, height: 16 }} />
                    🔍 Buscar por Rosto
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

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
      className="fixed inset-0 overflow-hidden"
      style={{
        background: "radial-gradient(circle at 50% -10%, rgba(0,165,138,.18), transparent 36%), #06142E",
      }}
    >
      {/* Conteúdo scrollable — sem header fixo */}
      <main className="absolute inset-0 overflow-y-auto" style={{ paddingBottom: 96 }}>
        {tab === "inicio" && (
          <TabInicio
            coberturas={coberturas}
            ranking={ranking}
            minhaPosicao={minhaPosicao}
            meuTotal={meuTotal}
            onTabChange={setTab}
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
