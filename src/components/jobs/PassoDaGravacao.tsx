"use client"

import { useState, type ReactNode } from "react"
import { ArrowRight, Copy, ExternalLink, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { hojeEmSaoPaulo } from "@/lib/datas"
import {
  faltaOMaterial,
  passoDaGravacao,
  situacaoDaNota,
  type PagamentoDoCard,
} from "@/lib/etapas-da-gravacao"
import surface from "@/components/demandas/DemandSurface.module.css"
import styles from "./FichaDoJob.module.css"
import { TAG_DA_NOTA } from "./etiquetas"

/**
 * O passo da vez da gravação externa, dentro da ficha do card aberto.
 *
 * Progressivo (pedido do Giovani, 28/10/2026): aparece só o que cabe agora.
 * Sem videomaker, o botão de escalar; com o convite na rua, a confirmação;
 * agendado, o lugar do link do material; na edição, o do vídeo final; pronto,
 * "marcar como enviado". A nota do videomaker corre ao lado, a partir do
 * material — com o link que ele usa para mandar a nota, para copiar ou abrir.
 *
 * Campos, botões e textos são os do card aberto de Demandas
 * (DemandSurface.module.css); as etiquetas, as do card (./etiquetas).
 */

export type GravacaoDoPasso = Omit<PagamentoDoCard, "notasFiscais"> & {
  statusInterno: string
  videomakerId?: string | null
  videomaker?: { nome: string } | null
  editor?: { nome: string } | null
  edicaoPor?: string | null
  linkBrutos?: string | null
  linkFinal?: string | null
  dataCaptacao?: string | null
  dataEvento?: string | null
  /** O card aberto recebe também o token: é o link que o videomaker usa para mandar a nota. */
  notasFiscais?: { status: string; token?: string | null }[] | null
}

const primeiroNome = (nome?: string | null) => nome?.trim().split(/\s+/)[0] ?? "o videomaker"

export function PassoDaGravacao({
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
  const nota = situacaoDaNota(job)
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
      titulo = falta ? `Gravou — falta o material de ${vm}` : "Quando o material chegar"
      dica = job.edicaoPor === "equipe" ? "Cole o link do drive. Vai para a nossa edição."
        : job.edicaoPor === "videomaker" ? "Cole o link do vídeo editado. Vai direto para enviar ao cliente."
        : job.edicaoPor === "sem_edicao" ? "Cole o link dos brutos. Vai direto para enviar ao cliente."
        : "Cole o link do drive e diga se veio editado."
      const paraEdicao = () => avancar("edicao", "brutos_enviados", { linkBrutos: link.trim() })
      const pronto = () => avancar("pronto", "aprovado", { linkBrutos: link.trim(), linkFinal: link.trim() })
      if (podeEditar) conteudo = (
        <>
          {campoDoLink("Link do drive ou do vídeo")}
          <div className="flex flex-wrap gap-2">
            {job.edicaoPor !== "videomaker" && job.edicaoPor !== "sem_edicao" && botao("edicao", "Mandar para a edição", paraEdicao, true, true)}
            {job.edicaoPor !== "equipe" && botao("pronto", job.edicaoPor ? "Pronto para enviar ao cliente" : "Já veio editado", pronto, !!job.edicaoPor, true)}
          </div>
        </>
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

  const token = job.notasFiscais?.find((n) => n.token && n.status === "pendente")?.token
    ?? job.notasFiscais?.find((n) => n.token)?.token
  const linkDaNota = token ? `${typeof window === "undefined" ? "" : window.location.origin}/nf-upload/${token}` : null

  return (
    <div className={styles.passo}>
      <div className={styles.campo}>
        <span className={styles.rotulo}>Próximo passo</span>
        <strong className={styles.valor}>{titulo}</strong>
        {dica && <span className={surface.hint}>{dica}</span>}
      </div>
      {conteudo && <div className={styles.passoAcoes}>{conteudo}</div>}

      {nota && (
        <div className={cn(styles.campo, styles.passoNota)}>
          <span className={styles.rotulo}>Nota do videomaker</span>
          <span><span className={TAG_DA_NOTA[nota.tom]}>🧾 {nota.texto}</span></span>
          {(nota.texto === "Falta a nota" || nota.tom === "alerta") && (linkDaNota ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={surface.linkBtn} onClick={() => copiar(linkDaNota, "Link da nota copiado — mande para o videomaker")}>Copiar link para o videomaker <Copy className="w-3.5 h-3.5" aria-hidden /></button>
              <a className={surface.linkBtn} href={linkDaNota} target="_blank" rel="noopener noreferrer">Abrir e anexar a nota <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>
            </div>
          ) : <span className={surface.hint}>O link da nota é criado quando o material é marcado como recebido.</span>)}
          {nota.texto === "Nota recebida" && <a className={surface.linkBtn} href="/aprovacoes">Aprovar o pagamento em Aprovações <ArrowRight className="w-3.5 h-3.5" aria-hidden /></a>}
          {nota.texto === "Pagamento programado" && <span className={surface.hint}>Aprovado; com o financeiro.</span>}
        </div>
      )}
    </div>
  )
}

function copiar(texto: string, aviso: string) {
  navigator.clipboard.writeText(texto).then(() => toast.success(aviso), () => toast.error("Não foi possível copiar."))
}
