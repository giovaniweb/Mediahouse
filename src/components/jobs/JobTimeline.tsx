"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { rotuloDeEvento } from "@/lib/job-fase"
import { EVENTO_EDICAO, EVENTO_RESPONSAVEL } from "@/lib/status"

// Timeline do Job (§27).
//
// Lê `HistoricoStatus`, que já existe e já registra autor, origem e observação —
// 2.242 linhas em produção. Nada de tabela nova.
//
// A regra do §27: histórico não se apaga para "corrigir" o estado. Este
// componente só lê; nenhuma ação daqui remove linha.

export type EventoHistorico = {
  id: string
  statusNovo: string
  createdAt: string
  origem: string
  observacao?: string | null
  usuario?: { nome: string } | null
}

export function JobTimeline({ eventos }: { eventos: EventoHistorico[] }) {
  if (eventos.length === 0) {
    return <p className="text-xs text-zinc-600">Nenhum evento registrado ainda.</p>
  }

  return (
    <ol className="space-y-3">
      {eventos.map((e, i) => {
        // Edição e troca de responsável não são etapas: entram no mesmo
        // histórico com marcador próprio, e quem descreve o que houve é a
        // observação, não um rótulo de etapa.
        const ehAnotacao = e.statusNovo === EVENTO_EDICAO || e.statusNovo === EVENTO_RESPONSAVEL
        const rotulo = rotuloDeEvento(e.statusNovo, e.observacao)
        // A observação já virou o rótulo nas anotações; repeti-la seria eco.
        const detalhe = ehAnotacao ? null : e.observacao

        return (
          <li key={e.id} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
              <span
                className={cn(
                  "w-2 h-2 rounded-full mt-1.5",
                  // O evento mais recente é o estado atual: merece destaque.
                  i === 0 && !ehAnotacao ? "bg-emerald-400" : ehAnotacao ? "bg-zinc-600" : "bg-zinc-500"
                )}
              />
              {i < eventos.length - 1 && <span className="w-px flex-1 bg-zinc-800 mt-1" />}
            </div>

            <div className="pb-1 min-w-0">
              <p className={cn("text-sm leading-snug", ehAnotacao ? "text-zinc-400" : "text-zinc-200")}>
                {rotulo}
              </p>
              {detalhe && (
                <p className="text-xs text-zinc-400 mt-0.5 whitespace-pre-wrap break-words">{detalhe}</p>
              )}
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {format(new Date(e.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                {e.usuario ? ` · ${e.usuario.nome}` : ` · ${e.origem}`}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
