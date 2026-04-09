"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import {
  ArrowLeft, Film, MapPin, Phone, Mail, Star, Edit2, Save, X,
  AlertTriangle, QrCode, Copy, ExternalLink, DollarSign, Share2, Lock, Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { TagInput } from "@/components/ui/TagInput"
import { MoneyDisplay } from "@/components/ui/MoneyDisplay"
import { toast } from "sonner"
import { VideomakerPerformance } from "@/components/VideomakerPerformance"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const statusConfig: Record<string, { label: string; class: string }> = {
  ativo: { label: "Ativo", class: "bg-green-500/20 text-green-300 border border-green-700" },
  inativo: { label: "Inativo", class: "bg-zinc-700/50 text-zinc-400 border border-zinc-600" },
}

const HABILIDADES_SUGESTOES = [
  "Edição", "Motion Graphics", "Colorização", "3D", "IA Maker",
  "Trilha Sonora", "Animação", "Podcast", "Roteiro", "Narração",
  "After Effects", "Premiere", "DaVinci Resolve", "Final Cut", "Illustrator",
  "Captação com câmera", "Captação com celular", "Fotos", "Drone",
]

const specs = ["institucional", "motion", "aftermovie", "social_media", "reels", "ads", "vsl", "tutorial"]
const areas = ["eventos", "institucional", "ads", "social_media", "reels", "aftermovie", "corporativo"]

export default function EditorDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const userTipo = (session?.user as { tipo?: string } | undefined)?.tipo
  const isPrivileged = userTipo === "admin" || userTipo === "gestor"

  const { data, mutate } = useSWR(`/api/editores/${id}`, fetcher)
  const editor = data?.editor

  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>({})

  // Avaliacao
  const [notaHover, setNotaHover] = useState(0)
  const [nota, setNota] = useState(0)
  const [comentarioAvaliacao, setComentarioAvaliacao] = useState("")
  const [enviandoAvaliacao, setEnviandoAvaliacao] = useState(false)
  const { data: dataAvaliacoes, mutate: mutateAvaliacoes } = useSWR(
    id ? `/api/editores/${id}/avaliar` : null, fetcher
  )

  // Lista Negra
  const [showNegraModal, setShowNegraModal] = useState(false)
  const [motivoNegra, setMotivoNegra] = useState("")
  const [loadingNegra, setLoadingNegra] = useState(false)

  // QR
  const [showQR, setShowQR] = useState(false)
  const [QRCode, setQRCode] = useState<React.ComponentType<{ value: string; size?: number; bgColor?: string; fgColor?: string; level?: string }> | null>(null)

  async function loadQR() {
    if (!QRCode) {
      const mod = await import("qrcode.react")
      setQRCode(mod.QRCodeSVG as React.ComponentType<{ value: string; size?: number; bgColor?: string; fgColor?: string; level?: string }>)
    }
    setShowQR(true)
  }

  const avaliacaoUrl = typeof window !== "undefined"
    ? `${window.location.origin}/avaliar-editor/${id}`
    : ""

  function startEdit() {
    if (!editor) return
    setForm({
      nome: editor.nome ?? "",
      cidade: editor.cidade ?? "",
      estado: editor.estado ?? "",
      telefone: editor.telefone ?? "",
      whatsapp: editor.whatsapp ?? "",
      email: editor.email ?? "",
      salario: editor.salario?.toString() ?? "",
      cargaLimite: editor.cargaLimite?.toString() ?? "5",
      status: editor.status ?? "ativo",
      cpfCnpj: editor.cpfCnpj ?? "",
      chavePix: editor.chavePix ?? "",
      observacoes: editor.observacoes ?? "",
      portfolio: editor.portfolio ?? "",
      habilidades: editor.habilidades ?? [],
      areasAtuacao: editor.areasAtuacao ?? [],
      especialidade: editor.especialidade ?? [],
    })
    setEditing(true)
  }

  async function saveEdit() {
    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        ...form,
        cargaLimite: Number(form.cargaLimite),
      }
      if (isPrivileged && form.salario !== undefined && form.salario !== "") {
        payload.salario = Number(form.salario)
      } else {
        delete payload.salario
      }
      const res = await fetch(`/api/editores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Dados salvos!")
      setEditing(false)
      mutate()
    } catch (err) {
      toast.error(String(err))
    } finally { setLoading(false) }
  }

  async function enviarAvaliacao() {
    if (nota === 0) return
    setEnviandoAvaliacao(true)
    try {
      const res = await fetch(`/api/editores/${id}/avaliar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota, comentario: comentarioAvaliacao, origem: "interno" }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Avaliacao registrada!")
      setNota(0); setComentarioAvaliacao("")
      mutateAvaliacoes(); mutate()
    } catch (err) {
      toast.error(String(err))
    } finally { setEnviandoAvaliacao(false) }
  }

  async function handleToggleFazCaptacao() {
    try {
      const res = await fetch(`/api/editores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazCaptacao: !editor.fazCaptacao }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(editor.fazCaptacao ? "Captação desabilitada" : "Editor pode fazer captação agora")
      mutate()
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function aplicarListaNegra() {
    setLoadingNegra(true)
    try {
      const res = await fetch(`/api/editores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emListaNegra: !editor.emListaNegra, listaNegraMotivo: motivoNegra || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(editor.emListaNegra ? "Removido da lista negra" : "Adicionado a lista negra")
      setShowNegraModal(false); setMotivoNegra("")
      mutate()
    } catch (err) {
      toast.error(String(err))
    } finally { setLoadingNegra(false) }
  }

  if (!editor) {
    return (
      <>
        <Header title="Editor" />
        <main className="flex-1 p-6 flex items-center justify-center text-zinc-400">
          <div className="animate-pulse">Carregando...</div>
        </main>
      </>
    )
  }

  const cfg = statusConfig[editor.status] ?? statusConfig.ativo
  const avaliacoes = dataAvaliacoes?.avaliacoes ?? (dataAvaliacoes?.editor ? [] : [])
  const habilidadesForm = (form.habilidades as string[]) ?? []
  const areasForm = (form.areasAtuacao as string[]) ?? []
  const especialidadeForm = (form.especialidade as string[]) ?? []

  const carga = editor.demandas?.filter((d: { statusVisivel: string }) =>
    d.statusVisivel !== "finalizado" && d.statusVisivel !== "encerrado"
  ).length ?? 0
  const pct = Math.min((carga / Math.max(editor.cargaLimite, 1)) * 100, 100)
  const cargaStatus = pct >= 100 ? "sobrecarga" : pct >= 75 ? "atencao" : "ok"

  return (
    <>
      <Header
        title={editor.nome}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg px-3 py-2"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            {!editing ? (
              <>
                <Link
                  href={`/demandas/nova?editorId=${id}&editorNome=${encodeURIComponent(editor.nome)}`}
                  className="flex items-center gap-1.5 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg px-3 py-2"
                >
                  <Plus className="w-4 h-4" /> Nova Demanda
                </Link>
                <button
                  onClick={loadQR}
                  className="flex items-center gap-1.5 text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg px-3 py-2"
                >
                  <QrCode className="w-4 h-4" /> QR Avaliacao
                </button>
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 text-sm bg-purple-600 text-white hover:bg-purple-700 rounded-lg px-3 py-2"
                >
                  <Edit2 className="w-4 h-4" /> Editar
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 text-sm border border-zinc-700 rounded-lg px-3 py-2 text-zinc-400"
                >
                  <X className="w-4 h-4" /> Cancelar
                </button>
                <button
                  onClick={saveEdit}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg px-3 py-2 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" /> {loading ? "Salvando..." : "Salvar"}
                </button>
              </>
            )}
          </div>
        }
      />

      <main className="flex-1 p-6 max-w-4xl space-y-6">
        {/* Performance */}
        <VideomakerPerformance videomakerId={editor.id} tipo="interno" />

        {/* Lista Negra Banner */}
        {editor.emListaNegra && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-300">Na Lista Negra</p>
              {editor.listaNegraMotivo && (
                <p className="text-sm text-red-400 mt-0.5">{editor.listaNegraMotivo}</p>
              )}
            </div>
            <button
              onClick={() => setShowNegraModal(true)}
              className="text-xs border border-red-700 text-red-400 hover:bg-red-900/30 px-3 py-1.5 rounded-lg"
            >
              Remover
            </button>
          </div>
        )}

        {/* Perfil */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-purple-900/50 border border-purple-800 flex items-center justify-center text-2xl font-bold text-purple-400">
                {editor.nome?.charAt(0)}
              </div>
              <div>
                {editing ? (
                  <input
                    value={form.nome as string}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="text-xl font-bold border border-zinc-700 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-white"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-white">{editor.nome}</h2>
                )}
                <div className="flex items-center gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={cn("w-4 h-4", n <= Math.round(editor.avaliacao ?? 0) ? "text-yellow-400 fill-yellow-400" : "text-zinc-700")} />
                  ))}
                  <span className="text-sm text-zinc-500 ml-1">{(editor.avaliacao ?? 0).toFixed(1)}</span>
                  <span className="text-xs text-zinc-600 ml-1">({avaliacoes.length} aval.)</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editing ? (
                <select
                  value={form.status as string}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="text-sm border border-zinc-700 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-200"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              ) : (
                <span className={cn("text-xs font-medium px-3 py-1 rounded-full", cfg.class)}>
                  {cfg.label}
                </span>
              )}
              {!editing && !editor.emListaNegra && (
                <button
                  onClick={() => setShowNegraModal(true)}
                  className="flex items-center gap-1 text-xs border border-red-900 text-red-500 hover:bg-red-900/20 px-2 py-1 rounded-lg transition-colors"
                  title="Lista Negra"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-zinc-400">
              <MapPin className="w-4 h-4 text-zinc-600 shrink-0" />
              {editing ? (
                <div className="flex gap-2 flex-1">
                  <input placeholder="Cidade" value={form.cidade as string} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className={inp} />
                  <input placeholder="UF" maxLength={2} value={form.estado as string} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} className={`${inp} w-16`} />
                </div>
              ) : (
                <span>{[editor.cidade, editor.estado].filter(Boolean).join(", ") || "—"}</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-zinc-400">
              <Phone className="w-4 h-4 text-zinc-600 shrink-0" />
              {editing ? (
                <input value={form.telefone as string} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={`${inp} flex-1`} placeholder="Telefone" />
              ) : (
                <span>{editor.telefone || "—"}</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-zinc-400">
              <Mail className="w-4 h-4 text-zinc-600 shrink-0" />
              {editing ? (
                <input type="email" value={form.email as string} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${inp} flex-1`} placeholder="E-mail" />
              ) : (
                <span>{editor.email || "—"}</span>
              )}
            </div>

            {(editor.whatsapp || editing) && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Phone className="w-4 h-4 text-zinc-600 shrink-0" />
                {editing ? (
                  <input value={form.whatsapp as string} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className={`${inp} flex-1`} placeholder="WhatsApp" />
                ) : (
                  <span>WhatsApp: {editor.whatsapp}</span>
                )}
              </div>
            )}

            {/* Salario - ONLY for admin/gestor */}
            {isPrivileged && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Lock className="w-4 h-4 text-zinc-600 shrink-0" />
                {editing ? (
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-xs text-zinc-500">R$</span>
                    <input type="number" value={form.salario as string} onChange={(e) => setForm({ ...form, salario: e.target.value })} className={`${inp} flex-1`} placeholder="Salario" />
                  </div>
                ) : (
                  <span className="font-semibold text-zinc-200 flex items-center gap-1">
                    Salario: <MoneyDisplay value={editor.salario} className="text-zinc-200" />
                  </span>
                )}
              </div>
            )}

            {(editor.cpfCnpj || editing) && (
              <div className="flex items-center gap-2 text-zinc-400">
                <span className="text-zinc-600 text-xs font-medium w-4">ID</span>
                {editing ? (
                  <input placeholder="CPF/CNPJ" value={form.cpfCnpj as string} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} className={`${inp} flex-1`} />
                ) : (
                  <span className="font-mono text-xs">{editor.cpfCnpj}</span>
                )}
              </div>
            )}

            {(editor.chavePix || editing) && (
              <div className="flex items-center gap-2 text-zinc-400">
                <span className="text-zinc-600 text-xs font-medium">PIX</span>
                {editing ? (
                  <input placeholder="Chave PIX" value={form.chavePix as string} onChange={(e) => setForm({ ...form, chavePix: e.target.value })} className={`${inp} flex-1`} />
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs truncate max-w-32">{editor.chavePix}</span>
                    <button onClick={() => { navigator.clipboard.writeText(editor.chavePix); toast.success("PIX copiado!") }} className="text-zinc-600 hover:text-zinc-400">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Carga */}
          <div className="mt-5">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-zinc-500">Carga atual</span>
              <span className={cn(
                "font-bold",
                cargaStatus === "sobrecarga" ? "text-red-400"
                  : cargaStatus === "atencao" ? "text-yellow-400"
                  : "text-green-400"
              )}>
                {carga}/{editing ? form.cargaLimite : editor.cargaLimite}
              </span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  cargaStatus === "sobrecarga" ? "bg-red-500"
                    : cargaStatus === "atencao" ? "bg-yellow-400"
                    : "bg-green-500"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            {editing && (
              <div className="mt-2">
                <label className="text-xs text-zinc-500">Limite de demandas</label>
                <input
                  type="number" min="1"
                  value={form.cargaLimite as string}
                  onChange={(e) => setForm({ ...form, cargaLimite: e.target.value })}
                  className="w-24 ml-2 border border-zinc-700 rounded-lg px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-200"
                />
              </div>
            )}
          </div>

          {/* Areas de atuacao */}
          {(editor.areasAtuacao?.length > 0 || editing) && (
            <div className="mt-5">
              <p className="text-xs text-zinc-500 font-medium uppercase mb-2">Areas de atuacao</p>
              {editing ? (
                <div className="flex flex-wrap gap-1.5">
                  {areas.map((a) => (
                    <button type="button" key={a} onClick={() => {
                      const arr = areasForm.includes(a) ? areasForm.filter(x => x !== a) : [...areasForm, a]
                      setForm({ ...form, areasAtuacao: arr })
                    }}
                      className={cn("text-xs px-2 py-1 rounded border transition-colors",
                        areasForm.includes(a) ? "bg-purple-600 border-purple-700 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      )}>
                      {a}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {editor.areasAtuacao?.map((a: string) => (
                    <span key={a} className="text-xs bg-purple-900/20 border border-purple-800 text-purple-300 px-2 py-0.5 rounded">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Especialidades */}
          {(editor.especialidade?.length > 0 || editing) && (
            <div className="mt-5">
              <p className="text-xs text-zinc-500 font-medium uppercase mb-2">Especialidades</p>
              {editing ? (
                <div className="flex flex-wrap gap-1.5">
                  {specs.map((s) => (
                    <button type="button" key={s} onClick={() => {
                      const arr = especialidadeForm.includes(s) ? especialidadeForm.filter(x => x !== s) : [...especialidadeForm, s]
                      setForm({ ...form, especialidade: arr })
                    }}
                      className={cn("text-xs px-2 py-1 rounded border transition-colors",
                        especialidadeForm.includes(s) ? "bg-purple-600 border-purple-700 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      )}>
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {editor.especialidade?.map((s: string) => (
                    <span key={s} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Habilidades */}
          <div className="mt-5">
            <p className="text-xs text-zinc-500 font-medium uppercase mb-2">Habilidades</p>
            {editing ? (
              <TagInput
                value={habilidadesForm}
                onChange={(tags) => setForm({ ...form, habilidades: tags })}
                suggestions={HABILIDADES_SUGESTOES}
                placeholder="Selecione ou adicione..."
              />
            ) : editor.habilidades?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {editor.habilidades.map((h: string) => (
                  <span key={h} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                    {h}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">Nenhuma habilidade cadastrada</p>
            )}
          </div>

          {/* Portfolio e observacoes (edit mode) */}
          {editing && (
            <div className="mt-5 grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Portfolio (URL)</label>
                <input value={form.portfolio as string} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} className={inp} placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Observacoes</label>
                <textarea value={form.observacoes as string} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2}
                  className={`${inp} resize-none`} />
              </div>
            </div>
          )}

          {!editing && (editor.portfolio || editor.observacoes) && (
            <div className="mt-5 space-y-2 text-sm">
              {editor.portfolio && (
                <div>
                  <span className="text-zinc-600 text-xs font-medium uppercase">Portfolio</span>
                  <a href={editor.portfolio} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-purple-400 hover:underline mt-0.5 truncate">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    {editor.portfolio}
                  </a>
                </div>
              )}
              {editor.observacoes && (
                <div>
                  <span className="text-zinc-600 text-xs font-medium uppercase">Observacoes</span>
                  <p className="text-zinc-400 mt-0.5">{editor.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Faz Captacao */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-200">Faz Captação</p>
              <p className="text-xs text-zinc-500 mt-0.5">Permite atribuir este editor como videomaker em demandas</p>
            </div>
            <button
              onClick={handleToggleFazCaptacao}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editor.fazCaptacao ? "bg-purple-600" : "bg-zinc-700"}`}
              title={editor.fazCaptacao ? "Clique para desabilitar captação" : "Clique para habilitar captação"}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editor.fazCaptacao ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        </div>

        {/* Avaliacao */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" />
              Avaliacoes ({avaliacoes.length})
            </h3>
            <button
              onClick={loadQR}
              className="flex items-center gap-1.5 text-xs border border-zinc-700 text-zinc-400 hover:bg-zinc-800 px-3 py-1.5 rounded-lg"
            >
              <Share2 className="h-3.5 w-3.5" />
              Link para cliente
            </button>
          </div>

          {/* Nova avaliacao */}
          <div className="bg-zinc-800/50 rounded-xl p-4 mb-5">
            <p className="text-xs text-zinc-500 font-medium mb-3">Registrar avaliacao interna</p>
            <div className="flex items-center gap-1 mb-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button"
                  onMouseEnter={() => setNotaHover(n)} onMouseLeave={() => setNotaHover(0)}
                  onClick={() => setNota(n)}
                  className="transition-transform hover:scale-110">
                  <Star className={cn("h-7 w-7", (notaHover || nota) >= n ? "text-yellow-400 fill-yellow-400" : "text-zinc-600")} />
                </button>
              ))}
            </div>
            <textarea
              value={comentarioAvaliacao}
              onChange={(e) => setComentarioAvaliacao(e.target.value)}
              placeholder="Comentario (opcional)..."
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 resize-none outline-none focus:ring-1 focus:ring-zinc-500 mb-3"
            />
            <button
              onClick={enviarAvaliacao}
              disabled={nota === 0 || enviandoAvaliacao}
              className="flex items-center gap-1.5 bg-white text-zinc-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Star className="h-3.5 w-3.5" />
              {enviandoAvaliacao ? "Salvando..." : "Registrar"}
            </button>
          </div>

          {/* Historico */}
          {avaliacoes.length === 0 ? (
            <p className="text-sm text-zinc-600 text-center py-4">Nenhuma avaliacao registrada ainda.</p>
          ) : (
            <div className="space-y-3">
              {avaliacoes.map((av: { id: string; nota: number; comentario?: string; origem: string; createdAt: string }) => (
                <div key={av.id} className="flex items-start gap-3 pb-3 border-b border-zinc-800 last:border-0">
                  <div className="flex gap-0.5 shrink-0 mt-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={cn("h-3.5 w-3.5", n <= av.nota ? "text-yellow-400 fill-yellow-400" : "text-zinc-700")} />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    {av.comentario && <p className="text-sm text-zinc-300">{av.comentario}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-zinc-600">{format(new Date(av.createdAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                      {av.origem === "qr_publico" && (
                        <span className="text-[10px] bg-blue-900/20 text-blue-400 border border-blue-800 px-1.5 rounded">QR Publico</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Historico de demandas */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <Film className="w-4 h-4 text-zinc-500" />
            Demandas ({editor.demandas?.length ?? 0})
          </h3>

          {editor.demandas?.length === 0 && (
            <p className="text-sm text-zinc-600 text-center py-6">Nenhuma demanda registrada.</p>
          )}

          <div className="space-y-1">
            {editor.demandas?.map((d: {
              id: string; codigo: string; titulo: string
              statusVisivel: string; prioridade: string; createdAt: string
            }) => (
              <Link key={d.id} href={`/demandas/${d.id}`}>
                <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors">
                  <Film className="w-4 h-4 text-zinc-600 shrink-0" />
                  <span className="font-mono text-xs text-zinc-500 shrink-0">{d.codigo}</span>
                  <span className="flex-1 text-sm text-zinc-300 truncate">{d.titulo}</span>
                  <span className="text-xs text-zinc-600 shrink-0">
                    {format(new Date(d.createdAt), "dd/MM/yy", { locale: ptBR })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>

      {/* Modal Lista Negra */}
      {showNegraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4">
            <h3 className="font-semibold text-white mb-1">
              {editor.emListaNegra ? "Remover da Lista Negra" : "Adicionar a Lista Negra"}
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              {editor.emListaNegra
                ? "Confirme a remocao deste profissional da lista negra."
                : "Este profissional nao podera ser atribuido a novas demandas."}
            </p>
            {!editor.emListaNegra && (
              <textarea
                value={motivoNegra}
                onChange={(e) => setMotivoNegra(e.target.value)}
                placeholder="Motivo (opcional)..."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 resize-none outline-none focus:ring-1 focus:ring-zinc-500 mb-4"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={aplicarListaNegra}
                disabled={loadingNegra}
                className={cn(
                  "flex-1 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50",
                  editor.emListaNegra ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                )}
              >
                {loadingNegra ? "Salvando..." : editor.emListaNegra ? "Remover da lista" : "Confirmar"}
              </button>
              <button
                onClick={() => { setShowNegraModal(false); setMotivoNegra("") }}
                className="flex-1 border border-zinc-700 text-zinc-300 text-sm py-2.5 rounded-xl hover:bg-zinc-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal QR */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl mx-4 text-center">
            <h3 className="font-semibold text-white mb-2">QR Code de Avaliacao</h3>
            <p className="text-sm text-zinc-400 mb-6">
              Compartilhe este QR Code para o cliente avaliar {editor.nome}
            </p>
            <div className="flex justify-center mb-6">
              <div className="bg-white p-4 rounded-xl">
                {QRCode ? (
                  <QRCode value={avaliacaoUrl} size={180} bgColor="#ffffff" fgColor="#18181b" level="M" />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center text-zinc-400 text-sm">Carregando...</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2 mb-4">
              <span className="flex-1 text-xs text-zinc-400 truncate">{avaliacaoUrl}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(avaliacaoUrl); toast.success("Link copiado!") }}
                className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <button onClick={() => setShowQR(false)} className="w-full border border-zinc-700 text-zinc-300 py-2 rounded-xl hover:bg-zinc-800 text-sm">
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

const inp = "w-full border border-zinc-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500"
