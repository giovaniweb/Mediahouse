"use client"

import { useState } from "react"
import useSWR from "swr"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { fetcher } from "@/lib/fetcher"
import { acoesDoQuemVai, linkWhatsapp, situacaoDaEquipe, telefoneLegivel, type ConviteDaLinha } from "@/lib/ficha-do-job"
import type { GrupoDaLista } from "@/lib/busca-na-lista"
import { EscolhaComBusca } from "@/components/ui/EscolhaComBusca"
import type { StatusInterno } from "@prisma/client"
import styles from "./FichaDoJob.module.css"

/**
 * A linha "Quem vai" da ficha (Giovani, 11/11/2026): além do nome e da
 * situação, as ações do videomaker ali mesmo — trocar (a mesma lista com busca
 * por nome ou cidade), reenviar o convite (link novo, quando venceu ou não
 * chegou) e avisar mudança (data, hora ou local mudaram depois do aceite).
 * Data, hora e local se editam no lápis do "Quando" e do "Onde", logo acima;
 * o link do convite mostra a ficha ao vivo.
 *
 * Só a gestão vê as ações, como no escalar (PUT da demanda e /convite).
 */
export function QuemVaiDaGravacao({
  job,
  podeGerenciar,
  grupos,
  onTrocar,
}: {
  job: { id: string; statusInterno: StatusInterno; videomakerId?: string | null; videomaker?: { nome: string; telefone?: string | null } | null }
  podeGerenciar: boolean
  /** As opções de videomaker (as mesmas de "Equipe e contexto"). Sem elas, não há "Trocar". */
  grupos?: GrupoDaLista[]
  /** Grava o novo videomaker (PUT da demanda, que substitui o convite e avisa). */
  onTrocar?: (valor: string) => Promise<void>
}) {
  const { data: convites, mutate } = useSWR<ConviteDaLinha[]>(
    podeGerenciar && job.videomakerId ? `/api/convites?demandaId=${job.id}` : null, fetcher)
  const [agindo, setAgindo] = useState<string | null>(null)
  // A lista aparece no primeiro "Trocar" e, já montada, abre pelo sinal.
  const [listaVisivel, setListaVisivel] = useState(false)
  const [sinal, setSinal] = useState(0)
  const situacao = situacaoDaEquipe(job.statusInterno, !!job.videomaker)
  const acoes = acoesDoQuemVai({ statusInterno: job.statusInterno, videomakerId: job.videomakerId, convites: Array.isArray(convites) ? convites : null })
  const telVm = telefoneLegivel(job.videomaker?.telefone)
  const zapVm = linkWhatsapp(job.videomaker?.telefone)
  // Para a gestão, a frase do convite (com o prazo, ou "vencido") toma o lugar
  // da situação genérica: uma linha só, a mais precisa.
  const frase = podeGerenciar && acoes.convite
    ? { texto: acoes.convite, tom: acoes.convite.startsWith("Convite vencido") ? "alerta" : situacao.tom }
    : situacao
  const primeiro = job.videomaker?.nome.split(" ")[0] ?? "o videomaker"

  async function convite(acao: "reenviar" | "avisar-mudanca") {
    setAgindo(acao)
    try {
      const r = await fetch(`/api/demandas/${job.id}/convite`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }),
      })
      const corpo = await r.json().catch(() => ({} as { error?: string }))
      if (!r.ok) throw new Error(corpo.error ?? "Não foi possível mandar.")
      toast.success(acao === "reenviar" ? `Convite novo a caminho do WhatsApp de ${primeiro}` : `${primeiro} vai receber a data e o local de agora`)
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível mandar.")
    } finally {
      setAgindo(null)
    }
  }

  async function trocar(valor: string) {
    if (!onTrocar) return
    const confirmado = job.statusInterno === "videomaker_aceitou" || job.statusInterno === "captacao_agendada"
    if (job.videomaker && confirmado && !window.confirm(`${job.videomaker.nome} já confirmou. Trocar mesmo? Ele recebe um aviso de que a gravação passou para outra pessoa.`)) return
    setAgindo("trocar")
    try { await onTrocar(valor); setListaVisivel(false); await mutate() } finally { setAgindo(null) }
  }

  const valorAtual = job.videomakerId ? `vm:${job.videomakerId}` : ""
  const mostraTrocar = podeGerenciar && !!acoes.trocar && !!grupos && !!onTrocar

  return (
    <>
      {job.videomaker ? job.videomaker.nome : <span className={styles.falta}>{situacao.texto}</span>}
      {job.videomaker && (
        <span className={styles.detalhe}>
          <span className={styles.situacao} data-tom={frase.tom}>{frase.texto}</span>
          {telVm && <> · {zapVm ? <a href={zapVm} target="_blank" rel="noopener noreferrer">{telVm}</a> : telVm}</>}
        </span>
      )}
      {podeGerenciar && (mostraTrocar || acoes.reenviar || acoes.avisar) && (
        <span className={styles.acoesDaLinha}>
          {mostraTrocar && (
            <button type="button" className={styles.acaoDaLinha} disabled={agindo !== null} onClick={() => { setListaVisivel(true); requestAnimationFrame(() => setSinal((n) => n + 1)) }}>
              {agindo === "trocar" && <Loader2 className="animate-spin" aria-hidden />}{acoes.trocar}
            </button>
          )}
          {acoes.reenviar && (
            <button type="button" className={styles.acaoDaLinha} disabled={agindo !== null} onClick={() => void convite("reenviar")}>
              {agindo === "reenviar" && <Loader2 className="animate-spin" aria-hidden />}Reenviar convite
            </button>
          )}
          {acoes.avisar && (
            <button type="button" className={styles.acaoDaLinha} disabled={agindo !== null} onClick={() => void convite("avisar-mudanca")}
              title="Manda no WhatsApp dele a data, a hora e o local de agora">
              {agindo === "avisar-mudanca" && <Loader2 className="animate-spin" aria-hidden />}Avisar mudança
            </button>
          )}
        </span>
      )}
      {mostraTrocar && listaVisivel && (
        <span className={styles.escolhaDaLinha}>
          <EscolhaComBusca
            value={valorAtual}
            onChange={(v) => { if (v && v !== valorAtual) void trocar(v) }}
            grupos={grupos!}
            vazio="— Escolha quem vai —"
            rotuloAtual={job.videomaker?.nome}
            ariaLabel="Trocar o videomaker"
            abrirSinal={sinal}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200"
          />
        </span>
      )}
    </>
  )
}
