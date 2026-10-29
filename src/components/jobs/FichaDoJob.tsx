"use client"

import type { ReactNode } from "react"
import { CalendarClock, MapPin, Users, Building2, Package, ExternalLink } from "lucide-react"
import type { StatusInterno } from "@prisma/client"
import { InlineEdit } from "@/components/demandas/InlineEdit"
import {
  deCampoDataHora,
  distanciaDoMomento,
  linkWhatsapp,
  momentoDoJob,
  ondeDoJob,
  paraCampoDataHora,
  rotuloDoMomento,
  situacaoDaEquipe,
  telefoneLegivel,
} from "@/lib/ficha-do-job"
import { EDICAO, rotuloDaEdicao } from "@/lib/etapas-da-gravacao"
import { AgoraDaGravacao, NotaDaGravacao, TrilhaDoVideo, type GravacaoDoPasso } from "./PassoDaGravacao"
import styles from "./FichaDoJob.module.css"

/**
 * A ficha do Job, no topo do Pedido: quando, onde, quem vai e para quem.
 *
 * É a primeira coisa que se lê no Job porque é o que decide o dia de alguém —
 * quem vai gravar precisa da data, do endereço e do contato, não do briefing.
 * Faltando um desses, a ficha diz que falta (em âmbar) em vez de esconder.
 * Data e endereço editam ali mesmo; a escala do videomaker continua em
 * "Equipe e contexto", e o botão do próximo passo leva até lá.
 *
 * Abaixo da grade, o próximo passo (PassoDaGravacao): o campo da vez aparece
 * quando chega a hora, em vez de todos de uma vez. Quem edita entra junto do
 * videomaker, porque é combinado ao escalar.
 */

type Pessoa = { nome: string; telefone?: string | null }

export type JobDaFicha = Omit<GravacaoDoPasso, "statusInterno" | "videomaker" | "dataCaptacao" | "dataEvento"> & {
  statusInterno: StatusInterno
  dataCaptacao?: string | null
  dataEvento?: string | null
  localGravacao?: string | null
  localEvento?: string | null
  cidade?: string | null
  clienteFinalNome?: string | null
  clienteFinalTelefone?: string | null
  videomaker?: Pessoa | null
  responsaveis?: { usuario?: { nome?: string | null } | null }[] | null
  produtos?: { produto?: { nome?: string | null } | null }[] | null
}

export function FichaDoJob({
  job,
  podeEditar,
  onSalvar,
  onEscalar,
  onAvancar,
  onConfirmarVideomaker,
  onAtualizar,
  rodape,
  children,
}: {
  job: JobDaFicha
  podeEditar: boolean
  onSalvar: (patch: Record<string, unknown>) => Promise<void>
  /** Leva a "Equipe e contexto", onde se escala o videomaker. */
  onEscalar: () => void
  /** Grava os campos do passo (se houver) e muda o status. */
  onAvancar: (statusInterno: string, patch?: Record<string, unknown>) => Promise<void>
  onConfirmarVideomaker: (aceite: boolean) => void
  /** Recarrega o card depois de agir na nota. */
  onAtualizar: () => Promise<unknown> | void
  /** Linha final (de quem é a vez). A etapa já está na trilha. */
  rodape?: ReactNode
  children?: ReactNode
}) {
  const momento = momentoDoJob(job)
  const { endereco, cidade } = ondeDoJob(job)
  const ondeTexto = [endereco, cidade].filter(Boolean).join(" · ")
  // Mapa só com endereço: a cidade sozinha ("Remoto", "Curitiba") não leva a lugar nenhum.
  const mapa = endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ondeTexto)}` : null
  const situacao = situacaoDaEquipe(job.statusInterno, !!job.videomaker)
  const acompanham = [...new Set((job.responsaveis ?? []).map((r) => r.usuario?.nome?.trim()).filter((n): n is string => !!n))]
  const levar = (job.produtos ?? []).map((p) => p.produto?.nome?.trim()).filter((n): n is string => !!n)
  const cliente = job.clienteFinalNome?.trim() || null
  const telCliente = telefoneLegivel(job.clienteFinalTelefone)
  const zapCliente = linkWhatsapp(job.clienteFinalTelefone)
  const telVm = telefoneLegivel(job.videomaker?.telefone)
  const zapVm = linkWhatsapp(job.videomaker?.telefone)

  return (
    <section aria-label="Ficha da gravação" className={styles.ficha}>
      <TrilhaDoVideo job={job} />
      <AgoraDaGravacao
        job={job}
        podeEditar={podeEditar}
        onAvancar={onAvancar}
        onConfirmarVideomaker={onConfirmarVideomaker}
        onEscalar={onEscalar}
      />
      <NotaDaGravacao job={job} onAtualizar={onAtualizar} />

      <div className={styles.grade}>
        <div className={styles.campo}>
          <span className={styles.rotulo}><CalendarClock aria-hidden /> Quando</span>
          <InlineEdit
            value={paraCampoDataHora(momento)}
            canEdit={podeEditar}
            tipo="datetime-local"
            onSave={(v) => onSalvar({ dataCaptacao: v ? deCampoDataHora(v) : null })}
            display={momento
              ? <strong className={styles.valor}>{rotuloDoMomento(momento)}</strong>
              : <strong className={styles.falta}>Sem data definida</strong>}
          />
          {momento && <span className={styles.detalhe}>{distanciaDoMomento(momento)}{!momento.hora && " · horário não informado"}</span>}
        </div>

        <div className={styles.campo}>
          <span className={styles.rotulo}><MapPin aria-hidden /> Onde</span>
          <InlineEdit
            value={endereco ?? ""}
            canEdit={podeEditar}
            tipo="text"
            placeholder="Endereço da gravação"
            onSave={(v) => onSalvar({ localGravacao: v.trim() || null })}
            display={endereco
              ? <strong className={styles.valor}>{endereco}</strong>
              : <strong className={styles.falta}>Sem endereço</strong>}
          />
          {(cidade || mapa) && (
            <span className={styles.detalhe}>
              {cidade}
              {cidade && mapa && " · "}
              {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer">Abrir no mapa <ExternalLink aria-hidden /></a>}
            </span>
          )}
        </div>

        <div className={styles.campo}>
          <span className={styles.rotulo}><Users aria-hidden /> Quem vai</span>
          {job.videomaker
            ? <strong className={styles.valor}>{job.videomaker.nome}</strong>
            : <strong className={styles.falta}>{situacao.texto}</strong>}
          {job.videomaker && (
            <span className={styles.detalhe}>
              <span className={styles.situacao} data-tom={situacao.tom}>{situacao.texto}</span>
              {telVm && <> · {zapVm ? <a href={zapVm} target="_blank" rel="noopener noreferrer">{telVm}</a> : telVm}</>}
            </span>
          )}
          {job.videomaker && (
            <InlineEdit
              value={job.edicaoPor ?? ""}
              canEdit={podeEditar}
              tipo="select"
              options={[{ value: "", label: "Não combinado" }, ...EDICAO.map((e) => ({ value: e.id, label: e.rotulo }))]}
              onSave={(v) => onSalvar({ edicaoPor: v || null })}
              display={<span className={styles.detalhe}>Edição: {rotuloDaEdicao(job.edicaoPor) ?? <span className={styles.situacao} data-tom="alerta">não combinada</span>}</span>}
            />
          )}
          {acompanham.length > 0 && <span className={styles.detalhe}>Acompanha: {acompanham.join(", ")}</span>}
        </div>

        <div className={styles.campo}>
          <span className={styles.rotulo}><Building2 aria-hidden /> Cliente</span>
          {cliente
            ? <strong className={styles.valor}>{cliente}</strong>
            : <strong className={styles.vazio}>Não informado</strong>}
          {telCliente && (
            <span className={styles.detalhe}>
              {zapCliente ? <a href={zapCliente} target="_blank" rel="noopener noreferrer">{telCliente} · WhatsApp</a> : telCliente}
            </span>
          )}
        </div>
      </div>

      {levar.length > 0 && (
        <p className={styles.levar}><Package aria-hidden /> <span>Levar:</span> {levar.join(" · ")}</p>
      )}

      {children}

      {rodape && <div className={styles.rodape}>{rodape}</div>}
    </section>
  )
}
