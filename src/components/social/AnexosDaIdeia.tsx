"use client"

// Os arquivos de referência que já estão guardados na ideia. Os novos entram
// pela seção de arquivos do formulário de sempre e sobem ao salvar.
import { FileText, X } from "lucide-react"
import type { AnexoIdeia } from "@/lib/social-quadro"

export function AnexosDaIdeia({ anexos, onRemover }: { anexos: AnexoIdeia[]; onRemover?: (url: string) => void }) {
  if (anexos.length === 0) return null
  return (
    <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <p className="mb-2 text-xs font-medium text-zinc-400">Arquivos guardados nesta ideia</p>
      <ul className="flex flex-wrap gap-2">
        {anexos.map((a) => (
          <li key={a.url} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/70 px-2.5 py-1.5 text-xs text-zinc-200">
            <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
            <a href={a.url} target="_blank" rel="noreferrer" className="max-w-[16rem] truncate hover:underline">{a.nome}</a>
            {onRemover && (
              <button type="button" onClick={() => onRemover(a.url)} aria-label={`Tirar ${a.nome} da ideia`} className="text-zinc-500 hover:text-zinc-200">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
