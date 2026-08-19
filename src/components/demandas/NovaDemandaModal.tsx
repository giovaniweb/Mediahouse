"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, Calendar, Loader2, Smartphone, Monitor,
  ClipboardList, Settings2, Users, Package, MapPin, User,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { enviarAnexos } from "@/lib/upload-documento"
import { ErroApi, erroDeCorpo, mensagemDeErro } from "@/lib/erro-cliente"
import { hojeEmSaoPaulo } from "@/lib/datas"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { useRascunho } from "@/lib/use-rascunho"
import {
  Secao, Campo, Seta, Chip,
  inputClass, selectClass, erroClass, MOTIVOS_URGENCIA, COR_PRIORIDADE,
} from "./campos-formulario"
import { ModalFormulario } from "./ModalFormulario"
import { BannerRascunho } from "./BannerRascunho"
import { SecaoArquivos, juntarReferencias } from "./SecaoArquivos"


interface Produto { id: string; nome: string }
interface OpcaoEquipe { value: string; label: string; subtitle?: string }

interface NovaDemandaModalProps {
  open: boolean
  onClose: () => void
  /**
   * Pessoa já escolhida ao abrir — vem do botão "Nova Demanda" na ficha de um
   * videomaker ou de um editor. São tokens da equipe (`vm:<id>` / `ed:<id>`),
   * os mesmos valores que /api/equipe-disponivel devolve.
   */
  prefill?: { videomakerId?: string; editorId?: string }
}

type TipoDemanda = "video" | "cobertura"
type Prioridade = "normal" | "alta" | "urgente"
type Formato = "9:16" | "16:9" | ""
type Classificacao = "b2c" | "b2b" | ""

/** O que vai para o localStorage. File fica de fora, de propósito. */
interface RascunhoAudiovisual {
  tipo: TipoDemanda
  titulo: string
  descricao: string
  prioridade: Prioridade
  motivoUrgencia: string
  dataLimite: string
  produtoIds: string[]
  classificacao: Classificacao
  referencias: string[]
  novaReferencia: string
  tipoVideo: string
  formato: Formato
  cidade: string
  localEvento: string
  dataEvento: string
  horaEvento: string
  linkBrutos: string
  videomakerId: string
  editorId: string
  clienteNome: string
  clienteTelefone: string
  clienteEmail: string
}

export function NovaDemandaModal({ open, onClose, prefill }: NovaDemandaModalProps) {
  const router = useRouter()

  // ── Tipo de demanda ──────────────────────────────────────────────────────
  const [tipo, setTipo] = useState<TipoDemanda>("video")

  // ── Campos comuns ────────────────────────────────────────────────────────
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [prioridade, setPrioridade] = useState<Prioridade>("normal")
  const [motivoUrgencia, setMotivoUrgencia] = useState("")
  const [dataLimite, setDataLimite] = useState("")
  const [produtoIds, setProdutoIds] = useState<string[]>([])
  const [classificacao, setClassificacao] = useState<Classificacao>("")
  const [referencias, setReferencias] = useState<string[]>([])
  const [novaReferencia, setNovaReferencia] = useState("")

  // ── Campos vídeo ─────────────────────────────────────────────────────────
  const [tipoVideo, setTipoVideo] = useState("")
  const [formato, setFormato] = useState<Formato>("9:16")

  // ── Campos cobertura ─────────────────────────────────────────────────────
  const [cidade, setCidade] = useState("")
  const [localEvento, setLocalEvento] = useState("")
  const [dataEvento, setDataEvento] = useState("")
  const [horaEvento, setHoraEvento] = useState("")
  // Quem comprou o equipamento. Não é enfeite: /api/demandas/[id]/converter-evento
  // usa clienteFinalNome como cliente do evento, e quem vai gravar precisa de um
  // telefone para combinar a chegada na clínica.
  const [clienteNome, setClienteNome] = useState("")
  const [clienteTelefone, setClienteTelefone] = useState("")
  const [clienteEmail, setClienteEmail] = useState("")

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
    dataEvento || horaEvento || motivoUrgencia.trim() || anexos.length > 0 ||
    videomakerId || editorId || referencias.length > 0 || novaReferencia.trim() ||
    clienteNome.trim() || clienteTelefone.trim() || clienteEmail.trim()
  )

  const { rascunhoRecuperado, limpar: limparRascunho, descartar } = useRascunho<RascunhoAudiovisual>({
    chave: RASCUNHO_KEY,
    aberto: open,
    temConteudo,
    // Anexos ficam de fora: File não sobrevive ao localStorage — por isso o texto
    // do aviso de fechamento não promete os arquivos.
    valores: {
      tipo, titulo, descricao, prioridade, motivoUrgencia, dataLimite, produtoIds,
      classificacao, referencias, novaReferencia, tipoVideo, formato, cidade, localEvento,
      dataEvento, horaEvento, linkBrutos, videomakerId, editorId,
      clienteNome, clienteTelefone, clienteEmail,
    },
    aoRestaurar: (salvo) => {
      setTipo(salvo.tipo ?? "video")
      setTitulo(salvo.titulo ?? "")
      setDescricao(salvo.descricao ?? "")
      setPrioridade(salvo.prioridade ?? "normal")
      setMotivoUrgencia(salvo.motivoUrgencia ?? "")
      setDataLimite(salvo.dataLimite ?? "")
      setProdutoIds(salvo.produtoIds ?? [])
      setClassificacao(salvo.classificacao ?? "")
      // Filtra vazios: o rascunho da versão anterior guardava `referencias: [""]`
      // (o campo começava com uma linha em branco). Restaurado cru, cada string
      // vazia virava um chip só com o "×", sem texto — lixo visual que o usuário
      // não sabe de onde veio.
      setReferencias(
        Array.isArray(salvo.referencias)
          ? salvo.referencias.filter((r) => typeof r === "string" && r.trim() !== "")
          : []
      )
      setNovaReferencia(salvo.novaReferencia ?? "")
      setTipoVideo(salvo.tipoVideo ?? "")
      setFormato(salvo.formato ?? "9:16")
      setCidade(salvo.cidade ?? "")
      setLocalEvento(salvo.localEvento ?? "")
      setDataEvento(salvo.dataEvento ?? "")
      setHoraEvento(salvo.horaEvento ?? "")
      setLinkBrutos(salvo.linkBrutos ?? "")
      setVideomakerId(salvo.videomakerId ?? "")
      setEditorId(salvo.editorId ?? "")
      setClienteNome(salvo.clienteNome ?? "")
      setClienteTelefone(salvo.clienteTelefone ?? "")
      setClienteEmail(salvo.clienteEmail ?? "")
      setAnexos([])
      setErrors({})
    },
  })

  function tentarFechar() {
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

  // ── Pessoa que veio pronta no link ───────────────────────────────────────
  // Roda depois da recuperação do rascunho (e de novo quando a lista chega):
  // quem clicou "Nova Demanda" na ficha de alguém quis aquela pessoa, não a que
  // tinha sobrado do rascunho. Só aplica se o token estiver na lista carregada —
  // um select apontando para quem saiu da equipe mostraria "Definir na triagem"
  // e mesmo assim enviaria a pessoa: a tela diria uma coisa e o POST outra.
  const prefillVideomaker = prefill?.videomakerId
  const prefillEditor = prefill?.editorId

  // A dependência é a resposta do SWR, e não a lista com `?? []`: o fallback cria
  // um array novo a cada render e faria o efeito rodar sem parar.
  useEffect(() => {
    if (!open || !prefillVideomaker) return
    if (dataCaptacao?.opcoes?.some(o => o.value === prefillVideomaker)) setVideomakerId(prefillVideomaker)
  }, [open, prefillVideomaker, dataCaptacao])

  useEffect(() => {
    if (!open || !prefillEditor) return
    if (dataEdicao?.opcoes?.some(o => o.value === prefillEditor)) setEditorId(prefillEditor)
  }, [open, prefillEditor, dataEdicao])

  if (!open) return null

  function limparCampo(campo: string) {
    setErrors((prev) => (prev[campo] ? { ...prev, [campo]: "" } : prev))
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
      const referencia = juntarReferencias(referencias, novaReferencia)
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
        // Com a data sozinha, `new Date("2026-08-20")` é meia-noite UTC — que em
        // São Paulo ainda é dia 19. Compondo data+hora o horário é lido como
        // local, e a gravação deixa de aparecer um dia antes na agenda.
        ...(tipo === "cobertura" && dataEvento && {
          dataEvento: new Date(`${dataEvento}T${horaEvento || "09:00"}`).toISOString(),
        }),
        cobertura: tipo === "cobertura",
        ...(tipo === "cobertura" && clienteNome.trim() ? { clienteFinalNome: clienteNome.trim() } : {}),
        ...(tipo === "cobertura" && clienteTelefone.trim() ? { clienteFinalTelefone: clienteTelefone.trim() } : {}),
        ...(tipo === "cobertura" && clienteEmail.trim() ? { clienteFinalEmail: clienteEmail.trim() } : {}),
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
        const falhas = await enviarAnexos(json.id, anexos)
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

  return (
    <ModalFormulario
      aberto={open}
      titulo="Nova Demanda"
      icone={Plus}
      aoTentarFechar={tentarFechar}
      aoConfirmar={handleSubmit}
      ocupado={ocupado}
      rotuloConfirmar={
        enviandoAnexos
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando anexos...</>
          : saving
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
          : <>Criar Demanda <span aria-hidden>→</span></>
      }
    >
      {rascunhoRecuperado && <BannerRascunho aoDescartar={descartar} />}

      {/* ── Bloco 1: o pedido ───────────────────────────────────────
          Largura inteira de propósito. Em duas colunas, "Tipo de demanda"
          eram dois botões ocupando metade da tela e deixando um vão até o
          divisor, enquanto a descrição — o campo em que mais se escreve —
          ficava espremida na outra metade. Agora o tipo divide a linha com
          o título, e o briefing usa a largura toda. */}
      <Secao icone={ClipboardList} titulo="O que precisa ser feito?">
        <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
          <Campo label="Título da demanda" obrigatorio erro={errors.titulo}>
            <input
              value={titulo}
              onChange={e => { setTitulo(e.target.value); limparCampo("titulo") }}
              placeholder="Ex.: Reels Mounjaro — Antes e Depois"
              className={cn(inputClass, errors.titulo && erroClass)}
            />
          </Campo>

          <Campo label="Tipo de demanda" obrigatorio>
            <div className="flex gap-3">
              {(["video", "cobertura"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={cn(
                    "flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                    tipo === t
                      ? "border-purple-500 bg-purple-600 text-white shadow-lg shadow-purple-900/30"
                      : "border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  )}
                >
                  {t === "video" ? "🎬 Vídeo" : "📸 Cobertura / Entrega"}
                </button>
              ))}
            </div>
          </Campo>
        </div>

        <Campo label="Descrição / Objetivo" obrigatorio erro={errors.descricao}>
          {/* resize-y porque briefing longo existe: quem precisa de mais
              espaço puxa a alça em vez de escrever numa fresta rolando. */}
          <textarea
            rows={6}
            value={descricao}
            onChange={e => { setDescricao(e.target.value); limparCampo("descricao") }}
            placeholder="Explique rapidamente o que precisa ser produzido, para quem é e qual resultado espera."
            className={cn(inputClass, "min-h-[9rem] resize-y", errors.descricao && erroClass)}
          />
        </Campo>
      </Secao>

      <div className="my-7 border-t border-zinc-800/80" />

      {/* ── Bloco 2: configuração, equipe, produtos e arquivos ───────
          Duas colunas que crescem independentes, em vez de dois grids de
          uma linha cada. Antes a linha inteira herdava a altura do bloco
          mais alto: "Equipe" (dois campos) ficava ao lado de "Configuração"
          (seis) e sobrava um vão enorme embaixo — o mesmo entre
          "Equipamentos" e "Arquivos". Empilhando dentro de cada coluna, o
          vão só pode sobrar no fim de uma delas. */}
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2 md:items-start">

        <div className="min-w-0 space-y-8">
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
                <Campo label="Data e horário" obrigatorio erro={errors.dataEvento}>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={dataEvento}
                      onChange={e => { setDataEvento(e.target.value); limparCampo("dataEvento") }}
                      className={cn(inputClass, "min-w-0 flex-1", errors.dataEvento && erroClass)}
                    />
                    {/* Sem horário a gravação entra às 9h — o padrão antigo.
                        Quem sabe a hora da entrega informa e evita o telefonema. */}
                    <input
                      type="time"
                      value={horaEvento}
                      onChange={e => setHoraEvento(e.target.value)}
                      className={cn(inputClass, "w-28 shrink-0 px-2")}
                    />
                  </div>
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

                {/* Cliente final — só existe em cobertura/entrega. Vira o
                    cliente do evento quando a demanda é convertida, e é o
                    contato de quem vai gravar na clínica. */}
                <div className="col-span-2 space-y-4 border-t border-zinc-800/60 pt-4">
                  <p className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                    <User className="h-3.5 w-3.5 text-zinc-500" />
                    Cliente final <span className="text-zinc-600">(quem recebe o equipamento)</span>
                  </p>
                  <Campo label="Nome" opcional>
                    <input
                      value={clienteNome}
                      onChange={e => setClienteNome(e.target.value)}
                      placeholder="Dra. Solange Martins"
                      className={inputClass}
                    />
                  </Campo>
                  <div className="grid grid-cols-2 gap-4">
                    <Campo label="Telefone" opcional>
                      <input
                        value={clienteTelefone}
                        onChange={e => setClienteTelefone(e.target.value)}
                        placeholder="+55 85 99999-9999"
                        className={inputClass}
                      />
                    </Campo>
                    <Campo label="E-mail" opcional>
                      <input
                        type="email"
                        value={clienteEmail}
                        onChange={e => setClienteEmail(e.target.value)}
                        placeholder="contato@clinica.com"
                        className={inputClass}
                      />
                    </Campo>
                  </div>
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
                      const p = e.target.value as Prioridade
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
        </div>

        <div className="min-w-0 space-y-8">
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

          <SecaoArquivos
            anexos={anexos}
            onAnexos={setAnexos}
            referencias={referencias}
            onReferencias={setReferencias}
            novaReferencia={novaReferencia}
            onNovaReferencia={setNovaReferencia}
            linkBrutos={linkBrutos}
            onLinkBrutos={setLinkBrutos}
          />
        </div>
      </div>
    </ModalFormulario>
  )
}
