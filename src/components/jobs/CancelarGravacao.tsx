"use client"

import { useState } from "react"
import { toast } from "sonner"
import { XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMe } from "@/hooks/usePermissoes"
import { etapaDaGravacao, perguntaCobranca } from "@/lib/etapas-da-gravacao"
import { foiAprovada } from "@/lib/job-fase"
import type { StatusInterno } from "@prisma/client"
import { ModalFormulario } from "@/components/demandas/ModalFormulario"
import { inputClass } from "@/components/demandas/campos-formulario"

/**
 * "Cancelar gravação" no card (regra em lib/cancelar-gravacao.ts): o motivo e,
 * se o videomaker já confirmou, se ele cobra pelo cancelamento. Só para a
 * gestão e quem opera as gravações; some quando a gravação já está concluída.
 */
export function CancelarGravacao({ job, onCancelada }: {
  job: { id: string; statusInterno: StatusInterno; statusVisivel?: string | null; videomakerId?: string | null; videomaker?: { nome: string } | null }
  onCancelada: () => Promise<unknown> | void
}) {
  const { data: me } = useMe()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [cobra, setCobra] = useState<boolean | null>(null)
  const [enviando, setEnviando] = useState(false)

  const papel = me?.membership?.papel
  const opera = papel === "admin" || papel === "gestor" || !!me?.membership?.operaGravacoes
  if (!opera || !foiAprovada(job) || etapaDaGravacao(job) === "concluido") return null

  const pergunta = perguntaCobranca(job)
  const nome = job.videomaker?.nome?.trim().split(/\s+/)[0] ?? "O videomaker"
  const convidado = !pergunta && !!job.videomakerId && job.statusInterno !== "videomaker_recusou"

  function fechar() {
    if (enviando) return
    setAberto(false); setMotivo(""); setCobra(null)
  }

  async function cancelar() {
    if (enviando) return
    if (motivo.trim().length < 3) return void toast.error("Diga o motivo do cancelamento.")
    if (pergunta && cobra === null) return void toast.error(`Diga se ${nome} vai cobrar pelo cancelamento.`)
    setEnviando(true)
    try {
      const r = await fetch(`/api/jobs/${job.id}/cancelar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim(), ...(pergunta ? { cobra } : {}) }),
      })
      const json = await r.json().catch(() => ({})) as { mensagem?: string; error?: string }
      if (!r.ok) throw new Error(json.error ?? "Não foi possível cancelar.")
      toast.success(json.mensagem ?? "Gravação cancelada.")
      setAberto(false); setMotivo(""); setCobra(null)
      await onCancelada()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível cancelar.")
    } finally {
      setEnviando(false)
    }
  }

  return <>
    <button type="button" onClick={() => setAberto(true)}
      className="self-start inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-300 transition-colors">
      <XCircle className="w-3.5 h-3.5" aria-hidden /> Cancelar gravação
    </button>

    <ModalFormulario aberto={aberto} titulo="Cancelar gravação" icone={XCircle} aoTentarFechar={fechar} aoConfirmar={() => void cancelar()}
      rotuloConfirmar={enviando ? "Cancelando…" : "Cancelar gravação"} rotuloFechar="Voltar" ocupado={enviando} className="max-w-lg">
      <div className="space-y-5">
        <div>
          <label htmlFor="cancelar-motivo" className="block text-xs font-medium text-zinc-400 mb-1.5">Motivo</label>
          <textarea id="cancelar-motivo" rows={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: chuva, a doutora não pôde receber" className={inputClass} />
        </div>

        {pergunta && (
          <div>
            <p id="cancelar-cobra" className="block text-xs font-medium text-zinc-400 mb-1.5">{nome} vai cobrar pelo cancelamento?</p>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-labelledby="cancelar-cobra">
              {([[true, "Sim, cobra"], [false, "Não cobra"]] as const).map(([valor, rotulo]) => (
                <button key={rotulo} type="button" aria-pressed={cobra === valor} onClick={() => setCobra(valor)}
                  className={cn("text-sm py-2.5 rounded-xl border transition-colors",
                    cobra === valor ? "bg-purple-600 border-purple-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500")}>
                  {rotulo}
                </button>
              ))}
            </div>
            {cobra !== null && <p className="text-xs text-zinc-500 mt-1.5">
              {cobra ? "Ele recebe no WhatsApp o link para mandar a nota da taxa; depois segue o caminho de sempre até o pagamento."
                : "Ele recebe só o aviso no WhatsApp, para liberar a agenda."}
            </p>}
          </div>
        )}

        {convidado && <p className="text-xs text-zinc-500">{nome} ainda não confirmou: o convite deixa de valer e ele recebe o aviso no WhatsApp.</p>}
      </div>
    </ModalFormulario>
  </>
}
