"use client"

import { useState, type ReactNode } from "react"
import { ArrowRight, CheckCircle2, Circle, CircleDot, Copy, Download, ExternalLink, Loader2, MinusCircle } from "lucide-react"
import { toast } from "sonner"
import { hojeEmSaoPaulo } from "@/lib/datas"
import { momentoDoJob, rotuloDoMomento } from "@/lib/ficha-do-job"
import {
  esperaMaterial,
  etapaDaGravacao,
  faltaOMaterial,
  linkValido,
  materialCompleto,
  passoDaGravacao,
  situacaoDaNota,
  statusDoMaterial,
  trilhaDoVideo,
  type EstadoDoPasso,
  type PagamentoDoCard,
  type PassoDaTrilha,
} from "@/lib/etapas-da-gravacao"
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
  historicos?: { statusNovo: string; createdAt: string }[] | null
  /** O card aberto recebe também o arquivo e o token da nota (só quem vê a nota). */
  custos?: { statusPagamento: string; pago: boolean; notaFiscalUrl?: string | null }[] | null
  notasFiscais?: { status: string; token?: string | null; url?: string | null }[] | null
  /** O convite do videomaker nesta gravação: o link dele para entregar (lib/entrega-da-gravacao.ts). */
  conviteEntrega?: { token: string } | null
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

/** O passo da vez: título, uma frase e só o campo e os botões que cabem agora. */
export function AgoraDaGravacao({
  job,
  podeEditar,
  onAvancar,
  onConfirmarVideomaker,
  onEscalar,
}: {
  job: GravacaoDoPasso
  podeEditar: boolean
  /** Grava os campos (se houver) e muda o status. Lança com a frase do servidor. */
  onAvancar: (statusInterno: string, patch?: Record<string, unknown>) => Promise<void>
  onConfirmarVideomaker: (aceite: boolean) => void
  /** Leva a "Equipe e contexto", onde se escala o videomaker. */
  onEscalar: () => void
}) {
  const passo = passoDaGravacao(job)
  const [link, setLink] = useState("")
  const [salvando, setSalvando] = useState<string | null>(null)
  const vm = primeiroNome(job.videomaker?.nome)

  async function avancar(chave: string, statusInterno: string, patch?: Record<string, unknown>) {
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

  const botao = (chave: string, rotulo: string, acao: () => void, principal = false, precisaLink = false) => (
    <button
      type="button"
      onClick={acao}
      disabled={salvando !== null || (precisaLink && !link.trim())}
      className={principal ? surface.btnPrimary : surface.btn}
    >
      {salvando === chave ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
      {rotulo}
    </button>
  )

  const campoDoLink = (placeholder: string) => (
    <input
      className={surface.input}
      type="url"
      inputMode="url"
      aria-label={placeholder}
      placeholder={placeholder}
      value={link}
      onChange={(e) => setLink(e.target.value)}
    />
  )

  let titulo = ""
  let dica: string | null = null
  let conteudo: ReactNode = null

  switch (passo) {
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
      // link; se vier pelo WhatsApp, anexa por ele nas entregas, logo abaixo.
      dica = `${vm} entrega ${job.edicaoPor === "videomaker" ? "os brutos e o vídeo pronto" : "os brutos"} pelo link do convite. Se mandar pelo WhatsApp, anexe por ele nas entregas.`
      const token = job.conviteEntrega?.token
      if (podeEditar && token) conteudo = (
        <button type="button" className={falta ? surface.btnPrimary : surface.btn} onClick={() => copiar(`${window.location.origin}/convite/${token}`, "Link de entrega copiado — mande para o videomaker")}>
          <Copy className="w-3.5 h-3.5" aria-hidden />Copiar link de entrega
        </button>
      )
      break
    }

    case "edicao":
      titulo = job.editor?.nome ? `Na edição com ${primeiroNome(job.editor.nome)}` : "Na edição"
      dica = "Com o vídeo final pronto, cole o link."
      if (podeEditar) conteudo = (
        <>
          {job.linkBrutos && <a className={surface.linkBtn} href={job.linkBrutos} target="_blank" rel="noopener noreferrer">Abrir o material <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>}
          {campoDoLink("Link do vídeo final")}
          <div>{botao("pronto", "Pronto para enviar ao cliente", () => avancar("pronto", "aprovado", { linkFinal: link.trim() }), true, true)}</div>
        </>
      )
      break

    case "enviar":
      titulo = "Enviar ao cliente"
      dica = "Mande o vídeo ao cliente e marque aqui."
      if (podeEditar) conteudo = (
        <>
          {job.linkFinal ? (
            <div className="flex flex-wrap items-center gap-3">
              <a className={surface.linkBtn} href={job.linkFinal} target="_blank" rel="noopener noreferrer">Abrir o vídeo <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>
              <button type="button" className={surface.linkBtn} onClick={() => copiar(job.linkFinal!, "Link do vídeo copiado")}>Copiar link <Copy className="w-3.5 h-3.5" aria-hidden /></button>
            </div>
          ) : campoDoLink("Link do vídeo final")}
          <div>
            {botao("enviado", "Marcar como enviado", () => avancar("enviado", "entregue_cliente", link.trim() ? { linkFinal: link.trim() } : undefined), true, !job.linkFinal)}
          </div>
        </>
      )
      break

    case "concluido":
      titulo = job.statusInterno === "encerrado" && !job.linkFinal ? "Encerrado sem entrega" : "Enviado ao cliente"
      if (job.linkFinal) conteudo = <a className={surface.linkBtn} href={job.linkFinal} target="_blank" rel="noopener noreferrer">Abrir o vídeo <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>
      break
  }

  return (
    <section className={styles.agora} aria-label="Agora">
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
 * linha diz se chegou e quando, com o link; o que falta tem "Anexar por ele",
 * para quando vem pelo WhatsApp. Material completo anda a gravação, como na
 * entrega pelo link (lib/entrega-da-gravacao.ts). A nota segue até compras.
 */
export function EntregasDoVideomaker({ job, podeEditar, onSalvar, onAvancar, onAtualizar }: {
  job: GravacaoDoPasso
  podeEditar: boolean
  onSalvar: (patch: Record<string, unknown>) => Promise<void>
  onAvancar: (statusInterno: string, patch?: Record<string, unknown>) => Promise<void>
  onAtualizar: () => Promise<unknown> | void
}) {
  const [anexando, setAnexando] = useState<"brutos" | "video" | null>(null)
  const [link, setLink] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [agindo, setAgindo] = useState<string | null>(null)
  const [plano, setPlano] = useState<string | null>(null)
  if (!job.videomaker) return null

  const etapa = etapaDaGravacao(job)
  // Antes do dia da gravação o material ainda não falta: fica "depois da
  // gravação", mas já dá para anexar (há quem entregue no mesmo dia).
  const antesDaGravacao = etapa === "a_agendar" || (esperaMaterial(job) && !faltaOMaterial(job, hojeEmSaoPaulo()))
  const editaEle = job.edicaoPor === "videomaker"
  const nota = situacaoDaNota(job)
  const tokenNota = job.notasFiscais?.find((n) => n.token && n.status === "pendente")?.token ?? job.notasFiscais?.find((n) => n.token)?.token
  const linkDaNota = tokenNota ? `${typeof window === "undefined" ? "" : window.location.origin}/nf-upload/${tokenNota}` : null
  const arquivo = job.custos?.find((c) => c.notaFiscalUrl)?.notaFiscalUrl ?? job.notasFiscais?.find((n) => n.url)?.url ?? null

  async function anexar() {
    if (!anexando || !linkValido(link)) return toast.error("Cole um link que comece com https://")
    const valor = link.trim()
    const patch: Record<string, unknown> = anexando === "brutos"
      ? { linkBrutos: valor, ...(job.edicaoPor === "sem_edicao" && !job.linkFinal ? { linkFinal: valor } : {}) }
      : { linkFinal: valor }
    const depois = { ...job, ...patch } as GravacaoDoPasso
    setSalvando(true)
    try {
      // Completou o material agora: anda a gravação junto, como no link do convite.
      if (materialCompleto(depois) && esperaMaterial(job)) await onAvancar(statusDoMaterial(job.edicaoPor), patch)
      else await onSalvar(patch)
      setAnexando(null); setLink("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível anexar.")
    } finally {
      setSalvando(false)
    }
  }

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

  const linhaDeLink = (qual: "brutos" | "video", rotulo: string, valor: string | null | undefined) => (
    <li className={styles.entrega} data-estado={valor ? "feito" : antesDaGravacao ? "depois" : "falta"}>
      <span className={styles.entregaRotulo}>{valor ? <CheckCircle2 aria-hidden /> : <Circle aria-hidden />}{rotulo}</span>
      {valor
        ? <a className={surface.linkBtn} href={valor} target="_blank" rel="noopener noreferrer">Abrir <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>
        : etapa === "a_agendar"
          ? <span className={surface.hint}>depois da gravação</span>
          : podeEditar && anexando !== qual
            ? <button type="button" className={surface.linkBtn} onClick={() => { setAnexando(qual); setLink("") }}>Anexar por ele</button>
            : antesDaGravacao && <span className={surface.hint}>depois da gravação</span>}
      {anexando === qual && (
        <div className={styles.anexar}>
          <input className={surface.input} type="url" inputMode="url" aria-label={`Link: ${rotulo}`} placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={surface.btnPrimary} onClick={() => void anexar()} disabled={salvando || !link.trim()}>
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}Salvar
            </button>
            <button type="button" className={surface.btn} onClick={() => setAnexando(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </li>
  )

  return (
    <section className={styles.entregas} aria-label="Entregas do videomaker">
      <span className={styles.rotulo}>Entregas do videomaker</span>
      <ul className={styles.listaEntregas}>
        {linhaDeLink("brutos", "Brutos (drive)", job.linkBrutos)}
        {editaEle
          ? linhaDeLink("video", "Vídeo pronto", job.linkFinal)
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
