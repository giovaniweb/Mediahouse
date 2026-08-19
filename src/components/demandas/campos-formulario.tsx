"use client"

// Peças de layout dos formulários de criação de demanda.
//
// A tela é uma grade de blocos, não uma pilha de campos: cada bloco tem um
// título com ícone e ocupa metade da largura. Quem preenche lê "o que é",
// "para quem", "quem faz" lado a lado em vez de rolar sete vezes.
//
// Saíram do NovaDemandaModal quando o modal do Growth passou a herdar o mesmo
// chassi — é o vocabulário visual compartilhado pelas duas áreas.

import { X, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export const inputClass =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-sm text-zinc-200 " +
  "placeholder-zinc-600 outline-none transition-colors focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/25"
export const selectClass = cn(inputClass, "appearance-none pr-10 cursor-pointer")
export const erroClass = "border-red-500/70 focus:border-red-500 focus:ring-red-500/25"

export const MOTIVOS_URGENCIA = [
  "Trend / Oportunidade de mercado",
  "Prazo crítico de campanha",
  "Evento presencial",
  "Campanha ativa em mídia",
  "Solicitação da diretoria",
]

export const COR_PRIORIDADE: Record<string, string> = {
  normal: "bg-amber-400",
  alta: "bg-orange-500",
  urgente: "bg-red-500",
}

export function Secao({ icone: Icone, titulo, children, className }: {
  icone: React.ComponentType<{ className?: string }>
  titulo: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-purple-500/15 text-purple-400">
          <Icone className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold text-zinc-100">{titulo}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function Campo({ label, obrigatorio, opcional, erro, children }: {
  label: string
  obrigatorio?: boolean
  opcional?: boolean
  erro?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-xs font-medium text-zinc-400">
        {label}
        {obrigatorio && <span className="ml-1 text-purple-400">*</span>}
        {opcional && <span className="ml-1 text-zinc-600">(opcional)</span>}
      </label>
      {children}
      {erro && <p className="mt-1 text-xs text-red-400">{erro}</p>}
    </div>
  )
}

/** Select nativo com a seta desenhada por fora (appearance-none come a do sistema). */
export function Seta() {
  return <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
}

export function Chip({ texto, onRemover }: { texto: string; onRemover: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-purple-500/12 px-2.5 py-1 text-xs font-medium text-purple-200 ring-1 ring-inset ring-purple-500/25">
      <span className="truncate">{texto}</span>
      <button
        type="button"
        onClick={onRemover}
        aria-label={`Remover ${texto}`}
        className="shrink-0 text-purple-300/70 transition-colors hover:text-red-300"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

/** Divisor entre os blocos do formulário. */
export function DivisorBloco() {
  return <div className="my-7 border-t border-zinc-800/80" />
}
