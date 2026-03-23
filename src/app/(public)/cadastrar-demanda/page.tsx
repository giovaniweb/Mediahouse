"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Film, Video, Camera, CheckCircle2, ArrowLeft, ChevronLeft, ChevronRight,
  Send, Loader2, MapPin, Calendar, Clock, Link2, User, Mail, Phone, AlertTriangle, Check,
} from "lucide-react"

/* ═══════════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════════ */

const inputClass =
  "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-colors"

const selectClass = inputClass

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}

/* ═══════════════════════════════════════════════════════════════════════
   FIELD COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

function Field({ label, children, error, hint, required }: {
  label: string; children: React.ReactNode; error?: string; hint?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
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

export default function CadastrarDemandaPage() {
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [codigoGerado, setCodigoGerado] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [step, setStep] = useState(0)

  // ── Dados do solicitante ──────────────────────────────────────────
  const [nomeCliente, setNomeCliente] = useState("")
  const [email, setEmail] = useState("")
  const [telefone, setTelefone] = useState("")
  const [empresa, setEmpresa] = useState("")

  // ── Tipo ──────────────────────────────────────────────────────────
  const [tipo, setTipo] = useState<"video" | "cobertura" | null>(null)

  // ── Campos comuns ─────────────────────────────────────────────────
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [cidade, setCidade] = useState("")
  const [dataLimite, setDataLimite] = useState("")
  const [referencia, setReferencia] = useState("")

  // ── Campos Vídeo ──────────────────────────────────────────────────
  const [tipoVideo, setTipoVideo] = useState("")

  // ── Campos Cobertura ──────────────────────────────────────────────
  const [localEvento, setLocalEvento] = useState("")
  const [dataEvento, setDataEvento] = useState("")
  const [horaEvento, setHoraEvento] = useState("")
  const [clienteNome, setClienteNome] = useState("")
  const [clienteTelefone, setClienteTelefone] = useState("")
  const [clienteEmail, setClienteEmail] = useState("")

  // ── Erros ─────────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ── Steps ─────────────────────────────────────────────────────────
  const steps = tipo === "cobertura"
    ? ["Seus Dados", "Tipo", "Evento", "Resumo"]
    : ["Seus Dados", "Tipo", "Detalhes", "Resumo"]

  const canAdvance = () => {
    if (step === 0) {
      return !!nomeCliente.trim() && email.includes("@") && telefone.replace(/\D/g, "").length >= 10
    }
    if (step === 1) return !!tipo
    if (step === 2) {
      if (tipo === "video") return titulo.trim().length >= 5 && descricao.trim().length >= 10 && !!tipoVideo
      if (tipo === "cobertura") return titulo.trim().length >= 5 && descricao.trim().length >= 10 && !!cidade.trim() && !!localEvento.trim() && !!dataEvento
    }
    return true
  }

  // ── Validação ─────────────────────────────────────────────────────
  function validar(): boolean {
    const errs: Record<string, string> = {}
    if (!nomeCliente.trim()) errs.nomeCliente = "Informe seu nome"
    if (!email.trim() || !email.includes("@")) errs.email = "E-mail inválido"
    if (!telefone.trim() || telefone.length < 10) errs.telefone = "Telefone inválido"
    if (!tipo) errs.tipo = "Selecione o tipo"
    if (!titulo.trim() || titulo.length < 5) errs.titulo = "Mínimo 5 caracteres"
    if (!descricao.trim() || descricao.length < 10) errs.descricao = "Descreva melhor"
    if (tipo === "video" && !tipoVideo) errs.tipoVideo = "Selecione o tipo de vídeo"
    if (tipo === "cobertura") {
      if (!cidade.trim()) errs.cidade = "Informe a cidade"
      if (!localEvento.trim()) errs.localEvento = "Informe o local"
      if (!dataEvento) errs.dataEvento = "Informe a data"
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Submit ────────────────────────────────────────────────────────
  async function onSubmit() {
    if (!validar()) {
      setErro("Verifique os campos obrigatórios antes de enviar.")
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const body = {
        nomeCliente,
        email,
        telefone,
        empresa: empresa || undefined,
        titulo,
        descricao,
        tipoVideo: tipo === "cobertura" ? "cobertura_evento" : tipoVideo,
        cidade: cidade || "N/A",
        dataLimite: dataLimite || undefined,
        dataEvento: dataEvento ? `${dataEvento}T${horaEvento || "09:00"}` : undefined,
        localEvento: localEvento || undefined,
        referencia: referencia || undefined,
        // Cobertura extras
        clienteFinalNome: clienteNome || undefined,
        clienteFinalTelefone: clienteTelefone || undefined,
        clienteFinalEmail: clienteEmail || undefined,
      }
      const res = await fetch("/api/publico/demanda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        const msgs = typeof json.error === "object"
          ? Object.values(json.error).flat().join(", ")
          : json.error
        throw new Error(msgs || "Erro ao enviar")
      }
      setCodigoGerado(json.codigo)
      setEnviado(true)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     TELA DE SUCESSO
     ═══════════════════════════════════════════════════════════════════ */

  if (enviado) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Solicitação enviada!</h2>
          {codigoGerado && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-4 mb-4">
              <p className="text-xs text-zinc-400 mb-1">Código do seu projeto</p>
              <p className="text-xl font-mono font-bold text-white">{codigoGerado}</p>
              <p className="text-xs text-zinc-500 mt-1">Guarde este código para acompanhar sua solicitação</p>
            </div>
          )}
          <p className="text-zinc-400 mb-6">
            Nossa equipe irá analisar sua solicitação e entrar em contato em até 24 horas pelo WhatsApp informado.
          </p>
          <Link href="/sobre" className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2 justify-center">
            <ArrowLeft className="w-4 h-4" /> Voltar ao início
          </Link>
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════════
     FORMULÁRIO
     ═══════════════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Nav */}
      <nav className="border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/sobre" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center">
              <Film className="w-4 h-4 text-zinc-900" />
            </div>
            <span className="font-bold text-white">NuFlow</span>
          </Link>
          <Link href="/sobre" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Solicitar Projeto de Vídeo</h1>
          <p className="text-zinc-400 text-sm">Preencha os dados abaixo e nossa equipe entrará em contato</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8 justify-center">
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
              <span className={cn("text-sm hidden sm:inline", i === step ? "font-semibold text-zinc-100" : "text-zinc-500")}>
                {s}
              </span>
              {i < steps.length - 1 && <div className="w-6 h-px bg-zinc-700" />}
            </div>
          ))}
        </div>

        {erro && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-6 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {erro}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
           STEP 0 — Dados do Solicitante
           ═══════════════════════════════════════════════════════════ */}
        {step === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <User className="w-4 h-4 text-zinc-400" /> Seus dados
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome Completo" required error={errors.nomeCliente}>
                <input value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} placeholder="João da Silva" className={inputClass} />
              </Field>
              <Field label="Empresa">
                <input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Nome da empresa (opcional)" className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="E-mail" required error={errors.email}>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="joao@empresa.com" className={cn(inputClass, "pl-10")} />
                </div>
              </Field>
              <Field label="WhatsApp" required error={errors.telefone}>
                <div className="relative">
                  <Phone className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                  <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 99999-9999" className={cn(inputClass, "pl-10")} />
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
           STEP 1 — Tipo
           ═══════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white text-center">O que você precisa?</h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setTipo("video")}
                className={cn(
                  "p-6 rounded-2xl border-2 text-left transition-all group",
                  tipo === "video"
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors",
                  tipo === "video" ? "bg-purple-500/20 text-purple-400" : "bg-zinc-800 text-zinc-400"
                )}>
                  <Video className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1">Vídeo</h3>
                <p className="text-sm text-zinc-400">
                  Reels, YouTube, treinamento, institucional, apresentação de equipamento...
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTipo("cobertura")}
                className={cn(
                  "p-6 rounded-2xl border-2 text-left transition-all group",
                  tipo === "cobertura"
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors",
                  tipo === "cobertura" ? "bg-orange-500/20 text-orange-400" : "bg-zinc-800 text-zinc-400"
                )}>
                  <Camera className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1">Cobertura / Entrega</h3>
                <p className="text-sm text-zinc-400">
                  Entrega de equipamento, evento, filmagem em clínica com videomaker local.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
           STEP 2 — Detalhes (Vídeo)
           ═══════════════════════════════════════════════════════════ */}
        {step === 2 && tipo === "video" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-white">Detalhes do Vídeo</h2>

            <Field label="Título do projeto" required error={errors.titulo}>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Reels lançamento UltraPulse Alpha" className={inputClass} />
            </Field>

            <Field label="Descreva o que você precisa" required error={errors.descricao}>
              <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={4}
                placeholder="Objetivo do vídeo, público-alvo, tom da comunicação, referências..."
                className={inputClass} />
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
              <Field label="Prazo desejado">
                <div className="relative">
                  <Calendar className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                  <input type="date" value={dataLimite} onChange={e => setDataLimite(e.target.value)} className={cn(inputClass, "pl-10")} />
                </div>
              </Field>
              <Field label="Referência (link)">
                <div className="relative">
                  <Link2 className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                  <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="https://..." className={cn(inputClass, "pl-10")} />
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
           STEP 2 — Detalhes (Cobertura)
           ═══════════════════════════════════════════════════════════ */}
        {step === 2 && tipo === "cobertura" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-white">Detalhes da Cobertura</h2>

            <Field label="Título" required error={errors.titulo}>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Entrega UltraPulse — Clínica Dra. Solange" className={inputClass} />
            </Field>

            <Field label="Descrição" required error={errors.descricao}>
              <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3}
                placeholder="Descreva o que deve ser filmado, focos, depoimentos, etc..."
                className={inputClass} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Cidade" required error={errors.cidade}>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                  <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Fortaleza" className={cn(inputClass, "pl-10")} />
                </div>
              </Field>
              <Field label="Local (endereço)" required error={errors.localEvento}>
                <input value={localEvento} onChange={e => setLocalEvento(e.target.value)} placeholder="Rua das Flores, 123 — Aldeota" className={inputClass} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Data do evento" required error={errors.dataEvento}>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                  <input type="date" value={dataEvento} onChange={e => setDataEvento(e.target.value)} className={cn(inputClass, "pl-10")} />
                </div>
              </Field>
              <Field label="Horário">
                <div className="relative">
                  <Clock className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                  <input type="time" value={horaEvento} onChange={e => setHoraEvento(e.target.value)} className={cn(inputClass, "pl-10")} />
                </div>
              </Field>
            </div>

            {/* Cliente Final */}
            <div className="pt-4 border-t border-zinc-800">
              <h3 className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-2">
                <User className="w-3.5 h-3.5" /> Cliente Final (quem comprou o equipamento)
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Nome">
                  <input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Dr. Mauro Arguello" className={inputClass} />
                </Field>
                <Field label="Telefone">
                  <input value={clienteTelefone} onChange={e => setClienteTelefone(e.target.value)} placeholder="+55 11 99999-9999" className={inputClass} />
                </Field>
                <Field label="E-mail">
                  <input value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} placeholder="dr@clinica.com" className={inputClass} />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
           STEP 3 — Resumo
           ═══════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white text-center">Confirme os dados</h2>

            {/* Solicitante */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <span className="text-xs text-zinc-500 uppercase tracking-wide">Solicitante</span>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-zinc-500">Nome:</span> <span className="text-white">{nomeCliente}</span></div>
                <div><span className="text-zinc-500">E-mail:</span> <span className="text-white">{email}</span></div>
                <div><span className="text-zinc-500">WhatsApp:</span> <span className="text-white">{telefone}</span></div>
                {empresa && <div><span className="text-zinc-500">Empresa:</span> <span className="text-white">{empresa}</span></div>}
              </div>
            </div>

            {/* Projeto */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium",
                  tipo === "video" ? "bg-purple-500/20 text-purple-300" : "bg-orange-500/20 text-orange-300"
                )}>
                  {tipo === "video" ? "🎬 Vídeo" : "📸 Cobertura"}
                </div>
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">{titulo}</h3>
                <p className="text-sm text-zinc-400 mt-1">{descricao}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {tipo === "video" && tipoVideo && (
                  <div><span className="text-zinc-500">Tipo:</span> <span className="text-white">{tipoVideo}</span></div>
                )}
                {tipo === "cobertura" && (
                  <>
                    <div><span className="text-zinc-500">Cidade:</span> <span className="text-white">{cidade}</span></div>
                    <div><span className="text-zinc-500">Local:</span> <span className="text-white">{localEvento}</span></div>
                    <div><span className="text-zinc-500">Data:</span> <span className="text-white">{dataEvento} {horaEvento && `às ${horaEvento}`}</span></div>
                  </>
                )}
                {dataLimite && <div><span className="text-zinc-500">Prazo:</span> <span className="text-white">{dataLimite}</span></div>}
                {referencia && <div><span className="text-zinc-500">Referência:</span> <span className="text-white break-all">{referencia}</span></div>}
              </div>

              {tipo === "cobertura" && clienteNome && (
                <div className="border-t border-zinc-800 pt-3">
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">Cliente Final</span>
                  <p className="text-sm text-white mt-1">
                    {clienteNome}
                    {clienteTelefone && ` · ${clienteTelefone}`}
                    {clienteEmail && ` · ${clienteEmail}`}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
           NAVEGAÇÃO
           ═══════════════════════════════════════════════════════════ */}
        <div className="flex justify-between pt-6 mt-6">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm border border-zinc-700 rounded-xl hover:bg-zinc-800 text-zinc-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
          ) : (
            <Link href="/sobre" className="flex items-center gap-1.5 px-4 py-2.5 text-sm border border-zinc-700 rounded-xl hover:bg-zinc-800 text-zinc-300 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Cancelar
            </Link>
          )}

          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => canAdvance() && setStep(s => s + 1)}
              disabled={!canAdvance()}
              className={cn(
                "flex items-center gap-1.5 px-5 py-2.5 text-sm rounded-xl transition-all",
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
              className="flex items-center gap-1.5 px-6 py-2.5 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {loading ? "Enviando..." : "Enviar Solicitação"}
            </button>
          )}
        </div>

        <p className="text-center text-xs text-zinc-600 mt-6">
          Ao enviar, você concorda com nossa política de privacidade. Retornaremos em até 24h.
        </p>
      </div>
    </div>
  )
}
