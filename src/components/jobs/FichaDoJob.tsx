"use client"

import type { ReactNode } from "react"
import { ExternalLink } from "lucide-react"
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
import { EDICAO, TIPOS_DE_GRAVACAO, perguntaBrinde, rotuloDaEdicao, rotuloDoTipoDeGravacao } from "@/lib/etapas-da-gravacao"
import { AgoraDaGravacao, EntregasDoVideomaker, TrilhaDoVideo, type GravacaoDoPasso } from "./PassoDaGravacao"
import { CancelarGravacao } from "./CancelarGravacao"
import styles from "./FichaDoJob.module.css"

/**
 * A ficha da gravação externa: o card aberto inteiro gira em torno dela.
 *
 * Pedido do Giovani (28 e 29/10/2026): o card estava confuso. Agora é a linha
 * do tempo no topo; à esquerda o que pede ação — "Agora" e as entregas do
 * videomaker (brutos, vídeo pronto, nota); à direita os dados da gravação, na
 * ordem da mensagem que chega no WhatsApp: tipo, equipamento, cliente, quando,
 * onde, e depois quem vai, edição e o que levar. Tudo edita ali mesmo; faltando,
 * diz que falta (em âmbar) em vez de esconder.
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
  tipoGravacao?: string | null
  temBrinde?: boolean | null
  brinde?: string | null
  levar?: string | null
  nomeSolicitante?: string | null
  telefoneSolicitante?: string | null
  solicitante?: { nome?: string | null } | null
  videomaker?: Pessoa | null
  responsaveis?: { usuario?: { nome?: string | null } | null }[] | null
  produtos?: { produto?: { nome?: string | null } | null }[] | null
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className={styles.linha}>
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  )
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
  const equipamentos = (job.produtos ?? []).map((p) => p.produto?.nome?.trim()).filter((n): n is string => !!n)
  const telCliente = telefoneLegivel(job.clienteFinalTelefone)
  const zapCliente = linkWhatsapp(job.clienteFinalTelefone)
  const telVm = telefoneLegivel(job.videomaker?.telefone)
  const zapVm = linkWhatsapp(job.videomaker?.telefone)
  const pedidoPor = job.nomeSolicitante?.trim() || job.solicitante?.nome?.trim() || null
  const telPedido = telefoneLegivel(job.telefoneSolicitante)
  const mostraBrinde = perguntaBrinde(job.tipoGravacao) || !!job.temBrinde
  const falta = (texto: string) => <span className={styles.falta}>{texto}</span>
  const vazio = (texto = "—") => <span className={styles.vazio}>{texto}</span>

  return (
    <section aria-label="Ficha da gravação" className={styles.ficha}>
      <TrilhaDoVideo job={job} />

      <div className={styles.colunas}>
        <div className={styles.principal}>
          <AgoraDaGravacao
            job={job}
            podeEditar={podeEditar}
            onAvancar={onAvancar}
            onConfirmarVideomaker={onConfirmarVideomaker}
            onEscalar={onEscalar}
          />
          <EntregasDoVideomaker job={job} podeEditar={podeEditar} onSalvar={onSalvar} onAvancar={onAvancar} onAtualizar={onAtualizar} />
          {children}
        </div>

        <aside className={styles.dados} aria-label="Dados da gravação">
          <span className={styles.rotulo}>Gravação</span>
          <dl className={styles.lista}>
            <Linha rotulo="Tipo">
              <InlineEdit
                value={job.tipoGravacao ?? ""}
                canEdit={podeEditar}
                tipo="select"
                options={[{ value: "", label: "Não informado" }, ...TIPOS_DE_GRAVACAO.map((t) => ({ value: t.id, label: t.rotulo }))]}
                onSave={(v) => onSalvar({ tipoGravacao: v || null })}
                display={rotuloDoTipoDeGravacao(job.tipoGravacao) ?? falta("Não informado")}
              />
            </Linha>
            <Linha rotulo="Equipamento">{equipamentos.length ? equipamentos.join(" · ") : vazio()}</Linha>
            <Linha rotulo="Cliente">
              <InlineEdit
                value={job.clienteFinalNome ?? ""}
                canEdit={podeEditar}
                tipo="text"
                placeholder="Cliente ou clínica"
                onSave={(v) => onSalvar({ clienteFinalNome: v.trim() || null })}
                display={job.clienteFinalNome?.trim() || falta("Não informado")}
              />
              <InlineEdit
                value={job.clienteFinalTelefone ?? ""}
                canEdit={podeEditar}
                tipo="text"
                placeholder="WhatsApp do cliente"
                onSave={(v) => onSalvar({ clienteFinalTelefone: v.trim() || null })}
                display={telCliente
                  ? <span className={styles.detalhe}>{zapCliente ? <a href={zapCliente} target="_blank" rel="noopener noreferrer">{telCliente} · WhatsApp</a> : telCliente}</span>
                  : <span className={styles.vazio}>WhatsApp</span>}
              />
            </Linha>
            <Linha rotulo="Quando">
              <InlineEdit
                value={paraCampoDataHora(momento)}
                canEdit={podeEditar}
                tipo="datetime-local"
                onSave={(v) => onSalvar({ dataCaptacao: v ? deCampoDataHora(v) : null })}
                display={momento ? rotuloDoMomento(momento) : falta("Sem data")}
              />
              {momento && <span className={styles.detalhe}>{distanciaDoMomento(momento)}{!momento.hora && " · horário não informado"}</span>}
            </Linha>
            <Linha rotulo="Onde">
              <InlineEdit
                value={endereco ?? ""}
                canEdit={podeEditar}
                tipo="text"
                placeholder="Endereço da gravação"
                onSave={(v) => onSalvar({ localGravacao: v.trim() || null })}
                display={endereco ?? falta("Sem endereço")}
              />
              {(cidade || mapa) && (
                <span className={styles.detalhe}>
                  {cidade}
                  {cidade && mapa && " · "}
                  {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer">mapa <ExternalLink aria-hidden /></a>}
                </span>
              )}
            </Linha>
            <Linha rotulo="Quem vai">
              {job.videomaker ? job.videomaker.nome : falta(situacao.texto)}
              {job.videomaker && (
                <span className={styles.detalhe}>
                  <span className={styles.situacao} data-tom={situacao.tom}>{situacao.texto}</span>
                  {telVm && <> · {zapVm ? <a href={zapVm} target="_blank" rel="noopener noreferrer">{telVm}</a> : telVm}</>}
                </span>
              )}
            </Linha>
            {job.videomaker && (
              <Linha rotulo="Edição">
                <InlineEdit
                  value={job.edicaoPor ?? ""}
                  canEdit={podeEditar}
                  tipo="select"
                  options={[{ value: "", label: "Não combinado" }, ...EDICAO.map((e) => ({ value: e.id, label: e.rotulo }))]}
                  onSave={(v) => onSalvar({ edicaoPor: v || null })}
                  display={rotuloDaEdicao(job.edicaoPor) ?? falta("Não combinada")}
                />
              </Linha>
            )}
            {mostraBrinde && (
              <Linha rotulo="Brinde">
                <InlineEdit
                  value={job.temBrinde ? (job.brinde ?? "sim") : ""}
                  canEdit={podeEditar}
                  tipo="text"
                  placeholder="Qual? Vazio = sem brinde"
                  onSave={(v) => {
                    const t = v.trim()
                    return onSalvar(t ? { temBrinde: true, brinde: t.toLowerCase() === "sim" ? null : t } : { temBrinde: false, brinde: null })
                  }}
                  display={job.temBrinde ? (job.brinde?.trim() || "Sim") : vazio("Sem brinde")}
                />
              </Linha>
            )}
            <Linha rotulo="Levar">
              <InlineEdit
                value={job.levar ?? ""}
                canEdit={podeEditar}
                tipo="text"
                placeholder="Ex.: banner, tripé extra"
                onSave={(v) => onSalvar({ levar: v.trim() || null })}
                display={job.levar?.trim() || vazio()}
              />
            </Linha>
            {pedidoPor && (
              <Linha rotulo="Pedido por">
                {pedidoPor}
                {telPedido && <span className={styles.detalhe}>{telPedido}</span>}
              </Linha>
            )}
          </dl>
          {/* Sem depender de editarDemanda: quem opera as gravações cancela (o componente decide). */}
          <CancelarGravacao job={job} onCancelada={onAtualizar} />
        </aside>
      </div>

      {rodape && <div className={styles.rodape}>{rodape}</div>}
    </section>
  )
}
