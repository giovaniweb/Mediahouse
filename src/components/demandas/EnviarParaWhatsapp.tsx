"use client"

import { useState } from "react"
import { Loader2, MessageCircle } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { validarWhatsappBR } from "@/lib/telefone-br"
import surface from "./DemandSurface.module.css"

/**
 * "Enviar para um WhatsApp" (Giovani, 11/11/2026): o link de entrega da
 * gravação (/d/<token>) ou o de aprovação (/aprovar/<token>) para um número
 * digitado — o card nem sempre tem o telefone de quem pediu. Manda pela fila do
 * WhatsApp da empresa; o envio fica no histórico do card. Com o campo do card
 * vazio, oferece salvar o número ali.
 */
export function EnviarParaWhatsapp({
  aberto,
  onFechar,
  demandaId,
  link,
  telefoneDoCard,
  nomeDoCard,
  onEnviado,
}: {
  aberto: boolean
  onFechar: () => void
  demandaId: string
  link: "entrega" | "aprovacao"
  /** O número já gravado no card (cliente na gravação, quem pediu na demanda): vem preenchido. */
  telefoneDoCard?: string | null
  nomeDoCard?: string | null
  onEnviado?: () => void
}) {
  const [telefone, setTelefone] = useState(telefoneDoCard ?? "")
  const [nome, setNome] = useState(nomeDoCard ?? "")
  const [salvar, setSalvar] = useState(true)
  const [tocado, setTocado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erroServidor, setErroServidor] = useState<string | null>(null)
  const numero = validarWhatsappBR(telefone)
  const cardSemNumero = !telefoneDoCard?.trim()
  const oQue = link === "entrega" ? "o link do vídeo (onde o cliente vê e baixa)" : "o link de aprovação"

  async function enviar() {
    setTocado(true)
    if (!numero.ok || enviando) return
    setEnviando(true); setErroServidor(null)
    try {
      const r = await fetch(`/api/demandas/${demandaId}/enviar-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link, telefone, nome: nome.trim() || null, salvarNoCard: cardSemNumero && salvar, chave: crypto.randomUUID() }),
      })
      const corpo = await r.json().catch(() => ({})) as { error?: string; para?: string; nome?: string | null; salvouNoCard?: boolean }
      if (!r.ok) throw new Error(corpo.error ?? "Não foi possível mandar.")
      toast.success(`Na fila do WhatsApp para ${corpo.nome ? `${corpo.nome} · ` : ""}${corpo.para}${corpo.salvouNoCard ? " — número salvo no card" : ""}`)
      onEnviado?.()
      onFechar()
    } catch (e) {
      setErroServidor(e instanceof Error ? e.message : "Não foi possível mandar.")
    } finally {
      setEnviando(false)
    }
  }

  const erro = tocado && !numero.ok ? numero.erro : erroServidor
  const campo = "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar() }}>
      <DialogContent className="bg-[#191b23] text-zinc-200 ring-[#303342] sm:max-w-md">
        <DialogTitle className="flex items-center gap-2 text-base font-semibold text-zinc-100"><MessageCircle className="w-4 h-4" aria-hidden /> Enviar para um WhatsApp</DialogTitle>
        <DialogDescription className="text-zinc-400">Manda {oQue} pelo WhatsApp da empresa. Pode ser o cliente ou qualquer pessoa.</DialogDescription>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void enviar() }}>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-400">WhatsApp com DDD</span>
            <input className={campo} inputMode="tel" autoComplete="tel" placeholder="(41) 99876-5432" value={telefone} autoFocus
              onChange={(e) => { setTelefone(e.target.value); setErroServidor(null) }} onBlur={() => setTocado(true)}
              aria-invalid={!!erro} />
            {numero.ok && <span className="text-xs text-emerald-300">{numero.legivel}</span>}
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-400">Nome (opcional)</span>
            <input className={campo} placeholder="Ex.: Dra. Maria" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
          </label>
          {cardSemNumero && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={salvar} onChange={(e) => setSalvar(e.target.checked)} />
              Salvar este número no card ({link === "entrega" ? "WhatsApp do cliente" : "WhatsApp de quem pediu"})
            </label>
          )}
          {erro && <p role="alert" className="text-sm text-amber-200">{erro}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={surface.btnGhost} onClick={onFechar}>Cancelar</button>
            <button type="submit" className={surface.btnPrimary} disabled={enviando}>
              {enviando && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}Enviar
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
