"use client"

import { useState, type ReactNode } from "react"
import { ArrowRight, CheckCircle2, Circle, CircleDot, Copy, ExternalLink, Loader2, MinusCircle } from "lucide-react"
import { toast } from "sonner"
import { hojeEmSaoPaulo } from "@/lib/datas"
import { momentoDoJob, rotuloDoMomento } from "@/lib/ficha-do-job"
import {
  faltaOMaterial,
  foiCancelada,
  linkDoVideoParaOCliente,
  passoDaGravacao,
  trilhaDoVideo,
  type EstadoDoPasso,
  type PagamentoDoCard,
  type PassoDaTrilha,
} from "@/lib/etapas-da-gravacao"
import { videosDaGravacao } from "@/lib/videos-da-gravacao"
import surface from "@/components/demandas/DemandSurface.module.css"
import styles from "./FichaDoJob.module.css"

/**
 * A linha do tempo da gravação externa, no topo da ficha do card aberto, e a
 * faixa "Agora" logo abaixo dela.
 *
 * Pedido do Giovani (28 e 29/10/2026): o card aberto estava confuso. Agora é
 * uma trilha do vídeo (pedido → envio ao cliente) e o "Agora" com a frase e o
 * botão da vez. Desde 05/11 o "Agora" é uma faixa sem campo: o material entra
 * pelo bloco "Arquivos" (ArquivosDaGravacao.tsx), à esquerda.
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
  arquivos?: { id?: string; tipoArquivo: string; url: string; originalUrl?: string | null; nomeArquivo?: string | null; thumbnailUrl?: string | null }[] | null
  /** As pastas de antes do bloco "Arquivos": só aparecem, não têm campo. */
  linkFolderBrutos?: string | null
  linkFolderFinal?: string | null
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

/**
 * A faixa "Agora": a frase da etapa e o botão principal, entre a trilha e as
 * duas colunas da ficha. Sem campo de link: o material entra pelo bloco
 * "Arquivos", e aqui só se anda a etapa.
 *
 * Fica fora do bloco "Arquivos" (decisão de 05/11) porque metade das etapas não
 * é sobre arquivo — escalar, confirmar, marcar como enviado — e porque, logo
 * abaixo da trilha, a próxima ação é a primeira coisa que se lê, nas duas
 * colunas e no celular.
 */
export function AgoraDaGravacao({
  job,
  podeEditar,
  onAvancar,
  onConfirmarVideomaker,
  onEscalar,
  onLinkPublico,
}: {
  job: GravacaoDoPasso
  podeEditar: boolean
  /** Muda o status. Lança com a frase do servidor. */
  onAvancar: (statusInterno: string, patch?: Record<string, unknown>) => Promise<void>
  onConfirmarVideomaker: (aceite: boolean) => void
  /** Leva a "Equipe e contexto" e abre a lista de videomakers. */
  onEscalar: () => void
  /** Garante o link público (o do Compartilhar) e devolve o token dele. */
  onLinkPublico?: () => Promise<string | null>
}) {
  const passo = passoDaGravacao(job)
  const [salvando, setSalvando] = useState<string | null>(null)
  const vm = primeiroNome(job.videomaker?.nome)
  const temVideo = !!job.linkFinal?.trim()
  // Mais de um vídeo: o link que vai ao cliente é o da página de acompanhamento
  // (/d/<token>), que mostra todos com as miniaturas.
  const variosVideos = videosDaGravacao(job.linkFinal, (job.arquivos ?? []).filter((a) => a.tipoArquivo === "final")).length > 1

  async function avancar(chave: string, statusInterno: string) {
    setSalvando(chave)
    try {
      await onAvancar(statusInterno)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível avançar a gravação.")
    } finally {
      setSalvando(null)
    }
  }

  // O link que vai para o cliente. O vídeo subido só abre sem login com o
  // token do link público; sem ele, gera o link (como o Compartilhar faz).
  async function copiarLinkDoVideo() {
    const origem = window.location.origin
    if (variosVideos) {
      try {
        const token = job.publicTokenAtivo && job.publicToken ? job.publicToken : await onLinkPublico?.()
        if (!token) return toast.error("Não foi possível gerar o link dos vídeos.")
        return copiar(`${origem}/d/${token}`, "Link dos vídeos copiado — abre sem login")
      } catch (e) {
        return toast.error(e instanceof Error ? e.message : "Não foi possível gerar o link dos vídeos.")
      }
    }
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

  const botao = (chave: string, rotulo: string, acao: () => void, principal = true, bloqueado = false, motivo?: string) => (
    <button type="button" onClick={acao} disabled={salvando !== null || bloqueado} title={bloqueado ? motivo : undefined}
      className={principal ? surface.btnPrimary : surface.btn}>
      {salvando === chave ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
      {rotulo}
    </button>
  )

  let titulo = ""
  let dica: string | null = null
  let acoes: ReactNode = null

  switch (passo) {
    case "escalar":
      titulo = "Escolher quem vai gravar"
      dica = "Escalado, o videomaker recebe o convite com o brief."
      if (podeEditar) acoes = <button type="button" className={surface.btnPrimary} onClick={onEscalar}>Escalar videomaker <ArrowRight className="w-3.5 h-3.5" aria-hidden /></button>
      break

    case "confirmar":
      titulo = `Aguardando ${vm} confirmar`
      dica = "O convite foi enviado. Se ele confirmou por fora, marque aqui."
      if (podeEditar) acoes = (
        <>
          <button type="button" className={surface.btnPrimary} onClick={() => onConfirmarVideomaker(true)}>Confirmou</button>
          <button type="button" className={surface.btnDanger} onClick={() => onConfirmarVideomaker(false)}>Recusou</button>
        </>
      )
      break

    case "material": {
      const falta = faltaOMaterial(job, hojeEmSaoPaulo())
      const quando = momentoDoJob(job)
      titulo = falta ? `Gravou — falta o material de ${vm}` : `Gravação com ${vm}${quando ? ` · ${rotuloDoMomento(quando)}` : ""}`
      // O material vem dele, pelo link do convite. A Débora cobra copiando o
      // link; se vier pelo WhatsApp, cola em "Arquivos".
      dica = `${vm} entrega ${job.edicaoPor === "videomaker" ? "os brutos e o vídeo pronto" : "os brutos"} pelo link do convite. Se mandar pelo WhatsApp, cole em “Arquivos”.`
      const token = job.conviteEntrega?.token
      if (podeEditar && token) acoes = (
        <button type="button" className={falta ? surface.btnPrimary : surface.btn} onClick={() => copiar(`${window.location.origin}/convite/${token}`, "Link de entrega copiado — mande para o videomaker")}>
          <Copy className="w-3.5 h-3.5" aria-hidden />Copiar link de entrega
        </button>
      )
      break
    }

    case "edicao":
      titulo = job.editor?.nome ? `Na edição com ${primeiroNome(job.editor.nome)}` : "Na edição"
      dica = temVideo ? "O vídeo final está em “Arquivos”. Confira e libere o envio." : "Suba o vídeo final em “Arquivos” para liberar o envio."
      if (podeEditar) acoes = botao("pronto", "Pronto para enviar ao cliente", () => void avancar("pronto", "aprovado"), true, !temVideo, "Falta o vídeo final em “Arquivos”")
      break

    case "enviar":
      titulo = "Enviar ao cliente"
      dica = temVideo ? "Mande o vídeo ao cliente e marque aqui." : "Falta o vídeo final em “Arquivos”."
      if (podeEditar) acoes = (
        <>
          {temVideo && <button type="button" className={surface.btn} onClick={() => void copiarLinkDoVideo()}><Copy className="w-3.5 h-3.5" aria-hidden />{variosVideos ? "Copiar link dos vídeos" : "Copiar link do vídeo"}</button>}
          {botao("enviado", "Marcar como enviado", () => void avancar("enviado", "entregue_cliente"), true, !temVideo, "Falta o vídeo final em “Arquivos”")}
        </>
      )
      break

    case "concluido":
      titulo = foiCancelada(job) ? "Gravação cancelada" : "Enviado ao cliente"
      if (temVideo) acoes = <a className={surface.linkBtn} href={job.linkFinal!} target="_blank" rel="noopener noreferrer">Abrir o vídeo <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>
      break
  }

  return (
    <section id="agora-da-gravacao" className={styles.faixaAgora} aria-label="Agora">
      <div className={styles.faixaTexto}>
        <span className={styles.rotulo}>Agora</span>
        <strong className={styles.valor}>{titulo}</strong>
        {dica && <span className={surface.hint}>{dica}</span>}
      </div>
      {acoes && <div className={styles.faixaAcoes}>{acoes}</div>}
    </section>
  )
}
