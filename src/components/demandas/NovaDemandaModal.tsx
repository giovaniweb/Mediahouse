"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { X, Plus, Trash2, Calendar, Link2, Loader2, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { enviarDocumento, documentoMuitoGrande, ACCEPT_DOCUMENTOS } from "@/lib/upload-documento"
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

  // ── Links ────────────────────────────────────────────────────────────────
  const [linkBrutos, setLinkBrutos] = useState("")

  // ── Estado do form ───────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // Anexos ficam na memória até a demanda existir: o upload é por demandaId, então
  // só dá para enviá-los depois do POST.
  const [anexos, setAnexos] = useState<File[]>([])
  const [enviandoAnexos, setEnviandoAnexos] = useState(false)
  // Avisa que o formulário voltou preenchido, para a pessoa não achar que é lixo
  // de outra demanda.
  const [rascunhoRecuperado, setRascunhoRecuperado] = useState(false)

  // ── Produtos (dropdown) ──────────────────────────────────────────────────
  const { data: dataProdutos } = useSWR<{ produtos: Produto[] }>(
    open ? "/api/produtos?limit=100" : null,
    fetcher
  )
  const produtos = dataProdutos?.produtos ?? []

  // ── Tipos de vídeo (Configurações → Parâmetros) ──────────────────────────
  const { data: dataTipos } = useSWR<{ parametros: { valor: string; label: string }[] }>(
    open ? "/api/configuracoes/parametros?grupo=tipos_video" : null,
    fetcher
  )
  const tiposVideo = dataTipos?.parametros ?? []

  // ── Proteção contra perda de trabalho ────────────────────────────────────
  // O modal fechava no clique fora e no ESC sem perguntar nada. Quem escrevia um
  // briefing longo e esbarrava fora perdia tudo — é a queixa de "não salva o texto
  // e se sair da tela apaga". Agora só fecha sem perguntar quando não há nada
  // escrito, e o que foi digitado fica guardado no navegador até virar demanda.
  const RASCUNHO_KEY = "nuflow:rascunho-nova-demanda"

  const temConteudo = !!(
    titulo.trim() || descricao.trim() || tipoVideo || produtoId || classificacao ||
    dataLimite || linkBrutos.trim() || cidade.trim() || localEvento.trim() ||
    dataEvento || motivoUrgencia.trim() || anexos.length > 0 ||
    referencias.some((r) => r.trim())
  )

  function limparRascunho() {
    if (typeof window !== "undefined") localStorage.removeItem(RASCUNHO_KEY)
  }

  function fecharComConfirmacao() {
    if (temConteudo && !confirm("Fechar sem criar a demanda? O que você escreveu fica guardado e volta na próxima vez que abrir.")) {
      return
    }
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") fecharComConfirmacao() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, temConteudo])

  // Guarda o rascunho enquanto a pessoa escreve. Anexos ficam de fora: File não
  // sobrevive ao localStorage.
  useEffect(() => {
    if (!open || typeof window === "undefined") return
    const t = setTimeout(() => {
      if (!temConteudo) return
      localStorage.setItem(RASCUNHO_KEY, JSON.stringify({
        tipo, titulo, descricao, prioridade, motivoUrgencia, dataLimite, produtoId,
        classificacao, referencias, tipoVideo, cidade, localEvento, dataEvento, linkBrutos,
      }))
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tipo, titulo, descricao, prioridade, motivoUrgencia, dataLimite, produtoId,
      classificacao, referencias, tipoVideo, cidade, localEvento, dataEvento, linkBrutos])

  // ── Ao abrir: recupera o rascunho, ou começa limpo ───────────────────────
  useEffect(() => {
    if (!open) return
    setErrors({})
    setAnexos([])

    let salvo: Record<string, unknown> | null = null
    if (typeof window !== "undefined") {
      try { salvo = JSON.parse(localStorage.getItem(RASCUNHO_KEY) ?? "null") } catch { salvo = null }
    }

    setTipo((salvo?.tipo as "video" | "cobertura") ?? "video")
    setTitulo((salvo?.titulo as string) ?? "")
    setDescricao((salvo?.descricao as string) ?? "")
    setPrioridade((salvo?.prioridade as "normal" | "alta" | "urgente") ?? "normal")
    setMotivoUrgencia((salvo?.motivoUrgencia as string) ?? "")
    setDataLimite((salvo?.dataLimite as string) ?? "")
    setProdutoId((salvo?.produtoId as string) ?? "")
    setClassificacao((salvo?.classificacao as "b2c" | "b2b" | "") ?? "")
    setReferencias((salvo?.referencias as string[]) ?? [""])
    setTipoVideo((salvo?.tipoVideo as string) ?? "")
    setCidade((salvo?.cidade as string) ?? "")
    setLocalEvento((salvo?.localEvento as string) ?? "")
    setDataEvento((salvo?.dataEvento as string) ?? "")
    setLinkBrutos((salvo?.linkBrutos as string) ?? "")
    setRascunhoRecuperado(!!salvo)
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
    if (!produtoId) errs.produtoId = "Selecione o equipamento/produto"
    if (!classificacao) errs.classificacao = "Selecione B2C ou B2B"
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
        produtoId,
        classificacao,
        ...(referencia && { referencia }),
        ...(tipo === "cobertura" && { localEvento: localEvento.trim() }),
        ...(tipo === "cobertura" && dataEvento && { dataEvento: new Date(dataEvento).toISOString() }),
        cobertura: tipo === "cobertura",
        ...(linkBrutos.trim() ? { linkBrutos: linkBrutos.trim() } : {}),
      }

      const res = await fetch("/api/demandas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      // Ler o body de forma defensiva — servidor pode retornar HTML ou body vazio em erros 500
      const text = await res.text()
      let json: Record<string, unknown> = {}
      try { json = JSON.parse(text) } catch { /* body não é JSON */ }

      if (!res.ok) throw new Error((json.error as string | undefined) ?? (text.slice(0, 200) || `Erro HTTP ${res.status}`))

      toast.success(`Demanda ${json.codigo ?? ""} criada!`)
      limparRascunho()

      // Anexos vão depois da criação — a demanda precisa existir para receber o
      // upload. Falha de anexo não desfaz a demanda: avisamos e seguimos, já que
      // o arquivo pode ser reenviado na tela de detalhe.
      if (anexos.length > 0 && typeof json.id === "string") {
        setEnviandoAnexos(true)
        const falhas: string[] = []
        for (const file of anexos) {
          try {
            await enviarDocumento(json.id, file)
          } catch {
            falhas.push(file.name)
          }
        }
        setEnviandoAnexos(false)
        if (falhas.length > 0) toast.error(`Não foi possível anexar: ${falhas.join(", ")}`)
        else toast.success(`${anexos.length} anexo(s) enviado(s)`)
      }

      onClose()
      router.push(`/demandas/${json.id}`)
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
      onClick={e => { if (e.target === overlayRef.current) fecharComConfirmacao() }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="font-semibold text-zinc-100 text-base">+ Nova Demanda</h2>
          <button onClick={fecharComConfirmacao} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (scrollável) */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">

          {/* O formulário voltou preenchido de uma sessão anterior — dizer isso
              evita que a pessoa ache que é resto de outra demanda e apague tudo. */}
          {rascunhoRecuperado && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2.5">
              <p className="text-xs text-blue-200 flex-1 min-w-[14rem]">
                Recuperamos o que você tinha começado a escrever.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!confirm("Descartar o rascunho e começar do zero?")) return
                  limparRascunho()
                  setTipo("video"); setTitulo(""); setDescricao(""); setPrioridade("normal")
                  setMotivoUrgencia(""); setDataLimite(""); setProdutoId(""); setClassificacao("")
                  setReferencias([""]); setTipoVideo(""); setCidade(""); setLocalEvento("")
                  setDataEvento(""); setLinkBrutos(""); setAnexos([]); setRascunhoRecuperado(false)
                }}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-blue-500/40 text-blue-100 hover:bg-blue-500/20 transition-colors"
              >
                Começar do zero
              </button>
            </div>
          )}

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
                {/* Vem de Configurações → Parâmetros. A lista fixa que estava
                    aqui gravava "institucional" e "ads", enquanto os parâmetros
                    eram "video_institucional" e "video_meta_ads" — editar a tela
                    não mudava nada neste formulário. */}
                <option value="">Selecionar...</option>
                {tiposVideo.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.label}</option>
                ))}
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
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                Equipamento / Produto <span className="text-red-400">*</span>
              </label>
              <select
                value={produtoId}
                onChange={e => { setProdutoId(e.target.value); setErrors(prev => ({ ...prev, produtoId: "" })) }}
                className={cn(selectClass, errors.produtoId && "border-red-500 focus:ring-red-500")}
              >
                <option value="">Selecione o equipamento…</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              {errors.produtoId && <p className="text-xs text-red-400 mt-1">{errors.produtoId}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                Classificação <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                {(["b2c", "b2b"] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => { setClassificacao(prev => prev === c ? "" : c); setErrors(prev => ({ ...prev, classificacao: "" })) }}
                    className={cn(
                      "flex-1 py-2.5 rounded-lg text-xs font-bold border transition-colors uppercase",
                      classificacao === c
                        ? c === "b2c" ? "bg-purple-600/20 border-purple-500 text-purple-300"
                          : "bg-blue-600/20 border-blue-500 text-blue-300"
                        : errors.classificacao
                          ? "bg-zinc-800 border-red-500 text-zinc-500 hover:border-red-400"
                          : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600"
                    )}
                  >
                    {c.toUpperCase()}
                  </button>
                ))}
              </div>
              {errors.classificacao && <p className="text-xs text-red-400 mt-1">{errors.classificacao}</p>}
            </div>
          </div>

          {/* Link dos Brutos */}
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
              Link dos Brutos <span className="text-zinc-600">(opcional)</span>
            </label>
            <div className="relative">
              <Link2 className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                type="url"
                value={linkBrutos}
                onChange={e => setLinkBrutos(e.target.value)}
                placeholder="https://drive.google.com/... ou link da pasta com os arquivos brutos"
                className={cn(inputClass, "pl-9")}
              />
            </div>
          </div>

          {/* Anexos (briefing, contrato, planilha…) */}
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
              Anexos <span className="text-zinc-600">(PDF, Word, Excel, imagem — até 25 MB cada)</span>
            </label>
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-zinc-800 border border-dashed border-zinc-700 text-sm text-zinc-400 cursor-pointer hover:border-purple-500/50 hover:text-zinc-200 transition-colors">
              <Paperclip className="w-4 h-4 shrink-0" />
              <span>Escolher arquivos…</span>
              <input
                type="file"
                multiple
                accept={ACCEPT_DOCUMENTOS}
                className="hidden"
                onChange={(e) => {
                  const escolhidos = Array.from(e.target.files ?? [])
                  const grandes = escolhidos.filter(documentoMuitoGrande)
                  if (grandes.length > 0) {
                    toast.error(`Acima de 25 MB: ${grandes.map((f) => f.name).join(", ")}`)
                  }
                  setAnexos((atuais) => [...atuais, ...escolhidos.filter((f) => !documentoMuitoGrande(f))])
                  e.target.value = ""
                }}
              />
            </label>
            {anexos.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {anexos.map((file, i) => (
                  <li key={`${file.name}-${i}`} className="flex items-center gap-2 text-xs text-zinc-300 bg-zinc-800/60 rounded-md px-2.5 py-1.5">
                    <Paperclip className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-zinc-500 shrink-0">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                    <button
                      type="button"
                      onClick={() => setAnexos((atuais) => atuais.filter((_, idx) => idx !== i))}
                      className="text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                      aria-label={`Remover ${file.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
            onClick={fecharComConfirmacao}
            className="px-4 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || enviandoAnexos}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-60"
          >
            {enviandoAnexos
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando anexos...</>
              : saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
              : "Criar Demanda →"}
          </button>
        </div>

      </div>
    </div>
  )
}
