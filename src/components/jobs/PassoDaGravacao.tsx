"use client"

import { useRef, useState, type ReactNode } from "react"
import { ArrowRight, CheckCircle2, Circle, CircleDot, Copy, Download, ExternalLink, Film, FolderOpen, Loader2, MinusCircle, Send, Upload } from "lucide-react"
import { toast } from "sonner"
import { hojeEmSaoPaulo } from "@/lib/datas"
import { momentoDoJob, rotuloDoMomento } from "@/lib/ficha-do-job"
import {
  arquivoDoVideoFinal,
  esperaMaterial,
  etapaDaGravacao,
  faltaOMaterial,
  foiCancelada,
  linkDoVideoParaOCliente,
  linkValido,
  passoDaGravacao,
  patchDosBrutos,
  situacaoDaNota,
  statusAoGravarMaterial,
  trilhaDoVideo,
  type EstadoDoPasso,
  type TrocaNoAgora,
  type PagamentoDoCard,
  type PassoDaTrilha,
} from "@/lib/etapas-da-gravacao"
import { LIMITE_VIDEO_NA_TELA_MB } from "@/lib/upload-video"
import { cn } from "@/lib/utils"
import surface from "@/components/demandas/DemandSurface.module.css"
import styles from "./FichaDoJob.module.css"
import { TAG_DA_NOTA } from "./etiquetas"

/**
 * A linha do tempo da gravação externa, no topo da ficha do card aberto.
 *
 * Pedido do Giovani (28 e 29/10/2026): o card aberto estava confuso. Agora é
 * uma trilha do vídeo (pedido → envio ao cliente), o painel "Agora" com só o
 * campo da vez — contratou o videomaker, aparece o link do material; chegou o
 * material, aparece a nota — e, desde o material, a trilha da nota até compras.
 *
 * Campos, botões e textos são os do card aberto de Demandas
 * (DemandSurface.module.css).
 */

export type GravacaoDoPasso = Omit<PagamentoDoCard, "notasFiscais" | "custos"> & {
  id: string
  statusInterno: string
  videomakerId?: string | null
  videomaker?: { nome: string } | null
  editor?: { nome: string } | null
  edicaoPor?: string | null
  linkBrutos?: string | null
  linkFinal?: string | null
  dataCaptacao?: string | null
  dataEvento?: string | null
  createdAt?: string | null
  finalizadaEm?: string | null
  historicos?: { statusNovo: string; createdAt: string; observacao?: string | null }[] | null
  /** O card aberto recebe também o arquivo e o token da nota (só quem vê a nota). */
  custos?: { statusPagamento: string; pago: boolean; notaFiscalUrl?: string | null }[] | null
  notasFiscais?: { status: string; token?: string | null; url?: string | null }[] | null
  /** O convite do videomaker nesta gravação: o link dele para entregar (lib/entrega-da-gravacao.ts). */
  conviteEntrega?: { token: string } | null
  /** O link público (Compartilhar, /d/<token>): é com ele que o vídeo subido abre para o cliente. */
  publicToken?: string | null
  publicTokenAtivo?: boolean | null
  /** Os arquivos do card: o nome do vídeo final subido vem daqui. */
  arquivos?: { tipoArquivo: string; url: string; originalUrl?: string | null; nomeArquivo?: string | null }[] | null
}

const primeiroNome = (nome?: string | null) => nome?.trim().split(/\s+/)[0] ?? "o videomaker"

const ICONE: Record<EstadoDoPasso, ReactNode> = {
  feito: <CheckCircle2 aria-hidden />,
  agora: <CircleDot aria-hidden />,
  depois: <Circle aria-hidden />,
  pulado: <MinusCircle aria-hidden />,
}
const ESTADO_LIDO: Record<EstadoDoPasso, string> = { feito: "feito", agora: "agora", depois: "a fazer", pulado: "não se aplica" }

export function Trilha({ passos, rotulo }: { passos: PassoDaTrilha[]; rotulo: string }) {
  return (
    <ol className={styles.trilha} aria-label={rotulo} style={{ ["--passos" as string]: passos.length }}>
      {passos.map((p) => (
        <li key={p.id} data-estado={p.estado} aria-current={p.estado === "agora" ? "step" : undefined}>
          <span className={styles.trilhaRotulo}>{ICONE[p.estado]}{p.rotulo}</span>
          <small>{p.detalhe ?? <span className="sr-only">{ESTADO_LIDO[p.estado]}</span>}</small>
        </li>
      ))}
    </ol>
  )
}

export function TrilhaDoVideo({ job }: { job: GravacaoDoPasso }) {
  return <Trilha passos={trilhaDoVideo(job, hojeEmSaoPaulo())} rotulo="Andamento da gravação" />
}

function copiar(texto: string, aviso: string) {
  navigator.clipboard.writeText(texto).then(() => toast.success(aviso), () => toast.error("Não foi possível copiar."))
}

/** O nome do arquivo do vídeo final, quando ele foi subido (o link colado não tem nome). */
const nomeDoVideoFinal = (job: GravacaoDoPasso) => arquivoDoVideoFinal(job)?.nomeArquivo?.trim() || null

/**
 * O passo da vez: título, uma frase e só o campo e os botões que cabem agora.
 *
 * É o único lugar do card para mandar mídia (Giovani, 04/11/2026: "2 lugar
 * para anexar a midia, temos que simplificar"): os brutos no passo do
 * material, o vídeo final na edição. Corrigir é o "Trocar", que abre o campo
 * aqui mesmo — o bloco "Arquivos", embaixo, só mostra o que chegou.
 */
export function AgoraDaGravacao({
  job,
  podeEditar,
  onSalvar,
  onAvancar,
  onConfirmarVideomaker,
  onEscalar,
  onEnviarVideo,
  onLinkPublico,
  troca: trocaDeFora,
  onTroca,
}: {
  job: GravacaoDoPasso
  podeEditar: boolean
  /** Grava campos sem mudar o status (um link trocado). Lança com a frase do servidor. */
  onSalvar: (patch: Record<string, unknown>) => Promise<void>
  /** Grava os campos (se houver) e muda o status. Lança com a frase do servidor. */
  onAvancar: (statusInterno: string, patch?: Record<string, unknown>) => Promise<void>
  onConfirmarVideomaker: (aceite: boolean) => void
  /** Leva a "Equipe e contexto", onde se escala o videomaker. */
  onEscalar: () => void
  /**
   * Sobe o vídeo final pelo envio de Demandas (lib/upload-video) e recarrega o
   * card: o linkFinal passa a ser o arquivo. Devolve o endereço dele. Lança
   * com a frase para a tela.
   */
  onEnviarVideo?: (file: File, onProgress: (pct: number) => void) => Promise<string>
  /** Garante o link público (o do Compartilhar) e devolve o token dele. */
  onLinkPublico?: () => Promise<string | null>
  /** O campo aberto para trocar um link. O "Trocar" do bloco de Arquivos abre aqui. */
  troca?: TrocaNoAgora | null
  onTroca?: (troca: TrocaNoAgora | null) => void
}) {
  const passo = passoDaGravacao(job)
  const [link, setLink] = useState("")
  const [brutos, setBrutos] = useState("")
  const [salvando, setSalvando] = useState<string | null>(null)
  // O vídeo final entra por uma de duas portas, como no envio de Demandas.
  const [porta, setPorta] = useState<"arquivo" | "link">("arquivo")
  const [enviando, setEnviando] = useState<{ nome: string; pct: number } | null>(null)
  const [trocaLocal, setTrocaLocal] = useState<TrocaNoAgora | null>(null)
  const troca = podeEditar ? (trocaDeFora !== undefined ? trocaDeFora : trocaLocal) : null
  const setTroca = onTroca ?? setTrocaLocal
  const arquivoRef = useRef<HTMLInputElement>(null)
  const vm = primeiroNome(job.videomaker?.nome)
  const editaEle = job.edicaoPor === "videomaker"
  const ocupado = salvando !== null || enviando !== null

  function limpar() {
    setLink("")
    setBrutos("")
    setTroca(null)
  }

  async function avancar(chave: string, statusInterno: string, patch?: Record<string, unknown>) {
    if (typeof patch?.linkFinal === "string" && !linkValido(patch.linkFinal)) return void toast.error("Cole um link que comece com https://")
    setSalvando(chave)
    try {
      await onAvancar(statusInterno, patch)
      setLink("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível avançar a gravação.")
    } finally {
      setSalvando(null)
    }
  }

  // Grava o link e, se ele completou o material, anda a gravação junto (como
  // na entrega pelo link do convite).
  async function gravar(chave: "brutos" | "video", patch: { linkBrutos?: string; linkFinal?: string }) {
    setSalvando(chave)
    try {
      const status = statusAoGravarMaterial(job, patch)
      if (status) await onAvancar(status, patch)
      else {
        await onSalvar(patch)
        toast.success(chave === "brutos" ? "Link dos brutos salvo." : "Link do vídeo salvo.")
      }
      limpar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o link.")
    } finally {
      setSalvando(null)
    }
  }

  function salvarBrutos() {
    if (!linkValido(brutos)) return void toast.error("Cole um link que comece com https://")
    void gravar("brutos", patchDosBrutos(job, brutos.trim()))
  }

  function salvarLinkDoVideo() {
    if (!linkValido(link)) return void toast.error("Cole um link que comece com https://")
    void gravar("video", { linkFinal: link.trim() })
  }

  async function enviarArquivo(file: File) {
    if (!onEnviarVideo) return
    setEnviando({ nome: file.name, pct: 0 })
    try {
      const url = await onEnviarVideo(file, (pct) => setEnviando({ nome: file.name, pct }))
      // O vídeo pronto do videomaker, com os brutos já no card, completa o material.
      const status = statusAoGravarMaterial(job, { linkFinal: url })
      if (status) await onAvancar(status)
      else toast.success("Vídeo final enviado.")
      limpar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o vídeo.")
    } finally {
      setEnviando(null)
      if (arquivoRef.current) arquivoRef.current.value = ""
    }
  }

  // O link que vai para o cliente. O vídeo subido só abre sem login com o
  // token do link público; sem ele, gera o link (como o Compartilhar faz).
  async function copiarLinkDoVideo() {
    const origem = window.location.origin
    let destino = linkDoVideoParaOCliente(job.linkFinal, job.publicTokenAtivo ? job.publicToken : null, origem)
    if (!destino && onLinkPublico) {
      try {
        destino = linkDoVideoParaOCliente(job.linkFinal, await onLinkPublico(), origem)
      } catch (e) {
        return toast.error(e instanceof Error ? e.message : "Não foi possível gerar o link do vídeo.")
      }
    }
    if (!destino) return toast.error("Não foi possível gerar o link do vídeo.")
    copiar(destino, "Link do vídeo copiado — abre sem login")
  }

  const botao = (chave: string, rotulo: string, acao: () => void, principal = false, vazio = false) => (
    <button
      type="button"
      onClick={acao}
      disabled={ocupado || vazio}
      className={principal ? surface.btnPrimary : surface.btn}
    >
      {salvando === chave ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
      {rotulo}
    </button>
  )

  const campo = (placeholder: string, valor: string, mudar: (v: string) => void, foco = false) => (
    <input
      className={cn(surface.input, "flex-1 min-w-0")}
      type="url"
      inputMode="url"
      aria-label={placeholder}
      placeholder={placeholder}
      value={valor}
      onChange={(e) => mudar(e.target.value)}
      autoFocus={foco}
    />
  )

  // O que já chegou, numa linha: o nome (do arquivo subido, ou o rótulo), Abrir e Trocar.
  const jaChegou = (rotulo: string, url: string, qual: TrocaNoAgora, nome?: string | null, extra?: ReactNode) => (
    <div className={cn(surface.fileRow, "w-full")}>
      <span className={surface.fileBadge}>{qual === "video" ? <Film className="w-4 h-4" aria-hidden /> : <FolderOpen className="w-4 h-4" aria-hidden />}</span>
      <span className={surface.fileName}>
        <span title={url}>{nome ?? rotulo}</span>
        <span>{nome ? rotulo : "chegou"}</span>
      </span>
      <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <a className={surface.linkBtn} href={url} target="_blank" rel="noopener noreferrer">Abrir <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>
        {extra}
        <button type="button" className={surface.linkBtn} onClick={() => setTroca(qual)} disabled={ocupado}>Trocar</button>
      </span>
    </div>
  )

  // "Enviar arquivo" | "Colar link": as abas da janela de envio de Demandas.
  // Com `salvar`, o link colado tem o próprio botão; sem ele, vai no botão do passo.
  const portasDoVideo = (salvar = false) => (
    <div className="w-full flex flex-col gap-3">
      {onEnviarVideo && (
        <div className={surface.segmented} style={{ margin: 0 }}>
          <button type="button" aria-pressed={porta === "arquivo"} onClick={() => { setPorta("arquivo"); setLink("") }} disabled={enviando !== null}>Enviar arquivo</button>
          <button type="button" aria-pressed={porta === "link"} onClick={() => setPorta("link")} disabled={enviando !== null}>Colar link</button>
        </div>
      )}
      {onEnviarVideo && porta === "arquivo" ? (
        <>
          <input
            ref={arquivoRef}
            type="file"
            accept="video/*"
            className="hidden"
            aria-label="Arquivo do vídeo final"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarArquivo(f) }}
          />
          {enviando ? (
            <div className={surface.fileRow} role="status" aria-live="polite">
              <span className={surface.fileBadge}><Loader2 className="w-4 h-4 animate-spin" aria-hidden /></span>
              <span className={surface.fileName}>
                <span>{enviando.nome}</span>
                <span>Enviando… {enviando.pct}%</span>
              </span>
            </div>
          ) : (
            <button type="button" className={surface.dropzone} onClick={() => arquivoRef.current?.click()} disabled={salvando !== null}>
              <Upload className="w-5 h-5" aria-hidden />
              <span>Escolher arquivo</span>
              <span className={surface.hint}>mp4, mov, avi, webm · até {LIMITE_VIDEO_NA_TELA_MB} MB</span>
            </button>
          )}
        </>
      ) : (
        <div className="flex w-full flex-wrap gap-2">
          {campo("Link do vídeo final", link, setLink)}
          {salvar && botao("video", "Salvar", salvarLinkDoVideo, true, !link.trim())}
        </div>
      )}
    </div>
  )

  const campoDosBrutos = (principal: boolean, foco = false) => (
    <div className="flex w-full flex-wrap gap-2">
      {campo("Link dos brutos (drive)", brutos, setBrutos, foco)}
      {botao("brutos", "Salvar", salvarBrutos, principal, !brutos.trim())}
    </div>
  )

  let titulo = ""
  let dica: string | null = null
  let conteudo: ReactNode = null

  switch (troca ? "troca" : passo) {
    // Corrigir um link: o mesmo campo, aqui. Salvo, volta ao passo da vez.
    case "troca":
      titulo = troca === "brutos" ? "Trocar o link dos brutos" : "Trocar o vídeo final"
      dica = troca === "video" && onEnviarVideo ? "Suba o arquivo novo ou cole o link. Ele substitui o atual." : "Cole o link novo. Ele substitui o atual."
      conteudo = (
        <>
          {troca === "brutos" ? campoDosBrutos(true, true) : portasDoVideo(true)}
          <button type="button" className={surface.btn} onClick={limpar} disabled={ocupado}>Cancelar</button>
        </>
      )
      break

    case "escalar":
      titulo = "Escolher quem vai gravar"
      dica = "Escalado, o videomaker recebe o convite com o brief."
      if (podeEditar) conteudo = <button type="button" className={surface.btnPrimary} onClick={onEscalar}>Escalar videomaker <ArrowRight className="w-3.5 h-3.5" aria-hidden /></button>
      break

    case "confirmar":
      titulo = `Aguardando ${vm} confirmar`
      dica = "O convite foi enviado. Se ele confirmou por fora, marque aqui."
      if (podeEditar) conteudo = (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={surface.btnPrimary} onClick={() => onConfirmarVideomaker(true)}>Confirmou</button>
          <button type="button" className={surface.btnDanger} onClick={() => onConfirmarVideomaker(false)}>Recusou</button>
        </div>
      )
      break

    case "material": {
      const falta = faltaOMaterial(job, hojeEmSaoPaulo())
      const quando = momentoDoJob(job)
      titulo = falta ? `Gravou — falta o material de ${vm}` : `Gravação com ${vm}${quando ? ` · ${rotuloDoMomento(quando)}` : ""}`
      // O material vem dele, pelo link do convite. A Débora cobra copiando o
      // link; se vier pelo WhatsApp, cola aqui mesmo.
      dica = `${vm} entrega ${editaEle ? "os brutos e o vídeo pronto" : "os brutos"} pelo link do convite. Se mandar pelo WhatsApp, cole aqui.`
      const token = job.conviteEntrega?.token
      if (podeEditar) conteudo = (
        <>
          {token && (
            <button type="button" className={falta ? surface.btnPrimary : surface.btn} onClick={() => copiar(`${window.location.origin}/convite/${token}`, "Link de entrega copiado — mande para o videomaker")}>
              <Copy className="w-3.5 h-3.5" aria-hidden />Copiar link de entrega
            </button>
          )}
          {editaEle && <p className={cn(surface.subTitle, "mb-0 mt-1")}>Brutos</p>}
          {job.linkBrutos ? jaChegou("Brutos", job.linkBrutos, "brutos") : campoDosBrutos(!token)}
          {editaEle && (
            <>
              <p className={cn(surface.subTitle, "mb-0 mt-1")}>Vídeo pronto</p>
              {job.linkFinal ? jaChegou("Vídeo pronto", job.linkFinal, "video", nomeDoVideoFinal(job)) : portasDoVideo(true)}
            </>
          )}
        </>
      )
      break
    }

    case "edicao":
      titulo = job.editor?.nome ? `Na edição com ${primeiroNome(job.editor.nome)}` : "Na edição"
      dica = onEnviarVideo ? "Com o vídeo final pronto, suba o arquivo ou cole o link." : "Com o vídeo final pronto, cole o link."
      // Subido o arquivo, o vídeo já está no card: "Pronto" libera sem pedir link.
      if (podeEditar) conteudo = (
        <>
          {job.linkBrutos && <a className={surface.linkBtn} href={job.linkBrutos} target="_blank" rel="noopener noreferrer">Abrir o material <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>}
          {job.linkFinal ? jaChegou("Vídeo final", job.linkFinal, "video", nomeDoVideoFinal(job)) : portasDoVideo()}
          {botao("pronto", "Pronto para enviar ao cliente", () => void avancar("pronto", "aprovado", link.trim() ? { linkFinal: link.trim() } : undefined), true, !job.linkFinal && !link.trim())}
        </>
      )
      break

    case "enviar":
      titulo = "Enviar ao cliente"
      dica = "Mande o vídeo ao cliente e marque aqui."
      if (podeEditar) conteudo = (
        <>
          {job.linkFinal
            ? jaChegou("Vídeo final", job.linkFinal, "video", nomeDoVideoFinal(job),
              <button type="button" className={surface.linkBtn} onClick={() => void copiarLinkDoVideo()}>Copiar link <Copy className="w-3.5 h-3.5" aria-hidden /></button>)
            : portasDoVideo()}
          {botao("enviado", "Marcar como enviado", () => void avancar("enviado", "entregue_cliente", link.trim() ? { linkFinal: link.trim() } : undefined), true, !job.linkFinal && !link.trim())}
        </>
      )
      break

    case "concluido":
      titulo = foiCancelada(job) ? "Gravação cancelada" : "Enviado ao cliente"
      if (job.linkFinal) conteudo = <a className={surface.linkBtn} href={job.linkFinal} target="_blank" rel="noopener noreferrer">Abrir o vídeo <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>
      break
  }

  return (
    <section id="agora-da-gravacao" className={styles.agora} aria-label="Agora">
      <span className={styles.rotulo}>Agora</span>
      <strong className={styles.valor}>{titulo}</strong>
      {dica && <span className={surface.hint}>{dica}</span>}
      {conteudo && <div className={styles.passoAcoes}>{conteudo}</div>}
    </section>
  )
}

/**
 * O que o videomaker entrega, numa lista (Giovani, 29/10/2026): o drive dos
 * brutos (sempre), o vídeo pronto (só se a edição é dele) e a nota fiscal. Cada
 * linha diz se chegou. Desde 04/11/2026 a mídia entra só pelo "Agora" (um
 * lugar só): aqui a lista só mostra; abrir e trocar ficam no "Agora" e no
 * bloco "Arquivos". A nota segue até compras.
 */
export function EntregasDoVideomaker({ job, podeEditar, onAtualizar }: {
  job: GravacaoDoPasso
  podeEditar: boolean
  onAtualizar: () => Promise<unknown> | void
}) {
  const [agindo, setAgindo] = useState<string | null>(null)
  const [plano, setPlano] = useState<string | null>(null)
  if (!job.videomaker) return null

  const etapa = etapaDaGravacao(job)
  // Antes do dia da gravação o material ainda não falta: fica "depois da
  // gravação", mas já dá para anexar (há quem entregue no mesmo dia).
  const antesDaGravacao = etapa === "a_agendar" || (esperaMaterial(job) && !faltaOMaterial(job, hojeEmSaoPaulo()))
  const editaEle = job.edicaoPor === "videomaker"
  const nota = situacaoDaNota(job)
  // Cancelada: não há material a entregar; fica só a nota, se ele cobra o
  // cancelamento (lib/cancelar-gravacao.ts).
  const cancelada = foiCancelada(job)
  if (cancelada && !nota) return null
  const tokenNota = job.notasFiscais?.find((n) => n.token && n.status === "pendente")?.token ?? job.notasFiscais?.find((n) => n.token)?.token
  const linkDaNota = tokenNota ? `${typeof window === "undefined" ? "" : window.location.origin}/nf-upload/${tokenNota}` : null
  const arquivo = job.custos?.find((c) => c.notaFiscalUrl)?.notaFiscalUrl ?? job.notasFiscais?.find((n) => n.url)?.url ?? null

  async function agirNaNota(acao: "enviar_compras" | "marcar_enviada" | "marcar_paga") {
    setAgindo(acao)
    try {
      const res = await fetch(`/api/jobs/${job.id}/nota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      })
      const json = await res.json().catch(() => ({})) as { mensagem?: string; error?: string }
      if (!res.ok) {
        // O e-mail não saiu: o plano B fica na tela, não só no toast.
        if (acao === "enviar_compras") setPlano(json.error ?? "O e-mail para compras não saiu.")
        toast.error(json.error ?? "Não foi possível concluir.")
        return
      }
      setPlano(null)
      toast.success(json.mensagem ?? "Feito.")
      await onAtualizar()
    } catch {
      toast.error("Sem conexão. Tente de novo.")
    } finally {
      setAgindo(null)
    }
  }

  const botaoNota = (acao: "enviar_compras" | "marcar_enviada" | "marcar_paga", rotulo: string, principal: boolean) => (
    <button type="button" className={principal ? surface.btnPrimary : surface.btn} onClick={() => void agirNaNota(acao)} disabled={agindo !== null}>
      {agindo === acao ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
      {rotulo}
    </button>
  )
  const baixar = arquivo && (
    <a className={surface.btn} href={arquivo} target="_blank" rel="noopener noreferrer"><Download className="w-3.5 h-3.5" aria-hidden />Baixar nota</a>
  )

  const linhaDaEntrega = (rotulo: string, valor: string | null | undefined) => (
    <li className={styles.entrega} data-estado={valor ? "feito" : antesDaGravacao ? "depois" : "falta"}>
      <span className={styles.entregaRotulo}>{valor ? <CheckCircle2 aria-hidden /> : <Circle aria-hidden />}{rotulo}</span>
      <span className={surface.hint}>{valor ? "chegou" : antesDaGravacao ? "depois da gravação" : "falta"}</span>
    </li>
  )

  async function enviarKit() {
    setAgindo("kit")
    try {
      const r = await fetch(`/api/jobs/${job.id}/kit`, { method: "POST" })
      const json = await r.json().catch(() => ({})) as { mensagem?: string; error?: string }
      if (!r.ok) toast.error(json.error ?? "Não foi possível enviar.")
      else toast.success(json.mensagem ?? "Enviado.")
    } catch {
      toast.error("Sem conexão. Tente de novo.")
    } finally {
      setAgindo(null)
    }
  }

  return (
    <section className={styles.entregas} aria-label="Entregas do videomaker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={styles.rotulo}>Entregas do videomaker</span>
        {/* O guia, as referências e a colinha do kit, no WhatsApp dele. */}
        {podeEditar && !cancelada && (
          <button type="button" className={surface.linkBtn} onClick={() => void enviarKit()} disabled={agindo !== null}>
            {agindo === "kit" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Send className="w-3.5 h-3.5" aria-hidden />}
            Enviar instruções e referências
          </button>
        )}
      </div>
      <ul className={styles.listaEntregas}>
        {!cancelada && linhaDaEntrega("Brutos (drive)", job.linkBrutos)}
        {cancelada ? null : editaEle
          ? linhaDaEntrega("Vídeo pronto", job.linkFinal)
          : (
            <li className={styles.entrega} data-estado="pulado">
              <span className={styles.entregaRotulo}><MinusCircle aria-hidden />Vídeo pronto</span>
              <span className={surface.hint}>{job.edicaoPor === "sem_edicao" ? "sem edição" : job.edicaoPor === "equipe" ? "nós editamos" : "edição não combinada"}</span>
            </li>
          )}
        <li className={styles.entrega} data-estado={nota?.etapa === "paga" || nota?.etapa === "compras" || nota?.etapa === "recebida" ? "feito" : nota ? "falta" : "depois"}>
          <span className={styles.entregaRotulo}>{nota && nota.etapa !== "falta" && nota.etapa !== "contestada" ? <CheckCircle2 aria-hidden /> : <Circle aria-hidden />}Nota fiscal</span>
          <span className={nota ? TAG_DA_NOTA[nota.tom] : surface.hint}>{nota ? nota.texto : "depois do material"}</span>
        </li>
      </ul>

      {(nota?.etapa === "falta" || nota?.etapa === "contestada") && linkDaNota && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={surface.linkBtn} onClick={() => copiar(linkDaNota, "Link da nota copiado — mande para o videomaker")}>Copiar link da nota <Copy className="w-3.5 h-3.5" aria-hidden /></button>
          <a className={surface.linkBtn} href={linkDaNota} target="_blank" rel="noopener noreferrer">Anexar a nota por ele <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>
        </div>
      )}
      {nota?.etapa === "recebida" && (
        <>
          <div className="flex flex-wrap gap-2">
            {botaoNota("enviar_compras", "Enviar nota para compras", true)}
            {baixar}
          </div>
          <span className={surface.hint}>O e-mail vai com a nota e com cópia para você.</span>
          {plano && (
            <div className={surface.notice} role="alert">
              <p>{plano}</p>
              <div className="flex flex-wrap gap-2">
                {baixar}
                {botaoNota("marcar_enviada", "Já mandei por fora", false)}
              </div>
            </div>
          )}
        </>
      )}
      {nota?.etapa === "compras" && (
        <div className="flex flex-wrap gap-2">
          {botaoNota("marcar_paga", "Marcar nota como paga", true)}
          {baixar}
        </div>
      )}
    </section>
  )
}
