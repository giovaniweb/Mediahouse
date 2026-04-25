"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { X, Plus, Trash2, Calendar, Link2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Produto { id: string; nome: string }

interface NovaDemandaModalProps {
  open: boolean
  onClose: () => void
}

const inputClass = "w-full border border-zinc-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-zinc-800 text-zinc-200 placeholder-zinc-500 transition-colors"
const selectClass = "w-full border border-zinc-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-zinc-800 text-zinc-200 transition-colors appearance-none"

const MOTIVOS_URGENCIA = [
  "Trend / Oportunidade de mercado",
  "Prazo crítico de campanha",
  "Evento presencial",
  "Campanha ativa em mídia",
  "Solicitação da diretoria",
]

export function NovaDemandaModal({ open, onClose }: NovaDemandaModalProps) {
  const router = useRouter()
  const overlayRef = useRef<HTMLDivElement>(null)

  // ── Tipo de demanda ──────────────────────────────────────────────────────
  const [tipo, setTipo] = useState<"video" | "cobertura">("video")

  // ── Campos comuns ────────────────────────────────────────────────────────
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [prioridade, setPrioridade] = useState<"normal" | "alta" | "urgente">("normal")
  const [motivoUrgencia, setMotivoUrgencia] = useState("")
  const [dataLimite, setDataLimite] = useState("")
  const [produtoId, setProdutoId] = useState("")
  const [classificacao, setClassificacao] = useState<"b2c" | "b2b" | "">("")
  const [referencias, setReferencias] = useState<string[]>([""])

  // ── Campos vídeo ─────────────────────────────────────────────────────────
  const [tipoVideo, setTipoVideo] = useState("")

  // ── Campos cobertura ─────────────────────────────────────────────────────
  const [cidade, setCidade] = useState("")
  const [localEvento, setLocalEvento] = useState("")
  const [dataEvento, setDataEvento] = useState("")

  // ── Estado do form ───────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // ── Produtos (dropdown) ──────────────────────────────────────────────────
  const { data: dataProdutos } = useSWR<{ produtos: Produto[] }>(
    open ? "/api/produtos?limit=100" : null,
    fetcher
  )
  const produtos = dataProdutos?.produtos ?? []

  // ── ESC fecha o modal ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  // ── Reset ao abrir ───────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTipo("video")
      setTitulo("")
      setDescricao("")
      setPrioridade("normal")
      setMotivoUrgencia("")
      setDataLimite("")
      setProdutoId("")
      setClassificacao("")
      setReferencias([""])
      setTipoVideo("")
      setCidade("")
      setLocalEvento("")
      setDataEvento("")
      setErrors({})
    }
  }, [open])

  if (!open) return null

  // ── Referências — helpers ────────────────────────────────────────────────
  function setReferencia(index: number, value: string) {
    setReferencias(prev => prev.map((r, i) => i === index ? value : r))
  }
  function addReferencia() { setReferencias(prev => [...prev, ""]) }
  function removeReferencia(index: number) {
    setReferencias(prev => prev.length === 1 ? [""] : prev.filter((_, i) => i !== index))
  }

  // ── Validação ────────────────────────────────────────────────────────────
  function validate() {
    const errs: Record<string, string> = {}
    if (!titulo.trim() || titulo.trim().length < 3) errs.titulo = "Mínimo 3 caracteres"
    if (!descricao.trim() || descricao.trim().length < 10) errs.descricao = "Mínimo 10 caracteres"
    if (tipo === "video" && !tipoVideo) errs.tipoVideo = "Selecione o tipo de vídeo"
    if (tipo === "cobertura") {
      if (!cidade.trim()) errs.cidade = "Cidade obrigatória"
      if (!localEvento.trim()) errs.localEvento = "Local obrigatório"
      if (!dataEvento) errs.dataEvento = "Data do evento obrigatória"
    }
    if (prioridade === "urgente" && !motivoUrgencia) errs.motivoUrgencia = "Informe o motivo"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      const referencia = referencias.filter(r => r.trim()).join("\n") || undefined
      const departamento = tipo === "cobertura" ? "eventos" : "growth"
      const tipoVideoFinal = tipo === "cobertura" ? "cobertura_evento" : tipoVideo

      const body: Record<string, unknown> = {
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        departamento,
        tipoVideo: tipoVideoFinal,
        cidade: tipo === "cobertura" ? cidade.trim() : "N/A",
        prioridade,
        ...(motivoUrgencia && { motivoUrgencia }),
        ...(dataLimite && { dataLimite: new Date(dataLimite).toISOString() }),
        ...(produtoId && { produtoId }),
        ...(classificacao && { classificacao }),
        ...(referencia && { referencia }),
        ...(tipo === "cobertura" && { localEvento: localEvento.trim() }),
        ...(tipo === "cobertura" && dataEvento && { dataEvento: new Date(dataEvento).toISOString() }),
        cobertura: tipo === "cobertura",
      }

      const res = await fetch("/api/demandas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Erro ao criar demanda")

      toast.success(`Demanda ${json.demanda?.codigo ?? ""} criada!`)
      onClose()
      router.push(`/demandas/${json.demanda?.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar demanda")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="font-semibold text-zinc-100 text-base">+ Nova Demanda</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (scrollável) */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">

          {/* Tipo */}
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-2 block">Tipo de demanda</label>
            <div className="flex gap-2">
              {(["video", "cobertura"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
                    tipo === t
                      ? "bg-purple-600 border-purple-600 text-white"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  )}
                >
                  {t === "video" ? "🎬 Vídeo" : "📸 Cobertura / Entrega"}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
              Título <span className="text-red-400">*</span>
            </label>
            <input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ex: Reels Mounjaro — Antes e Depois"
              className={cn(inputClass, errors.titulo && "border-red-500 focus:ring-red-500")}
            />
            {errors.titulo && <p className="text-xs text-red-400 mt-1">{errors.titulo}</p>}
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
              Descrição <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Descreva o que precisa ser produzido, contexto, público-alvo..."
              className={cn(inputClass, "resize-none", errors.descricao && "border-red-500 focus:ring-red-500")}
            />
            {errors.descricao && <p className="text-xs text-red-400 mt-1">{errors.descricao}</p>}
          </div>

          {/* Tipo de Vídeo (só para vídeo) */}
          {tipo === "video" && (
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                Tipo de vídeo <span className="text-red-400">*</span>
              </label>
              <select
                value={tipoVideo}
                onChange={e => setTipoVideo(e.target.value)}
                className={cn(selectClass, errors.tipoVideo && "border-red-500 focus:ring-red-500")}
              >
                <option value="">Selecionar...</option>
                <option value="reels">📱 Reels / Stories</option>
                <option value="youtube">▶️ YouTube</option>
                <option value="treinamento">🎓 Treinamento</option>
                <option value="apresentacao_equipamento">🔬 Apresentação de Equipamento</option>
                <option value="institucional">🏢 Institucional</option>
                <option value="depoimento">💬 Depoimento</option>
                <option value="ads">📣 Anúncio (Ads)</option>
                <option value="vsl">🎯 VSL (Video Sales Letter)</option>
                <option value="tutorial">📝 Tutorial</option>
                <option value="outro">📦 Outro</option>
              </select>
              {errors.tipoVideo && <p className="text-xs text-red-400 mt-1">{errors.tipoVideo}</p>}
            </div>
          )}

          {/* Campos cobertura */}
          {tipo === "cobertura" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Cidade <span className="text-red-400">*</span></label>
                <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="São Paulo" className={cn(inputClass, errors.cidade && "border-red-500")} />
                {errors.cidade && <p className="text-xs text-red-400 mt-1">{errors.cidade}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Data do evento <span className="text-red-400">*</span></label>
                <input type="date" value={dataEvento} onChange={e => setDataEvento(e.target.value)} className={cn(inputClass, errors.dataEvento && "border-red-500")} />
                {errors.dataEvento && <p className="text-xs text-red-400 mt-1">{errors.dataEvento}</p>}
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Local <span className="text-red-400">*</span></label>
                <input value={localEvento} onChange={e => setLocalEvento(e.target.value)} placeholder="Nome da clínica / endereço" className={cn(inputClass, errors.localEvento && "border-red-500")} />
                {errors.localEvento && <p className="text-xs text-red-400 mt-1">{errors.localEvento}</p>}
              </div>
            </div>
          )}

          {/* Prioridade + Prazo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Prioridade</label>
              <div className="flex gap-1.5">
                {(["normal", "alta", "urgente"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => { setPrioridade(p); if (p !== "urgente") setMotivoUrgencia("") }}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                      prioridade === p
                        ? p === "urgente" ? "bg-red-600 border-red-600 text-white"
                          : p === "alta" ? "bg-orange-500 border-orange-500 text-white"
                          : "bg-zinc-700 border-zinc-700 text-white"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    )}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              {prioridade === "urgente" && (
                <div className="mt-2">
                  <select
                    value={motivoUrgencia}
                    onChange={e => setMotivoUrgencia(e.target.value)}
                    className={cn(selectClass, "text-xs py-2", errors.motivoUrgencia && "border-red-500")}
                  >
                    <option value="">Motivo da urgência...</option>
                    {MOTIVOS_URGENCIA.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  {errors.motivoUrgencia && <p className="text-xs text-red-400 mt-1">{errors.motivoUrgencia}</p>}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Prazo de entrega</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <input type="date" value={dataLimite} onChange={e => setDataLimite(e.target.value)} className={cn(inputClass, "pl-9")} />
              </div>
            </div>
          </div>

          {/* Produto + Classificação */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Produto (opcional)</label>
              <select value={produtoId} onChange={e => setProdutoId(e.target.value)} className={selectClass}>
                <option value="">Sem produto</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Classificação</label>
              <div className="flex gap-2">
                {(["b2c", "b2b"] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setClassificacao(prev => prev === c ? "" : c)}
                    className={cn(
                      "flex-1 py-2.5 rounded-lg text-xs font-bold border transition-colors uppercase",
                      classificacao === c
                        ? c === "b2c" ? "bg-purple-600/20 border-purple-500 text-purple-300"
                          : "bg-blue-600/20 border-blue-500 text-blue-300"
                        : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600"
                    )}
                  >
                    {c.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Referências múltiplas */}
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-2 block">Referências (links)</label>
            <div className="space-y-2">
              {referencias.map((ref, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      value={ref}
                      onChange={e => setReferencia(i, e.target.value)}
                      placeholder="https://..."
                      className={cn(inputClass, "pl-9")}
                    />
                  </div>
                  <button
                    onClick={() => removeReferencia(i)}
                    className="p-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-500/40 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={addReferencia}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-purple-400 transition-colors mt-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar referência
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-60"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : "Criar Demanda →"}
          </button>
        </div>

      </div>
    </div>
  )
}
