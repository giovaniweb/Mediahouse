"use client"

import { useState } from "react"
import { BellRing, Loader2, MessageCircle } from "lucide-react"
import { toast } from "sonner"
import { EnviarParaWhatsapp } from "@/components/demandas/EnviarParaWhatsapp"
import { etapaDaCobranca } from "@/lib/cobranca-solicitante-regra"
import surface from "./DemandSurface.module.css"

const dataHora = (iso: string) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
}).format(new Date(iso))

/**
 * Cobrança a quem pediu, na ficha do card (Giovani, 25/11/2026): quantas vezes
 * quem pediu já foi cobrado nesta etapa, "Cobrar agora" (a mesma cobrança da
 * rotina diária, contando a vez) e "Mandar para outro número" (a cobrança com a
 * arte de brincadeira para um WhatsApp digitado). Só aparece quando o card
 * espera quem pediu: aprovar (vídeo pronto) ou marcar como postado.
 */
export function CobrancaQuemPediu({ demanda, ligada, onAtualizar }: {
  demanda: {
    id: string; statusInterno: string; area?: string | null
    cobrancasSolicitante?: number | null; solicitanteCobradoEm?: string | null; cobrancaSolicitanteEtapa?: string | null
    telefoneSolicitante?: string | null; nomeSolicitante?: string | null
    solicitante?: { nome?: string | null; telefone?: string | null } | null
  }
  /** O módulo "cobranca" da empresa: desligado, a ficha só oferece o envio a outro número. */
  ligada: boolean
  onAtualizar: () => void
}) {
  const [cobrando, setCobrando] = useState(false)
  const [outroNumero, setOutroNumero] = useState(false)
  const etapa = etapaDaCobranca(demanda.statusInterno)
  if (!etapa) return null
  const vezes = demanda.cobrancaSolicitanteEtapa === etapa ? demanda.cobrancasSolicitante ?? 0 : 0
  const oQue = etapa === "aprovar" ? "aprovar" : "marcar como postado"

  async function cobrarAgora() {
    if (cobrando) return
    setCobrando(true)
    try {
      const r = await fetch(`/api/demandas/${demanda.id}/cobrar-solicitante`, { method: "POST" })
      const corpo = await r.json().catch(() => ({})) as { error?: string; vez?: number }
      if (!r.ok) throw new Error(corpo.error ?? "Não foi possível cobrar agora.")
      toast.success(`Cobrança nº ${corpo.vez} na fila do WhatsApp${(corpo.vez ?? 0) >= 2 ? " — com a arte da turma" : ""}`)
      onAtualizar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cobrar agora.")
    } finally {
      setCobrando(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 px-4 py-3">
      <div className={surface.sectionHead}><h2 className={surface.sectionTitle}><BellRing aria-hidden /> Cobrança a quem pediu</h2></div>
      <p className="text-sm text-zinc-300">
        {vezes > 0
          ? <>Cobrado {vezes === 1 ? "1 vez" : `${vezes} vezes`} para {oQue}{demanda.solicitanteCobradoEm ? `, a última em ${dataHora(demanda.solicitanteCobradoEm)}` : ""}.</>
          : <>Ainda não foi cobrado para {oQue}.</>}
      </p>
      <p className={`${surface.hint} mt-1`}>
        {ligada
          ? `Uma vez por dia (seg a sex, 9h) até ${etapa === "aprovar" ? "aprovar" : "confirmar a postagem"}. Da 2ª vez em diante vai com a arte de brincadeira.`
          : "A cobrança diária está desligada para a empresa. Dá para mandar a cobrança, com a arte, para um número digitado."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ligada && (
          <button type="button" onClick={() => void cobrarAgora()} disabled={cobrando} className={surface.btn}>
            {cobrando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <BellRing className="w-4 h-4" aria-hidden />} Cobrar agora
          </button>
        )}
        <button type="button" onClick={() => setOutroNumero(true)} className={surface.btn}>
          <MessageCircle className="w-4 h-4" aria-hidden /> Mandar para outro número
        </button>
      </div>
      {outroNumero && (
        <EnviarParaWhatsapp aberto onFechar={() => setOutroNumero(false)} demandaId={demanda.id} link="cobranca"
          telefoneDoCard={demanda.telefoneSolicitante || demanda.solicitante?.telefone}
          nomeDoCard={demanda.nomeSolicitante || demanda.solicitante?.nome} onEnviado={onAtualizar} />
      )}
    </div>
  )
}
