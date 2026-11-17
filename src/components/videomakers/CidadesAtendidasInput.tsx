"use client"

import { useState, type KeyboardEvent } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { listaDeCidades, MAX_CIDADES_ATENDIDAS } from "@/lib/cidades-videomaker"

/**
 * As outras cidades ou regiões que o videomaker atende, além da base.
 * Enter, vírgula ou sair do campo acrescenta: quem digita "Campinas" e clica em
 * Salvar sem apertar Enter não perde a cidade.
 */
export function CidadesAtendidasInput({
  id, value, onChange, base, placeholder = "Digite a cidade e aperte Enter", className, chipClassName,
}: {
  id?: string
  value: string[]
  onChange: (cidades: string[]) => void
  /** A cidade base: não entra de novo na lista. */
  base?: string | null
  placeholder?: string
  className?: string
  chipClassName?: string
}) {
  const [texto, setTexto] = useState("")

  function acrescentar(t: string) {
    if (!t.trim()) return
    onChange(listaDeCidades([...value, ...t.split(/[,;]/)], base))
    setTexto("")
  }

  function teclou(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      acrescentar(texto)
    } else if (e.key === "Backspace" && !texto && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5", className)}>
      {value.map(c => (
        <span key={c} className={cn("inline-flex items-center gap-1 rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-200", chipClassName)}>
          {c}
          <button type="button" aria-label={`Tirar ${c}`} onClick={() => onChange(value.filter(x => x !== c))} className="opacity-70 hover:opacity-100">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {value.length < MAX_CIDADES_ATENDIDAS && (
        <input
          id={id}
          aria-label="Outras cidades que atende"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={teclou}
          onBlur={() => acrescentar(texto)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 border-0! bg-transparent! min-h-0! p-0 py-0.5 text-sm text-zinc-200 shadow-none outline-none ring-0 focus:ring-0 placeholder:text-zinc-500"
        />
      )}
    </div>
  )
}
