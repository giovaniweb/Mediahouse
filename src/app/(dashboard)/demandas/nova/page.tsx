"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/Header"
import {
  Video, Camera, ChevronLeft, ChevronRight, Send, Loader2,
  Search, UserPlus, MapPin, Calendar, Clock, FileText, Link2,
  User, Mail, Phone, AlertTriangle, Check, Star
} from "lucide-react"
import { cn } from "@/lib/utils"

/* ═══════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════ */

interface Videomaker {
  id: string
  nome: string
  cidade: string | null
  estado: string | null
  telefone: string | null
  avaliacao: number | null
  valorDiaria: number | null
  habilidades: string[]
  status: string
  _count?: { demandas: number }
}

interface Produto {
  id: string
  nome: string
  categoria: string | null
}

const inputClass =
  "w-full border border-zinc-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-zinc-800 text-zinc-200 placeholder-zinc-500 transition-colors"

const selectClass = inputClass

/* ═══════════════════════════════════════════════════════════════════════
   FIELD COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

function Field({ label, children, error, hint, required }: {
  label: string; children: React.ReactNode; error?: string; hint?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════ */

export default function NovaDemandaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)

  // ── Tipo de solicitação ─────────────────────────────────────────────
  const [tipo, setTipo] = useState<"video" | "cobertura" | null>(null)

  // ── Campos comuns ───────────────────────────────────────────────────
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [cidade, setCidade] = useState("")
  const [prioridade, setPrioridade] = useState<"normal" | "alta" | "urgente">("normal")
  const [motivoUrgencia, setMotivoUrgencia] = useState("")
  const [dataLimite, setDataLimite] = useState("")
  const [referencia, setReferencia] = useState("")
  const [observacoes, setObservacoes] = useState("")
  const [produtoId, setProdutoId] = useState("")
  const [classificacao, setClassificacao] = useState<"b2c" | "b2b">("b2c")

  // ── Campos Vídeo ────────────────────────────────────────────────────
  const [tipoVideo, setTipoVideo] = useState("")
  const [campanha, setCampanha] = useState("")
  const [objetivo, setObjetivo] = useState("")
  const [plataforma, setPlataforma] = useState("")

  // ── Campos Cobertura ────────────────────────────────────────────────
  const [nomeEvento, setNomeEvento] = useState("")
  const [localEvento, setLocalEvento] = useState("")
  const [dataEvento, setDataEvento] = useState("")
  const [horaEvento, setHoraEvento] = useState("")
  const [clienteNome, setClienteNome] = useState("")
  const [clienteTelefone, setClienteTelefone] = useState("")
  const [clienteEmail, setClienteEmail] = useState("")

  // ── Videomaker (cobertura) ──────────────────────────────────────────
  const [buscaVM, setBuscaVM] = useState("")
  const [videomakers, setVideomakers] = useState<Videomaker[]>([])
  const [vmSelecionado, setVmSelecionado] = useState<Videomaker | null>(null)
  const [loadingVMs, setLoadingVMs] = useState(false)
  const [showCadastroVM, setShowCadastroVM] = useState(false)
  const [novoVM, setNovoVM] = useState({ nome: "", cidade: "", telefone: "", email: "", valorDiaria: "" })

  // ── Produtos ────────────────────────────────────────────────────────
  const [produtos, setProdutos] = useState<Produto[]>([])

  // ── Erros ───────────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ── Load produtos ───────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/produtos").then(r => r.json()).then(d => setProdutos(d.produtos ?? d ?? [])).catch(() => {})
  }, [])

  // ── Busca videomakers por cidade ────────────────────────────────────
  const buscarVideomakers = useCallback(async (cidadeBusca: string) => {
    if (!cidadeBusca || cidadeBusca.length < 2) return
    setLoadingVMs(true)
    try {
      const res = await fetch(`/api/videomakers?cidade=${encodeURIComponent(cidadeBusca)}&status=ativo`)
      const data = await res.json()
      setVideomakers(data.videomakers ?? data ?? [])
    } catch { setVideomakers([]) }
    finally { setLoadingVMs(false) }
  }, [])

  useEffect(() => {
    if (tipo === "cobertura" && cidade.length >= 2) {
      const timer = setTimeout(() => buscarVideomakers(cidade), 500)
      return () => clearTimeout(timer)
    }
  }, [cidade, tipo, buscarVideomakers])

  // ── Validação ───────────────────────────────────────────────────────
  function validar(): boolean {
    const errs: Record<string, string> = {}
    if (!tipo) errs.tipo = "Selecione o tipo"
    if (!titulo.trim() || titulo.length < 5) errs.titulo = "Mínimo 5 caracteres"
    if (!descricao.trim() || descricao.length < 10) errs.descricao = "Descreva melhor a demanda"
    if (tipo === "cobertura" && !cidade.trim()) errs.cidade = "Informe a cidade"
    if (prioridade === "urgente" && !motivoUrgencia) errs.motivoUrgencia = "Obrigatório para urgências"

    if (tipo === "video") {
      if (!tipoVideo) errs.tipoVideo = "Selecione o tipo de vídeo"
    }
    if (tipo === "cobertura") {
      if (!localEvento.trim()) errs.localEvento = "Informe o local"
      if (!dataEvento) errs.dataEvento = "Informe a data"
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Cadastrar novo videomaker inline ────────────────────────────────
  async function cadastrarVideomaker() {
    if (!novoVM.nome || !novoVM.cidade || !novoVM.telefone) {
      alert("Preencha nome, cidade e telefone do videomaker")
      return
    }
    try {
      const res = await fetch("/api/videomakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: novoVM.nome,
          cidade: novoVM.cidade,
          telefone: novoVM.telefone,
          email: novoVM.email || undefined,
          valorDiaria: novoVM.valorDiaria ? parseFloat(novoVM.valorDiaria) : undefined,
        }),
      })
      if (!res.ok) throw new Error("Erro ao cadastrar")
      const vm = await res.json()
      setVmSelecionado(vm)
      setShowCadastroVM(false)
      setNovoVM({ nome: "", cidade: "", telefone: "", email: "", valorDiaria: "" })
    } catch {
      alert("Erro ao cadastrar videomaker. Tente novamente.")
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────
  async function onSubmit() {
    if (!validar()) {
      // Se erro está no step anterior, volta
      if (errors.tipo) setStep(0)
      return
    }
    setLoading(true)
    try {
      const departamento = tipo === "cobertura" ? "eventos" : "growth"
      const tipoVideoFinal = tipo === "cobertura" ? "cobertura_evento" : tipoVideo

      const body: Record<string, unknown> = {
        titulo,
        descricao,
        departamento,
        tipoVideo: tipoVideoFinal,
        cidade: cidade || "N/A",
        prioridade,
        motivoUrgencia: motivoUrgencia || undefined,
        dataLimite: dataLimite || undefined,
        referencia: referencia || undefined,
        // Video fields
        campanha: campanha || undefined,
        objetivo: objetivo || undefined,
        plataforma: plataforma || undefined,
        // Cobertura fields
        localEvento: localEvento || undefined,
        dataEvento: dataEvento ? new Date(`${dataEvento}T${horaEvento || "09:00"}`).toISOString() : undefined,
        cobertura: tipo === "cobertura",
        // Cliente final (cobertura)
        clienteFinalNome: clienteNome || undefined,
        clienteFinalTelefone: clienteTelefone || undefined,
        clienteFinalEmail: clienteEmail || undefined,
        // Videomaker
        videomakerId: vmSelecionado?.id || undefined,
        // Produto
        produtoId: produtoId || undefined,
        // Classificação B2C/B2B
        classificacao,
      }

      const res = await fetch("/api/demandas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error ? (typeof json.error === "string" ? json.error : JSON.stringify(json.error)) : "Erro ao criar")
      }
      router.push(`/demandas/${json.id}`)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao criar demanda")
    } finally {
      setLoading(false)
    }
  }

  // ── Steps config ────────────────────────────────────────────────────
  const steps = tipo === "cobertura"
    ? ["Tipo", "Evento", "Videomaker", "Resumo"]
    : ["Tipo", "Detalhes", "Contexto", "Resumo"]

  const canAdvance = () => {
    if (step === 0) return !!tipo
    if (step === 1) {
      if (tipo === "video") return !!titulo && !!descricao && !!tipoVideo
      if (tipo === "cobertura") return !!titulo && !!descricao && !!cidade && !!localEvento && !!dataEvento
    }
    return true
  }

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */

  return (
    <>
      <Header title="Nova Demanda" />
      <main className="flex-1 p-6 max-w-3xl mx-auto">
        {/* ── Progress Steps ────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  i < step
                    ? "bg-green-600 text-white cursor-pointer hover:bg-green-500"
                    : i === step
                    ? "bg-purple-600 text-white"
                    : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                )}
              >
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </button>
              <span className={cn("text-sm", i === step ? "font-semibold text-zinc-100" : "text-zinc-500")}>
                {s}
              </span>
              {i < steps.length - 1 && <div className="w-8 h-px bg-zinc-700" />}
            </div>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
           STEP 0 — Escolha do Tipo
           ═══════════════════════════════════════════════════════════════ */}
        {step === 0 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-zinc-100">O que você precisa?</h2>

            <div className="grid grid-cols-2 gap-4">
              {/* Card Vídeo */}
              <button
                type="button"
                onClick={() => setTipo("video")}
                className={cn(
                  "p-6 rounded-xl border-2 text-left transition-all group",
                  tipo === "video"
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-500"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors",
                  tipo === "video" ? "bg-purple-500/20 text-purple-400" : "bg-zinc-700 text-zinc-400 group-hover:text-zinc-300"
                )}>
                  <Video className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-zinc-100 mb-1">Vídeo</h3>
                <p className="text-sm text-zinc-400">
                  Reels, YouTube, treinamento, institucional, apresentação de equipamento...
                </p>
              </button>

              {/* Card Cobertura */}
              <button
                type="button"
                onClick={() => setTipo("cobertura")}
                className={cn(
                  "p-6 rounded-xl border-2 text-left transition-all group",
                  tipo === "cobertura"
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-500"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors",
                  tipo === "cobertura" ? "bg-orange-500/20 text-orange-400" : "bg-zinc-700 text-zinc-400 group-hover:text-zinc-300"
                )}>
                  <Camera className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-zinc-100 mb-1">Cobertura / Entrega</h3>
                <p className="text-sm text-zinc-400">
                  Entrega de equipamento, evento, filmagem em clínica com videomaker local.
                </p>
              </button>
            </div>
            {errors.tipo && <p className="text-xs text-red-400">{errors.tipo}</p>}

            {/* Prioridade + Produto (comum) */}
            {tipo && (
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-zinc-800">
                <Field label="Prioridade">
                  <select value={prioridade} onChange={e => setPrioridade(e.target.value as "normal" | "alta" | "urgente")} className={selectClass}>
                    <option value="normal">Normal</option>
                    <option value="alta">⚡ Alta</option>
                    <option value="urgente">🚨 Urgente</option>
                  </select>
                </Field>

                <Field label="Classificação" hint="Tipo de público do vídeo">
                  <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                    <button
                      type="button"
                      onClick={() => setClassificacao("b2c")}
                      className={cn(
                        "flex-1 py-2.5 text-sm font-medium transition-colors",
                        classificacao === "b2c"
                          ? "bg-cyan-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      )}
                    >
                      B2C
                    </button>
                    <button
                      type="button"
                      onClick={() => setClassificacao("b2b")}
                      className={cn(
                        "flex-1 py-2.5 text-sm font-medium transition-colors",
                        classificacao === "b2b"
                          ? "bg-orange-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      )}
                    >
                      B2B
                    </button>
                  </div>
                </Field>

                {produtos.length > 0 && (
                  <Field label="Produto / Equipamento" hint="Relacionar a um produto">
                    <select value={produtoId} onChange={e => setProdutoId(e.target.value)} className={selectClass}>
                      <option value="">— Nenhum —</option>
                      {produtos.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
            )}

            {prioridade === "urgente" && (
              <Field label="Motivo da urgência" required error={errors.motivoUrgencia}>
                <select value={motivoUrgencia} onChange={e => setMotivoUrgencia(e.target.value)} className={selectClass}>
                  <option value="">Selecionar...</option>
                  <option value="Trend do Instagram / TikTok">Trend Instagram/TikTok</option>
                  <option value="Prazo contratual">Prazo contratual</option>
                  <option value="Evento iminente">Evento iminente</option>
                  <option value="Campanha urgente">Campanha urgente</option>
                  <option value="Solicitação da diretoria">Solicitação da diretoria</option>
                </select>
              </Field>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           STEP 1 — Detalhes (Vídeo)
           ═══════════════════════════════════════════════════════════════ */}
        {step === 1 && tipo === "video" && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-100">Detalhes do Vídeo</h2>

            <Field label="Título" required error={errors.titulo}>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Reels lançamento UltraPulse Alpha" className={inputClass} />
            </Field>

            <Field label="Descrição" required error={errors.descricao}>
              <textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                rows={3}
                placeholder="Descreva o objetivo, referências, tom de voz, elementos visuais..."
                className={inputClass}
              />
            </Field>

            <Field label="Tipo de vídeo" required error={errors.tipoVideo}>
              <select value={tipoVideo} onChange={e => setTipoVideo(e.target.value)} className={selectClass}>
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
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Prazo de entrega">
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                  <input type="date" value={dataLimite} onChange={e => setDataLimite(e.target.value)} className={cn(inputClass, "pl-9")} />
                </div>
              </Field>
              <Field label="Referência (link)">
                <div className="relative">
                  <Link2 className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                  <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="https://..." className={cn(inputClass, "pl-9")} />
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           STEP 1 — Detalhes (Cobertura)
           ═══════════════════════════════════════════════════════════════ */}
        {step === 1 && tipo === "cobertura" && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-100">Detalhes da Cobertura</h2>

            <Field label="Título" required error={errors.titulo}>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Entrega UltraPulse — Clínica Dra. Solange" className={inputClass} />
            </Field>

            <Field label="Descrição" required error={errors.descricao}>
              <textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                rows={3}
                placeholder="Descreva o que deve ser filmado, focos, depoimentos, etc..."
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Cidade" required error={errors.cidade}>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                  <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Fortaleza" className={cn(inputClass, "pl-9")} />
                </div>
              </Field>
              <Field label="Local (endereço)" required error={errors.localEvento}>
                <input value={localEvento} onChange={e => setLocalEvento(e.target.value)} placeholder="Rua das Flores, 123 — Aldeota, Fortaleza" className={inputClass} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Data" required error={errors.dataEvento}>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                  <input type="date" value={dataEvento} onChange={e => setDataEvento(e.target.value)} className={cn(inputClass, "pl-9")} />
                </div>
              </Field>
              <Field label="Horário">
                <div className="relative">
                  <Clock className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                  <input type="time" value={horaEvento} onChange={e => setHoraEvento(e.target.value)} className={cn(inputClass, "pl-9")} />
                </div>
              </Field>
            </div>

            {/* Cliente Final */}
            <div className="pt-4 border-t border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" /> Cliente Final (quem comprou o equipamento)
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Nome">
                  <input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Dr. Mauro Arguello" className={inputClass} />
                </Field>
                <Field label="Telefone">
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                    <input value={clienteTelefone} onChange={e => setClienteTelefone(e.target.value)} placeholder="+55 11 99999-9999" className={cn(inputClass, "pl-9")} />
                  </div>
                </Field>
                <Field label="E-mail">
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                    <input value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} placeholder="dr@clinica.com" className={cn(inputClass, "pl-9")} />
                  </div>
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           STEP 2 — Contexto (Vídeo)
           ═══════════════════════════════════════════════════════════════ */}
        {step === 2 && tipo === "video" && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-100">Contexto & Campanha</h2>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Campanha">
                <input value={campanha} onChange={e => setCampanha(e.target.value)} placeholder="Performance Q2" className={inputClass} />
              </Field>
              <Field label="Objetivo">
                <input value={objetivo} onChange={e => setObjetivo(e.target.value)} placeholder="Conversão, Awareness..." className={inputClass} />
              </Field>
            </div>

            <Field label="Plataforma">
              <select value={plataforma} onChange={e => setPlataforma(e.target.value)} className={selectClass}>
                <option value="">Selecionar...</option>
                <option value="Instagram">Instagram</option>
                <option value="Meta Ads">Meta Ads</option>
                <option value="YouTube">YouTube</option>
                <option value="TikTok">TikTok</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Site">Site</option>
                <option value="WhatsApp">WhatsApp</option>
              </select>
            </Field>

            <Field label="Observações adicionais">
              <textarea
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                rows={3}
                placeholder="Algo mais que a equipe precisa saber?"
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           STEP 2 — Videomaker (Cobertura)
           ═══════════════════════════════════════════════════════════════ */}
        {step === 2 && tipo === "cobertura" && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-100">Videomaker para a Cobertura</h2>

            {cidade && (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-zinc-300">
                    <MapPin className="w-4 h-4 inline mr-1 text-zinc-400" />
                    Videomakers em <strong className="text-zinc-100">{cidade}</strong>
                  </p>
                  <button
                    type="button"
                    onClick={() => buscarVideomakers(cidade)}
                    className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                  >
                    <Search className="w-3 h-3" /> Atualizar busca
                  </button>
                </div>

                {loadingVMs ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-400 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Buscando videomakers...
                  </div>
                ) : videomakers.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {videomakers.map(vm => (
                      <button
                        key={vm.id}
                        type="button"
                        onClick={() => setVmSelecionado(vm)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border transition-all",
                          vmSelecionado?.id === vm.id
                            ? "border-purple-500 bg-purple-500/10"
                            : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-zinc-100">{vm.nome}</span>
                            <span className="text-xs text-zinc-500 ml-2">{vm.cidade}{vm.estado ? `, ${vm.estado}` : ""}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {vm.avaliacao && (
                              <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                                <Star className="w-3 h-3 fill-yellow-400" /> {vm.avaliacao.toFixed(1)}
                              </span>
                            )}
                            {vm.valorDiaria && (
                              <span className="text-xs text-zinc-400">R$ {vm.valorDiaria.toFixed(0)}/dia</span>
                            )}
                            {vmSelecionado?.id === vm.id && (
                              <Check className="w-4 h-4 text-purple-400" />
                            )}
                          </div>
                        </div>
                        {vm.habilidades.length > 0 && (
                          <div className="flex gap-1 mt-1.5">
                            {vm.habilidades.slice(0, 4).map(h => (
                              <span key={h} className="text-[10px] px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-400">{h}</span>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-zinc-400 mb-2">Nenhum videomaker encontrado em {cidade}</p>
                  </div>
                )}

                {/* Cadastrar novo */}
                <button
                  type="button"
                  onClick={() => {
                    setShowCadastroVM(!showCadastroVM)
                    setNovoVM(prev => ({ ...prev, cidade }))
                  }}
                  className="mt-3 w-full text-sm text-purple-400 hover:text-purple-300 flex items-center justify-center gap-1.5 py-2 border border-dashed border-zinc-700 rounded-lg hover:border-purple-500/50 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  {showCadastroVM ? "Cancelar cadastro" : "Cadastrar novo videomaker"}
                </button>
              </div>
            )}

            {!cidade && (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6 text-center">
                <MapPin className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-400">Volte e preencha a <strong>cidade</strong> para buscar videomakers disponíveis.</p>
              </div>
            )}

            {/* Inline cadastro de videomaker */}
            {showCadastroVM && (
              <div className="bg-zinc-800 border border-purple-500/30 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-purple-400" /> Novo Videomaker
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nome" required>
                    <input value={novoVM.nome} onChange={e => setNovoVM(p => ({ ...p, nome: e.target.value }))} placeholder="João Silva" className={inputClass} />
                  </Field>
                  <Field label="Cidade" required>
                    <input value={novoVM.cidade} onChange={e => setNovoVM(p => ({ ...p, cidade: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Telefone" required>
                    <input value={novoVM.telefone} onChange={e => setNovoVM(p => ({ ...p, telefone: e.target.value }))} placeholder="+55 85 99999-9999" className={inputClass} />
                  </Field>
                  <Field label="E-mail">
                    <input value={novoVM.email} onChange={e => setNovoVM(p => ({ ...p, email: e.target.value }))} placeholder="joao@email.com" className={inputClass} />
                  </Field>
                  <Field label="Valor diária (R$)">
                    <input type="number" value={novoVM.valorDiaria} onChange={e => setNovoVM(p => ({ ...p, valorDiaria: e.target.value }))} placeholder="500" className={inputClass} />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={cadastrarVideomaker}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" /> Cadastrar e Selecionar
                </button>
              </div>
            )}

            {vmSelecionado && !showCadastroVM && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center gap-3">
                <Check className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-100">{vmSelecionado.nome}</p>
                  <p className="text-xs text-zinc-400">{vmSelecionado.cidade} · {vmSelecionado.telefone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setVmSelecionado(null)}
                  className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Trocar
                </button>
              </div>
            )}

            <Field label="Observações">
              <textarea
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Instruções para o videomaker, detalhes da filmagem..."
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           STEP 3 — Resumo Final
           ═══════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-100">Confirme os dados</h2>

            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-5 space-y-4">
              {/* Badge de tipo */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium",
                  tipo === "video" ? "bg-purple-500/20 text-purple-300" : "bg-orange-500/20 text-orange-300"
                )}>
                  {tipo === "video" ? "🎬 Vídeo" : "📸 Cobertura"}
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium",
                  prioridade === "urgente" ? "bg-red-500/20 text-red-300"
                    : prioridade === "alta" ? "bg-yellow-500/20 text-yellow-300"
                    : "bg-zinc-700 text-zinc-300"
                )}>
                  {prioridade === "urgente" ? "🚨 Urgente" : prioridade === "alta" ? "⚡ Alta" : "Normal"}
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium",
                  classificacao === "b2c" ? "bg-cyan-500/20 text-cyan-300" : "bg-orange-500/20 text-orange-300"
                )}>
                  {classificacao === "b2c" ? "B2C" : "B2B"}
                </div>
              </div>

              {/* Título + Descrição */}
              <div>
                <h3 className="text-base font-semibold text-zinc-100">{titulo || "Sem título"}</h3>
                <p className="text-sm text-zinc-400 mt-1">{descricao || "Sem descrição"}</p>
              </div>

              {/* Dados em grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-zinc-500">Cidade:</span>{" "}
                  <span className="text-zinc-200">{cidade}</span>
                </div>
                {tipo === "video" && tipoVideo && (
                  <div>
                    <span className="text-zinc-500">Tipo:</span>{" "}
                    <span className="text-zinc-200">{tipoVideo}</span>
                  </div>
                )}
                {tipo === "cobertura" && (
                  <>
                    <div>
                      <span className="text-zinc-500">Local:</span>{" "}
                      <span className="text-zinc-200">{localEvento}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Data:</span>{" "}
                      <span className="text-zinc-200">{dataEvento} {horaEvento && `às ${horaEvento}`}</span>
                    </div>
                  </>
                )}
                {dataLimite && (
                  <div>
                    <span className="text-zinc-500">Prazo:</span>{" "}
                    <span className="text-zinc-200">{dataLimite}</span>
                  </div>
                )}
                {campanha && (
                  <div>
                    <span className="text-zinc-500">Campanha:</span>{" "}
                    <span className="text-zinc-200">{campanha}</span>
                  </div>
                )}
                {plataforma && (
                  <div>
                    <span className="text-zinc-500">Plataforma:</span>{" "}
                    <span className="text-zinc-200">{plataforma}</span>
                  </div>
                )}
              </div>

              {/* Videomaker (cobertura) */}
              {tipo === "cobertura" && vmSelecionado && (
                <div className="border-t border-zinc-700 pt-3">
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">Videomaker</span>
                  <p className="text-sm text-zinc-200 mt-1">{vmSelecionado.nome} · {vmSelecionado.cidade}</p>
                </div>
              )}

              {/* Cliente final (cobertura) */}
              {tipo === "cobertura" && clienteNome && (
                <div className="border-t border-zinc-700 pt-3">
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">Cliente Final</span>
                  <p className="text-sm text-zinc-200 mt-1">
                    {clienteNome}
                    {clienteTelefone && ` · ${clienteTelefone}`}
                    {clienteEmail && ` · ${clienteEmail}`}
                  </p>
                </div>
              )}

              {/* Produto */}
              {produtoId && (
                <div className="border-t border-zinc-700 pt-3">
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">Produto</span>
                  <p className="text-sm text-zinc-200 mt-1">{produtos.find(p => p.id === produtoId)?.nome ?? produtoId}</p>
                </div>
              )}
            </div>

            {prioridade === "urgente" && (
              <div className="flex items-start gap-2 text-sm text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>Demanda urgente — será encaminhada direto para aprovação do gestor.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           NAVEGAÇÃO
           ═══════════════════════════════════════════════════════════════ */}
        <div className="flex justify-between pt-6 mt-6 border-t border-zinc-800">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm border border-zinc-700 rounded-lg hover:bg-zinc-800 text-zinc-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2.5 text-sm border border-zinc-700 rounded-lg hover:bg-zinc-800 text-zinc-300 transition-colors"
            >
              Cancelar
            </button>
          )}

          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => canAdvance() ? setStep(s => s + 1) : null}
              disabled={!canAdvance()}
              className={cn(
                "flex items-center gap-1.5 px-5 py-2.5 text-sm rounded-lg transition-all",
                canAdvance()
                  ? "bg-purple-600 text-white hover:bg-purple-700"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              )}
            >
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading}
              className="flex items-center gap-1.5 px-6 py-2.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {loading ? "Criando..." : "Criar Demanda"}
            </button>
          )}
        </div>
      </main>
    </>
  )
}
