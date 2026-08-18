"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  X, Plus, Calendar, Link2, Loader2, Paperclip, Smartphone, Monitor,
  LayoutGrid, ClipboardList, Settings2, Users, Package, UploadCloud,
  ChevronDown, FileText, MapPin,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { enviarDocumento, documentoMuitoGrande, ACCEPT_DOCUMENTOS } from "@/lib/upload-documento"
import { ErroApi, erroDeCorpo, mensagemDeErro } from "@/lib/erro-cliente"
import { hojeEmSaoPaulo } from "@/lib/datas"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"


interface Produto { id: string; nome: string }
interface OpcaoEquipe { value: string; label: string; subtitle?: string }

interface NovaDemandaModalProps {
  open: boolean
  onClose: () => void
}

const inputClass =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-sm text-zinc-200 " +
  "placeholder-zinc-600 outline-none transition-colors focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/25"
const selectClass = cn(inputClass, "appearance-none pr-10 cursor-pointer")
const erroClass = "border-red-500/70 focus:border-red-500 focus:ring-red-500/25"

const MOTIVOS_URGENCIA = [
  "Trend / Oportunidade de mercado",
  "Prazo crítico de campanha",
  "Evento presencial",
  "Campanha ativa em mídia",
  "Solicitação da diretoria",
]

const COR_PRIORIDADE: Record<string, string> = {
  normal: "bg-amber-400",
  alta: "bg-orange-500",
  urgente: "bg-red-500",
}

// ── Peças de layout ────────────────────────────────────────────────────────
// A tela é uma grade de blocos, não uma pilha de campos: cada bloco tem um
// título com ícone e ocupa metade da largura. Quem preenche lê "o que é",
// "para quem", "quem faz" lado a lado em vez de rolar sete vezes.

function Secao({ icone: Icone, titulo, children, className }: {
  icone: React.ComponentType<{ className?: string }>
  titulo: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-purple-500/15 text-purple-400">
          <Icone className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold text-zinc-100">{titulo}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Campo({ label, obrigatorio, opcional, erro, children }: {
  label: string
  obrigatorio?: boolean
  opcional?: boolean
  erro?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-xs font-medium text-zinc-400">
        {label}
        {obrigatorio && <span className="ml-1 text-purple-400">*</span>}
        {opcional && <span className="ml-1 text-zinc-600">(opcional)</span>}
      </label>
      {children}
      {erro && <p className="mt-1 text-xs text-red-400">{erro}</p>}
    </div>
  )
}

/** Select nativo com a seta desenhada por fora (appearance-none come a do sistema). */
function Seta() {
  return <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
}

function Chip({ texto, onRemover }: { texto: string; onRemover: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-purple-500/12 px-2.5 py-1 text-xs font-medium text-purple-200 ring-1 ring-inset ring-purple-500/25">
      <span className="truncate">{texto}</span>
      <button
        type="button"
        onClick={onRemover}
        aria-label={`Remover ${texto}`}
        className="shrink-0 text-purple-300/70 transition-colors hover:text-red-300"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

export function NovaDemandaModal({ open, onClose }: NovaDemandaModalProps) {
  const router = useRouter()
  const overlayRef = useRef<HTMLDivElement>(null)
  // O gesto de clique começou no fundo? (ver comentário do backdrop, mais abaixo)
  const pressionouNoFundo = useRef(false)

  // ── Tipo de demanda ──────────────────────────────────────────────────────
  const [tipo, setTipo] = useState<"video" | "cobertura">("video")

  // ── Campos comuns ────────────────────────────────────────────────────────
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [prioridade, setPrioridade] = useState<"normal" | "alta" | "urgente">("normal")
  const [motivoUrgencia, setMotivoUrgencia] = useState("")
  const [dataLimite, setDataLimite] = useState("")
  const [produtoIds, setProdutoIds] = useState<string[]>([])
  const [classificacao, setClassificacao] = useState<"b2c" | "b2b" | "">("")
  const [referencias, setReferencias] = useState<string[]>([])
  const [novaReferencia, setNovaReferencia] = useState("")

  // ── Campos vídeo ─────────────────────────────────────────────────────────
  const [tipoVideo, setTipoVideo] = useState("")
  const [formato, setFormato] = useState<"9:16" | "16:9" | "">("9:16")

  // ── Campos cobertura ─────────────────────────────────────────────────────
  const [cidade, setCidade] = useState("")
  const [localEvento, setLocalEvento] = useState("")
  const [dataEvento, setDataEvento] = useState("")

  // ── Equipe e links ───────────────────────────────────────────────────────
  const [linkBrutos, setLinkBrutos] = useState("")
  // Tokens unificados da equipe (ed:/vm:/user:) — o POST resolve para o id real.
  const [videomakerId, setVideomakerId] = useState("")
  const [editorId, setEditorId] = useState("")

  // ── Estado do form ───────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // Anexos ficam na memória até a demanda existir: o upload é por demandaId, então
  // só dá para enviá-los depois do POST.
  const [anexos, setAnexos] = useState<File[]>([])
  const [enviandoAnexos, setEnviandoAnexos] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  // Avisa que o formulário voltou preenchido, para a pessoa não achar que é lixo
  // de outra demanda.
  const [rascunhoRecuperado, setRascunhoRecuperado] = useState(false)

  // ── Produtos (dropdown) ──────────────────────────────────────────────────
  const { data: dataProdutos } = useSWR<{ produtos: Produto[] }>(
    open ? "/api/produtos?limit=100" : null,
    fetcher
  )
  const produtos = dataProdutos?.produtos ?? []
  const produtosSelecionados = produtoIds
    .map((id) => produtos.find((p) => p.id === id))
    .filter((p): p is Produto => !!p)

  // ── Tipos de vídeo (Configurações → Parâmetros) ──────────────────────────
  const { data: dataTipos } = useSWR<{ parametros: { valor: string; label: string }[] }>(
    open ? "/api/configuracoes/parametros?grupo=tipos_video" : null,
    fetcher
  )
  const tiposVideo = dataTipos?.parametros ?? []

  // ── Equipe: captação e edição ────────────────────────────────────────────
  const { data: dataCaptacao } = useSWR<{ opcoes: OpcaoEquipe[] }>(
    open ? "/api/equipe-disponivel?papel=captacao" : null,
    fetcher
  )
  const opcoesCaptacao = dataCaptacao?.opcoes ?? []

  const { data: dataEdicao } = useSWR<{ opcoes: OpcaoEquipe[] }>(
    open ? "/api/equipe-disponivel?papel=edicao" : null,
    fetcher
  )
  const opcoesEdicao = dataEdicao?.opcoes ?? []

  // ── Proteção contra perda de trabalho ────────────────────────────────────
  // O modal fechava no clique fora e no ESC sem perguntar nada. Quem escrevia um
  // briefing longo e esbarrava fora perdia tudo — é a queixa de "não salva o texto
  // e se sair da tela apaga". Agora só fecha sem perguntar quando não há nada
  // escrito, e o que foi digitado fica guardado no navegador até virar demanda.
  const RASCUNHO_KEY = "nuflow:rascunho-nova-demanda"

  const temConteudo = !!(
    titulo.trim() || descricao.trim() || tipoVideo || produtoIds.length > 0 || classificacao ||
    dataLimite || linkBrutos.trim() || cidade.trim() || localEvento.trim() ||
    dataEvento || motivoUrgencia.trim() || anexos.length > 0 ||
    videomakerId || editorId || referencias.length > 0 || novaReferencia.trim()
  )

  function limparRascunho() {
    if (typeof window !== "undefined") localStorage.removeItem(RASCUNHO_KEY)
  }

  function fecharComConfirmacao() {
    // O aviso não pode prometer os anexos: File não sobrevive ao localStorage,
    // e a versão anterior dizia "fica guardado" enquanto os arquivos sumiam.
    const avisoAnexos = anexos.length > 0
      ? ` Os ${anexos.length} arquivo(s) selecionado(s) precisarão ser anexados de novo.`
      : ""
    if (temConteudo && !confirm(`Fechar sem criar a demanda? O texto fica guardado e volta na próxima vez que abrir.${avisoAnexos}`)) {
      return
    }
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      // ESC dentro de <select> ou <input type="date"> serve para fechar o
      // dropdown/calendário do próprio controle — e borbulhava até aqui,
      // derrubando o modal inteiro. O formulário tem vários desses campos: é a
      // explicação mais provável do "fecha sozinho e perde tudo".
      if (e.defaultPrevented) return
      const alvo = e.target as HTMLElement | null
      const tag = alvo?.tagName
      if (tag === "SELECT" || (tag === "INPUT" && (alvo as HTMLInputElement).type === "date")) return
      fecharComConfirmacao()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, temConteudo])

  // Guarda o rascunho enquanto a pessoa escreve. Anexos ficam de fora: File não
  // sobrevive ao localStorage — por isso o texto do aviso não promete os arquivos.
  const gravarRascunho = useCallback(() => {
    if (typeof window === "undefined" || !temConteudo) return
    localStorage.setItem(RASCUNHO_KEY, JSON.stringify({
      tipo, titulo, descricao, prioridade, motivoUrgencia, dataLimite, produtoIds,
      classificacao, referencias, tipoVideo, formato, cidade, localEvento, dataEvento,
      linkBrutos, videomakerId, editorId,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temConteudo, tipo, titulo, descricao, prioridade, motivoUrgencia, dataLimite, produtoIds,
      classificacao, referencias, tipoVideo, formato, cidade, localEvento, dataEvento,
      linkBrutos, videomakerId, editorId])

  useEffect(() => {
    if (!open || typeof window === "undefined") return
    const t = setTimeout(gravarRascunho, 500)
    // O cleanup roda quando o modal fecha e cancelava o timer pendente: os
    // últimos <500 ms de digitação nunca chegavam ao localStorage. Agora grava
    // na saída também.
    return () => { clearTimeout(t); gravarRascunho() }
  }, [open, gravarRascunho])

  // Fechar a aba, recarregar ou navegar não passava por nenhuma guarda — o
  // rascunho ficava com o que o debounce tinha alcançado, e só.
  useEffect(() => {
    if (!open || typeof window === "undefined") return
    const aoSair = (e: BeforeUnloadEvent) => {
      gravarRascunho()
      if (temConteudo) { e.preventDefault(); e.returnValue = "" }
    }
    window.addEventListener("beforeunload", aoSair)
    return () => window.removeEventListener("beforeunload", aoSair)
  }, [open, temConteudo, gravarRascunho])

  // ── Ao abrir: recupera o rascunho, ou começa limpo ───────────────────────
  useEffect(() => {
    if (!open) return
    setErrors({})
    setAnexos([])
    setNovaReferencia("")

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
    setProdutoIds((salvo?.produtoIds as string[]) ?? [])
    setClassificacao((salvo?.classificacao as "b2c" | "b2b" | "") ?? "")
    setReferencias((salvo?.referencias as string[]) ?? [])
    setTipoVideo((salvo?.tipoVideo as string) ?? "")
    setFormato((salvo?.formato as "9:16" | "16:9") ?? "9:16")
    setCidade((salvo?.cidade as string) ?? "")
    setLocalEvento((salvo?.localEvento as string) ?? "")
    setDataEvento((salvo?.dataEvento as string) ?? "")
    setLinkBrutos((salvo?.linkBrutos as string) ?? "")
    setVideomakerId((salvo?.videomakerId as string) ?? "")
    setEditorId((salvo?.editorId as string) ?? "")
    setRascunhoRecuperado(!!salvo)
  }, [open])

  if (!open) return null

  function limparCampo(campo: string) {
    setErrors((prev) => (prev[campo] ? { ...prev, [campo]: "" } : prev))
  }

  // ── Referências — vira chip ao confirmar ─────────────────────────────────
  function adicionarReferencia() {
    const valor = novaReferencia.trim()
    if (!valor) return
    setReferencias((prev) => (prev.includes(valor) ? prev : [...prev, valor]))
    setNovaReferencia("")
  }

  // ── Anexos ───────────────────────────────────────────────────────────────
  function receberArquivos(lista: FileList | File[]) {
    const escolhidos = Array.from(lista)
    const grandes = escolhidos.filter(documentoMuitoGrande)
    if (grandes.length > 0) {
      toast.error(`Acima de 25 MB: ${grandes.map((f) => f.name).join(", ")}`)
    }
    setAnexos((atuais) => [...atuais, ...escolhidos.filter((f) => !documentoMuitoGrande(f))])
  }

  // ── Validação ────────────────────────────────────────────────────────────
  function validate() {
    const errs: Record<string, string> = {}
    if (!titulo.trim() || titulo.trim().length < 3) errs.titulo = "Mínimo 3 caracteres"
    if (!descricao.trim() || descricao.trim().length < 10) errs.descricao = "Mínimo 10 caracteres"
    if (tipo === "video") {
      if (!tipoVideo) errs.tipoVideo = "Selecione o tipo de vídeo"
      if (!formato) errs.formato = "Selecione o formato"
    }
    if (tipo === "cobertura") {
      if (!cidade.trim()) errs.cidade = "Cidade obrigatória"
      if (!localEvento.trim()) errs.localEvento = "Local obrigatório"
      if (!dataEvento) errs.dataEvento = "Data do evento obrigatória"
    }
    if (!dataLimite) errs.dataLimite = "Informe o prazo de entrega"
    if (produtoIds.length === 0) errs.produtoIds = "Selecione ao menos um equipamento/produto"
    if (!classificacao) errs.classificacao = "Selecione B2C ou B2B"
    if (prioridade === "urgente" && !motivoUrgencia) errs.motivoUrgencia = "Informe o motivo"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!validate()) {
      toast.error("Faltam campos obrigatórios.")
      return
    }
    setSaving(true)
    try {
      // O link digitado e ainda não confirmado no botão conta: perder o que a
      // pessoa acabou de colar por causa de um clique a menos é o tipo de
      // detalhe que faz o campo parecer quebrado.
      const pendente = novaReferencia.trim()
      const todasReferencias = pendente && !referencias.includes(pendente)
        ? [...referencias, pendente]
        : referencias
      const referencia = todasReferencias.join("\n") || undefined
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
        produtoIds,
        classificacao,
        ...(tipo === "video" && formato ? { formato } : {}),
        ...(referencia && { referencia }),
        ...(tipo === "cobertura" && { localEvento: localEvento.trim() }),
        ...(tipo === "cobertura" && dataEvento && { dataEvento: new Date(dataEvento).toISOString() }),
        cobertura: tipo === "cobertura",
        ...(linkBrutos.trim() ? { linkBrutos: linkBrutos.trim() } : {}),
        ...(videomakerId ? { videomakerId } : {}),
        ...(editorId ? { editorId } : {}),
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

      // Antes: `json.error as string` — mas a API devolvia o objeto do zod, e o
      // cast mentia para o TypeScript. O usuário via "[object Object]".
      if (!res.ok) throw erroDeCorpo(json, res.status, text, "Não foi possível criar a demanda.")

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
      // Marca no formulário o campo que a API recusou — o mesmo estado `errors`
      // já usado pela validação local, então o input fica destacado igual.
      if (e instanceof ErroApi && e.temCampos()) setErrors(e.campos)
      toast.error(mensagemDeErro(e, "Não foi possível criar a demanda."))
    } finally {
      setSaving(false)
    }
  }

  const ocupado = saving || enviandoAnexos

  // O evento `click` tem como alvo o ancestral comum do mousedown e do mouseup:
  // selecionar texto na descrição e soltar o mouse fora do card marcava o overlay
  // como alvo e fechava o modal. Por isso o fechamento exige que o gesto INTEIRO
  // (descer e soltar o botão) tenha acontecido no fundo.
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={e => { pressionouNoFundo.current = e.target === overlayRef.current }}
      onClick={e => {
        if (e.target === overlayRef.current && pressionouNoFundo.current) fecharComConfirmacao()
        pressionouNoFundo.current = false
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/80 px-7 py-5">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold text-zinc-50">
            <Plus className="h-5 w-5 text-purple-400" />
            Nova Demanda
          </h2>
          <button
            onClick={fecharComConfirmacao}
            aria-label="Fechar"
            className="text-zinc-500 transition-colors hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo (scrollável) */}
        <div className="flex-1 overflow-y-auto px-7 py-6">

          {/* O formulário voltou preenchido de uma sessão anterior — dizer isso
              evita que a pessoa ache que é resto de outra demanda e apague tudo. */}
          {rascunhoRecuperado && (
            <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-2.5">
              <p className="min-w-[14rem] flex-1 text-xs text-blue-200">
                Recuperamos o que você tinha começado a escrever.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!confirm("Descartar o rascunho e começar do zero?")) return
                  limparRascunho()
                  setTipo("video"); setTitulo(""); setDescricao(""); setPrioridade("normal")
                  setMotivoUrgencia(""); setDataLimite(""); setProdutoIds([]); setClassificacao("")
                  setReferencias([]); setNovaReferencia(""); setTipoVideo(""); setFormato("9:16")
                  setCidade(""); setLocalEvento(""); setDataEvento(""); setLinkBrutos("")
                  setVideomakerId(""); setEditorId(""); setAnexos([]); setRascunhoRecuperado(false)
                }}
                className="rounded-md border border-blue-500/40 px-2.5 py-1 text-xs font-medium text-blue-100 transition-colors hover:bg-blue-500/20"
              >
                Começar do zero
              </button>
            </div>
          )}

          {/* ── Bloco 1: o pedido ───────────────────────────────────────── */}
          <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">

            <Secao icone={LayoutGrid} titulo="Tipo de demanda">
              <div className="flex gap-3">
                {(["video", "cobertura"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={cn(
                      "flex-1 rounded-xl border py-4 text-sm font-medium transition-colors",
                      tipo === t
                        ? "border-purple-500 bg-purple-600 text-white shadow-lg shadow-purple-900/30"
                        : "border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    )}
                  >
                    {t === "video" ? "🎬 Vídeo" : "📸 Cobertura / Entrega"}
                  </button>
                ))}
              </div>
            </Secao>

            <Secao icone={ClipboardList} titulo="O que precisa ser feito?">
              <Campo label="Título da demanda" obrigatorio erro={errors.titulo}>
                <input
                  value={titulo}
                  onChange={e => { setTitulo(e.target.value); limparCampo("titulo") }}
                  placeholder="Ex.: Reels Mounjaro — Antes e Depois"
                  className={cn(inputClass, errors.titulo && erroClass)}
                />
              </Campo>
              <Campo label="Descrição / Objetivo" obrigatorio erro={errors.descricao}>
                <textarea
                  rows={4}
                  value={descricao}
                  onChange={e => { setDescricao(e.target.value); limparCampo("descricao") }}
                  placeholder="Explique rapidamente o que precisa ser produzido, para quem é e qual resultado espera."
                  className={cn(inputClass, "resize-none", errors.descricao && erroClass)}
                />
              </Campo>
            </Secao>
          </div>

          <div className="my-7 border-t border-zinc-800/80" />

          {/* ── Bloco 2: configuração + equipe ──────────────────────────── */}
          <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">

            <Secao
              icone={Settings2}
              titulo={tipo === "video" ? "Configuração do vídeo" : "Configuração da cobertura"}
            >
              {tipo === "video" ? (
                <>
                  <Campo label="Formato" obrigatorio erro={errors.formato}>
                    <div className="flex gap-3">
                      {([
                        { valor: "9:16" as const, nome: "Vertical", Icone: Smartphone },
                        { valor: "16:9" as const, nome: "Horizontal", Icone: Monitor },
                      ]).map(({ valor, nome, Icone }) => (
                        <button
                          key={valor}
                          type="button"
                          onClick={() => { setFormato(valor); limparCampo("formato") }}
                          className={cn(
                            "flex flex-1 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                            formato === valor
                              ? "border-purple-500 bg-purple-500/10"
                              : "border-zinc-800 bg-zinc-900/70 hover:border-zinc-700"
                          )}
                        >
                          <Icone className={cn("h-5 w-5 shrink-0", formato === valor ? "text-purple-300" : "text-zinc-500")} />
                          <span className="min-w-0">
                            <span className={cn("block text-sm font-semibold", formato === valor ? "text-zinc-50" : "text-zinc-300")}>
                              {valor}
                            </span>
                            <span className="block text-xs text-zinc-500">{nome}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </Campo>

                  <Campo label="Tipo de vídeo" obrigatorio erro={errors.tipoVideo}>
                    <div className="relative">
                      {/* Vem de Configurações → Parâmetros. A lista fixa que estava
                          aqui gravava "institucional" e "ads", enquanto os parâmetros
                          eram "video_institucional" e "video_meta_ads" — editar a tela
                          não mudava nada neste formulário. */}
                      <select
                        value={tipoVideo}
                        onChange={e => { setTipoVideo(e.target.value); limparCampo("tipoVideo") }}
                        className={cn(selectClass, errors.tipoVideo && erroClass)}
                      >
                        <option value="">Selecionar tipo...</option>
                        {tiposVideo.map((t) => (
                          <option key={t.valor} value={t.valor}>{t.label}</option>
                        ))}
                      </select>
                      <Seta />
                    </div>
                  </Campo>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <Campo label="Cidade" obrigatorio erro={errors.cidade}>
                    <input
                      value={cidade}
                      onChange={e => { setCidade(e.target.value); limparCampo("cidade") }}
                      placeholder="São Paulo"
                      className={cn(inputClass, errors.cidade && erroClass)}
                    />
                  </Campo>
                  <Campo label="Data do evento" obrigatorio erro={errors.dataEvento}>
                    <input
                      type="date"
                      value={dataEvento}
                      onChange={e => { setDataEvento(e.target.value); limparCampo("dataEvento") }}
                      className={cn(inputClass, errors.dataEvento && erroClass)}
                    />
                  </Campo>
                  <div className="col-span-2">
                    <Campo label="Local" obrigatorio erro={errors.localEvento}>
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        <input
                          value={localEvento}
                          onChange={e => { setLocalEvento(e.target.value); limparCampo("localEvento") }}
                          placeholder="Nome da clínica / endereço"
                          className={cn(inputClass, "pl-10", errors.localEvento && erroClass)}
                        />
                      </div>
                    </Campo>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Campo label="Prioridade" obrigatorio>
                  <div className="relative">
                    <span className={cn("pointer-events-none absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full", COR_PRIORIDADE[prioridade])} />
                    <select
                      value={prioridade}
                      onChange={e => {
                        const p = e.target.value as "normal" | "alta" | "urgente"
                        setPrioridade(p)
                        if (p !== "urgente") { setMotivoUrgencia(""); limparCampo("motivoUrgencia") }
                      }}
                      className={cn(selectClass, "pl-8")}
                    >
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                    <Seta />
                  </div>
                </Campo>

                <Campo label="Prazo de entrega" obrigatorio erro={errors.dataLimite}>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="date"
                      min={hojeEmSaoPaulo()}
                      value={dataLimite}
                      onChange={e => { setDataLimite(e.target.value); limparCampo("dataLimite") }}
                      className={cn(inputClass, "pl-10", errors.dataLimite && erroClass)}
                    />
                  </div>
                </Campo>
              </div>

              {prioridade === "urgente" && (
                <Campo label="Motivo da urgência" obrigatorio erro={errors.motivoUrgencia}>
                  <div className="relative">
                    <select
                      value={motivoUrgencia}
                      onChange={e => { setMotivoUrgencia(e.target.value); limparCampo("motivoUrgencia") }}
                      className={cn(selectClass, errors.motivoUrgencia && erroClass)}
                    >
                      <option value="">Selecionar motivo...</option>
                      {MOTIVOS_URGENCIA.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <Seta />
                  </div>
                </Campo>
              )}

              <Campo label="Classificação" obrigatorio erro={errors.classificacao}>
                <div className="flex gap-3">
                  {(["b2c", "b2b"] as const).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setClassificacao(prev => prev === c ? "" : c); limparCampo("classificacao") }}
                      className={cn(
                        "flex-1 rounded-xl border py-2.5 text-xs font-bold uppercase transition-colors",
                        classificacao === c
                          ? c === "b2c"
                            ? "border-purple-500 bg-purple-600/20 text-purple-200"
                            : "border-blue-500 bg-blue-600/20 text-blue-200"
                          : cn(
                              "bg-zinc-900/70 text-zinc-500 hover:text-zinc-300",
                              errors.classificacao ? "border-red-500/70" : "border-zinc-800 hover:border-zinc-700"
                            )
                      )}
                    >
                      {c.toUpperCase()}
                    </button>
                  ))}
                </div>
              </Campo>
            </Secao>

            {/* A API sempre aceitou videomaker e editor na criação, mas nenhum
                formulário oferecia os campos: só dava para atribuir depois de
                salvar e reabrir o card. Ficam opcionais de propósito — quem só
                abre o pedido normalmente não sabe quem vai gravar, e a triagem
                existe justamente para isso. */}
            <Secao icone={Users} titulo="Equipe">
              <Campo label="Videomaker da gravação" opcional>
                <div className="relative">
                  <select
                    value={videomakerId}
                    onChange={e => setVideomakerId(e.target.value)}
                    className={cn(selectClass, "pl-10")}
                  >
                    <option value="">Definir na triagem</option>
                    {opcoesCaptacao.map(o => (
                      <option key={o.value} value={o.value}>
                        {o.label}{o.subtitle ? ` · ${o.subtitle}` : ""}
                      </option>
                    ))}
                  </select>
                  <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Seta />
                </div>
              </Campo>

              <Campo label="Videomaker editor" opcional>
                <div className="relative">
                  <select
                    value={editorId}
                    onChange={e => setEditorId(e.target.value)}
                    className={cn(selectClass, "pl-10")}
                  >
                    <option value="">Definir na triagem</option>
                    {opcoesEdicao.map(o => (
                      <option key={o.value} value={o.value}>
                        {o.label}{o.subtitle ? ` · ${o.subtitle}` : ""}
                      </option>
                    ))}
                  </select>
                  <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Seta />
                </div>
              </Campo>

              <p className="text-xs text-zinc-600">
                Deixe em branco e a demanda entra na fila de triagem para alguém assumir.
              </p>
            </Secao>
          </div>

          <div className="my-7 border-t border-zinc-800/80" />

          {/* ── Bloco 3: produtos + arquivos ────────────────────────────── */}
          <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">

            <Secao icone={Package} titulo="Equipamentos / Produtos">
              <div className="relative">
                <Plus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <select
                  value=""
                  onChange={e => {
                    const id = e.target.value
                    if (!id) return
                    setProdutoIds(prev => prev.includes(id) ? prev : [...prev, id])
                    limparCampo("produtoIds")
                  }}
                  className={cn(selectClass, "pl-10", errors.produtoIds && erroClass)}
                >
                  <option value="">Adicionar equipamento / produto</option>
                  {produtos
                    .filter(p => !produtoIds.includes(p.id))
                    .map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <Seta />
              </div>

              {produtosSelecionados.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {produtosSelecionados.map(p => (
                    <Chip
                      key={p.id}
                      texto={p.nome}
                      onRemover={() => setProdutoIds(prev => prev.filter(id => id !== p.id))}
                    />
                  ))}
                </div>
              )}

              {errors.produtoIds
                ? <p className="text-xs text-red-400">{errors.produtoIds}</p>
                : <p className="text-xs text-zinc-600">Selecione um ou mais equipamentos/produtos envolvidos.</p>}
            </Secao>

            <Secao icone={Paperclip} titulo="Arquivos e referências">
              {/* O anexo passa pela rota de documento: briefing, contrato, planilha,
                  imagem de referência. Material bruto de vídeo não cabe aqui (25 MB)
                  — vai por link, no campo logo abaixo. */}
              <label
                onDragOver={e => { e.preventDefault(); setArrastando(true) }}
                onDragLeave={() => setArrastando(false)}
                onDrop={e => {
                  e.preventDefault()
                  setArrastando(false)
                  if (e.dataTransfer.files?.length) receberArquivos(e.dataTransfer.files)
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors",
                  arrastando
                    ? "border-purple-400 bg-purple-500/10"
                    : "border-purple-500/40 bg-zinc-900/40 hover:border-purple-500/70 hover:bg-purple-500/5"
                )}
              >
                <UploadCloud className="h-6 w-6 text-purple-400" />
                <span className="text-sm font-medium text-zinc-200">Arraste arquivos para cá</span>
                <span className="text-xs text-zinc-500">
                  ou <span className="text-purple-400 underline underline-offset-2">clique para selecionar</span>
                </span>
                <span className="text-[11px] text-zinc-600">PDF, Word, Excel, PNG, JPG — até 25 MB cada</span>
                <input
                  type="file"
                  multiple
                  accept={ACCEPT_DOCUMENTOS}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) receberArquivos(e.target.files)
                    e.target.value = ""
                  }}
                />
              </label>

              {anexos.length > 0 && (
                <ul className="space-y-1.5">
                  {anexos.map((file, i) => (
                    <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-zinc-900/70 px-2.5 py-1.5 text-xs text-zinc-300">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-zinc-500">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                      <button
                        type="button"
                        onClick={() => setAnexos((atuais) => atuais.filter((_, idx) => idx !== i))}
                        className="shrink-0 text-zinc-500 transition-colors hover:text-red-400"
                        aria-label={`Remover ${file.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <Campo label="Links de referência">
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      value={novaReferencia}
                      onChange={e => setNovaReferencia(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); adicionarReferencia() }
                      }}
                      placeholder="Cole aqui links do Drive, Instagram, YouTube..."
                      className={cn(inputClass, "pl-10")}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={adicionarReferencia}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 text-xs font-medium text-zinc-300 transition-colors hover:border-purple-500/50 hover:text-purple-300"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar link
                  </button>
                </div>
              </Campo>

              {referencias.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {referencias.map(ref => (
                    <Chip
                      key={ref}
                      texto={ref}
                      onRemover={() => setReferencias(prev => prev.filter(r => r !== ref))}
                    />
                  ))}
                </div>
              )}

              <Campo label="Link dos brutos" opcional>
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="url"
                    value={linkBrutos}
                    onChange={e => setLinkBrutos(e.target.value)}
                    placeholder="https://drive.google.com/... (pasta com o material bruto)"
                    className={cn(inputClass, "pl-10")}
                  />
                </div>
              </Campo>
            </Secao>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-800/80 px-7 py-4">
          <button
            onClick={fecharComConfirmacao}
            className="rounded-xl border border-zinc-800 px-5 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-900"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={ocupado}
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/30 transition-colors hover:bg-purple-500 disabled:opacity-60"
          >
            {enviandoAnexos
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando anexos...</>
              : saving
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
              : <>Criar Demanda <span aria-hidden>→</span></>}
          </button>
        </div>

      </div>
    </div>
  )
}
