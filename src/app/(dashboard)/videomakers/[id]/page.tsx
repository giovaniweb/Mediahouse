"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import {
  ArrowLeft, Film, MapPin, Phone, Mail, Star, Edit2, Save, X,
  AlertTriangle, QrCode, Copy, ExternalLink, DollarSign, Share2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { TagInput } from "@/components/ui/TagInput"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const statusConfig: Record<string, { label: string; class: string }> = {
  preferencial: { label: "Preferencial", class: "bg-purple-500/20 text-purple-300 border border-purple-700" },
  ativo: { label: "Ativo", class: "bg-green-500/20 text-green-300 border border-green-700" },
  inativo: { label: "Inativo", class: "bg-zinc-700/50 text-zinc-400 border border-zinc-600" },
  pendente: { label: "Pendente", class: "bg-yellow-500/20 text-yellow-300 border border-yellow-700" },
}

const HABILIDADES_SUGESTOES = [
  "Edição", "Captação com câmera", "Captação com celular", "Fotos", "3D",
  "IA Maker", "Motion Graphics", "Colorização", "Trilha Sonora", "Drone",
  "Entrevista", "Documentário", "Live/Transmissão", "Animação", "Podcast",
  "Roteiro", "Narração",
]

export default function VideomakerDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data, mutate } = useSWR(`/api/videomakers/${id}`, fetcher)
  const vm = data?.videomaker

  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>({})

  // Avaliação
  const [notaHover, setNotaHover] = useState(0)
  const [nota, setNota] = useState(0)
  const [comentarioAvaliacao, setComentarioAvaliacao] = useState("")
  const [enviandoAvaliacao, setEnviandoAvaliacao] = useState(false)
  const { data: dataAvaliacoes, mutate: mutateAvaliacoes } = useSWR(
    id ? `/api/videomakers/${id}/avaliar` : null, fetcher
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
    ? `${window.location.origin}/avaliar/${id}`
    : ""

  function startEdit() {
    if (!vm) return
    setForm({
      nome: vm.nome ?? "",
      cidade: vm.cidade ?? "",
      estado: vm.estado ?? "",
      telefone: vm.telefone ?? "",
      email: vm.email ?? "",
      valorDiaria: vm.valorDiaria?.toString() ?? "",
      status: vm.status ?? "ativo",
      cpfCnpj: vm.cpfCnpj ?? "",
      chavePix: vm.chavePix ?? "",
      observacoes: vm.observacoes ?? "",
      portfolio: vm.portfolio ?? "",
      habilidades: vm.habilidades ?? [],
      areasAtuacao: vm.areasAtuacao ?? [],
    })
    setEditing(true)
  }

  async function saveEdit() {
    setLoading(true)
    try {
      const res = await fetch(`/api/videomakers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          valorDiaria: Number(form.valorDiaria),
        }),
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
      const res = await fetch(`/api/videomakers/${id}/avaliar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota, comentario: comentarioAvaliacao }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Avaliação registrada!")
      setNota(0); setComentarioAvaliacao("")
      mutateAvaliacoes(); mutate()
    } catch (err) {
      toast.error(String(err))
    } finally { setEnviandoAvaliacao(false) }
  }

  async function aplicarListaNegra() {
    setLoadingNegra(true)
    try {
      const res = await fetch(`/api/videomakers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emListaNegra: !vm.emListaNegra, listaNegraMotivo: motivoNegra || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(vm.emListaNegra ? "Removido da lista negra" : "Adicionado à lista negra")
      setShowNegraModal(false); setMotivoNegra("")
      mutate()
    } catch (err) {
      toast.error(String(err))
    } finally { setLoadingNegra(false) }
  }

  if (!vm) {
    return (
      <>
        <Header title="Videomaker" />
        <main className="flex-1 p-6 flex items-center justify-center text-zinc-400">
          <div className="animate-pulse">Carregando...</div>
        </main>
      </>
    )
  }

  const cfg = statusConfig[vm.status] ?? statusConfig.ativo
  const avaliacoes = dataAvaliacoes?.avaliacoes ?? []
  const habilidadesForm = (form.habilidades as string[]) ?? []
  const areasForm = (form.areasAtuacao as string[]) ?? []

  return (
    <>
      <Header
        title={vm.nome}
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
                <button
                  onClick={loadQR}
                  className="flex items-center gap-1.5 text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg px-3 py-2"
                >
                  <QrCode className="w-4 h-4" /> QR Avaliação
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
        {/* Lista Negra Banner */}
        {vm.emListaNegra && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-300">Na Lista Negra</p>
              {vm.listaNegraMotivo && (
                <p className="text-sm text-red-400 mt-0.5">{vm.listaNegraMotivo}</p>
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
                {vm.nome?.charAt(0)}
              </div>
              <div>
                {editing ? (
                  <input
                    value={form.nome as string}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="text-xl font-bold border border-zinc-700 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-white"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-white">{vm.nome}</h2>
                )}
                <div className="flex items-center gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={cn("w-4 h-4", n <= Math.round(vm.avaliacao ?? 0) ? "text-yellow-400 fill-yellow-400" : "text-zinc-700")} />
                  ))}
                  <span className="text-sm text-zinc-500 ml-1">{(vm.avaliacao ?? 0).toFixed(1)}</span>
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
                  <option value="preferencial">Preferencial</option>
                  <option value="inativo">Inativo</option>
                  <option value="pendente">Pendente</option>
                </select>
              ) : (
                <span className={cn("text-xs font-medium px-3 py-1 rounded-full", cfg.class)}>
                  {cfg.label}
                </span>
              )}
              {!editing && !vm.emListaNegra && (
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
                <span>{[vm.cidade, vm.estado].filter(Boolean).join(", ") || "—"}</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-zinc-400">
              <Phone className="w-4 h-4 text-zinc-600 shrink-0" />
              {editing ? (
                <input value={form.telefone as string} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={`${inp} flex-1`} />
              ) : (
                <span>{vm.telefone || "—"}</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-zinc-400">
              <Mail className="w-4 h-4 text-zinc-600 shrink-0" />
              {editing ? (
                <input type="email" value={form.email as string} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${inp} flex-1`} />
              ) : (
                <span>{vm.email || "—"}</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-zinc-400">
              <DollarSign className="w-4 h-4 text-zinc-600 shrink-0" />
              {editing ? (
                <input type="number" value={form.valorDiaria as string} onChange={(e) => setForm({ ...form, valorDiaria: e.target.value })} className={`${inp} flex-1`} />
              ) : (
                <span className="font-semibold text-zinc-200">R$ {vm.valorDiaria?.toLocaleString("pt-BR") ?? "—"}/dia</span>
              )}
            </div>

            {(vm.cpfCnpj || editing) && (
              <div className="flex items-center gap-2 text-zinc-400">
                <span className="text-zinc-600 text-xs font-medium w-4">ID</span>
                {editing ? (
                  <input placeholder="CPF/CNPJ" value={form.cpfCnpj as string} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} className={`${inp} flex-1`} />
                ) : (
                  <span className="font-mono text-xs">{vm.cpfCnpj}</span>
                )}
              </div>
            )}

            {(vm.chavePix || editing) && (
              <div className="flex items-center gap-2 text-zinc-400">
                <span className="text-zinc-600 text-xs font-medium">PIX</span>
                {editing ? (
                  <input placeholder="Chave PIX" value={form.chavePix as string} onChange={(e) => setForm({ ...form, chavePix: e.target.value })} className={`${inp} flex-1`} />
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs truncate max-w-32">{vm.chavePix}</span>
                    <button onClick={() => { navigator.clipboard.writeText(vm.chavePix); toast.success("PIX copiado!") }} className="text-zinc-600 hover:text-zinc-400">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Áreas de atuação */}
          {(vm.areasAtuacao?.length > 0 || editing) && (
            <div className="mt-5">
              <p className="text-xs text-zinc-500 font-medium uppercase mb-2">Áreas de atuação</p>
              {editing ? (
                <div className="flex flex-wrap gap-1.5">
                  {["eventos", "institucional", "ads", "social_media", "reels", "aftermovie", "corporativo"].map((a) => (
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
                  {vm.areasAtuacao?.map((a: string) => (
                    <span key={a} className="text-xs bg-purple-900/20 border border-purple-800 text-purple-300 px-2 py-0.5 rounded">
                      {a}
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
            ) : vm.habilidades?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {vm.habilidades.map((h: string) => (
                  <span key={h} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                    {h}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">Nenhuma habilidade cadastrada</p>
            )}
          </div>

          {/* Portfolio e observações (edit mode) */}
          {editing && (
            <div className="mt-5 grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Portfolio (URL)</label>
                <input value={form.portfolio as string} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} className={inp} placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Observações</label>
                <textarea value={form.observacoes as string} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2}
                  className={`${inp} resize-none`} />
              </div>
            </div>
          )}

          {!editing && (vm.portfolio || vm.observacoes) && (
            <div className="mt-5 space-y-2 text-sm">
              {vm.portfolio && (
                <div>
                  <span className="text-zinc-600 text-xs font-medium uppercase">Portfolio</span>
                  <a href={vm.portfolio} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-purple-400 hover:underline mt-0.5 truncate">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    {vm.portfolio}
                  </a>
                </div>
              )}
              {vm.observacoes && (
                <div>
                  <span className="text-zinc-600 text-xs font-medium uppercase">Observações</span>
                  <p className="text-zinc-400 mt-0.5">{vm.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Avaliação */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" />
              Avaliações ({avaliacoes.length})
            </h3>
            <button
              onClick={loadQR}
              className="flex items-center gap-1.5 text-xs border border-zinc-700 text-zinc-400 hover:bg-zinc-800 px-3 py-1.5 rounded-lg"
            >
              <Share2 className="h-3.5 w-3.5" />
              Link para cliente
            </button>
          </div>

          {/* Nova avaliação */}
          <div className="bg-zinc-800/50 rounded-xl p-4 mb-5">
            <p className="text-xs text-zinc-500 font-medium mb-3">Registrar avaliação interna</p>
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
              placeholder="Comentário (opcional)..."
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

          {/* Histórico */}
          {avaliacoes.length === 0 ? (
            <p className="text-sm text-zinc-600 text-center py-4">Nenhuma avaliação registrada ainda.</p>
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
                        <span className="text-[10px] bg-blue-900/20 text-blue-400 border border-blue-800 px-1.5 rounded">QR Público</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Histórico de demandas */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <Film className="w-4 h-4 text-zinc-500" />
            Demandas ({vm.demandas?.length ?? 0})
          </h3>

          {vm.demandas?.length === 0 && (
            <p className="text-sm text-zinc-600 text-center py-6">Nenhuma demanda registrada.</p>
          )}

          <div className="space-y-1">
            {vm.demandas?.map((d: {
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
              {vm.emListaNegra ? "Remover da Lista Negra" : "Adicionar à Lista Negra"}
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              {vm.emListaNegra
                ? "Confirme a remoção deste profissional da lista negra."
                : "Este profissional não poderá ser atribuído a novas demandas."}
            </p>
            {!vm.emListaNegra && (
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
                  vm.emListaNegra ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                )}
              >
                {loadingNegra ? "Salvando..." : vm.emListaNegra ? "Remover da lista" : "Confirmar"}
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
            <h3 className="font-semibold text-white mb-2">QR Code de Avaliação</h3>
            <p className="text-sm text-zinc-400 mb-6">
              Compartilhe este QR Code para o cliente avaliar {vm.nome}
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
