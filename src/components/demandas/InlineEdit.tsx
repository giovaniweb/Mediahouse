"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, AlertCircle, Pencil } from "lucide-react"

type Estado = "idle" | "editing" | "saving" | "saved" | "error"

interface BaseProps {
  value: string
  canEdit?: boolean
  onSave: (novo: string) => Promise<void>
  /** Como renderizar quando não está editando (default: texto) */
  display?: React.ReactNode
  className?: string
  placeholder?: string
}

interface TextProps extends BaseProps { tipo?: "text" | "textarea" | "date" | "number"; options?: never }
interface SelectProps extends BaseProps { tipo: "select"; options: { value: string; label: string }[] }
type Props = TextProps | SelectProps

// Campo com edição inline: clica → edita → salva ao sair (blur) ou Enter.
// Estados discretos: Salvando / Salvo / Erro. Read-only quando !canEdit.
export function InlineEdit(props: Props) {
  const { value, canEdit, onSave, display, className, placeholder } = props
  const tipo = "tipo" in props ? props.tipo : "text"
  const [estado, setEstado] = useState<Estado>("idle")
  const [val, setVal] = useState(value)
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  useEffect(() => { if (estado !== "editing" && estado !== "saving") setVal(value) }, [value, estado])
  useEffect(() => {
    if (estado === "editing") {
      ref.current?.focus()
      if (tipo === "select") {
        requestAnimationFrame(() => {
          try {
            ;(ref.current as HTMLSelectElement & { showPicker?: () => void })?.showPicker?.()
          } catch {
            // Alguns navegadores bloqueiam showPicker; o select continua focado e utilizável.
          }
        })
      }
    }
    if (estado === "saved") { const t = setTimeout(() => setEstado("idle"), 1400); return () => clearTimeout(t) }
  }, [estado, tipo])

  async function salvar(novo: string) {
    if (novo === value) { setEstado("idle"); return }
    setEstado("saving")
    try { await onSave(novo); setEstado("saved") }
    catch { setEstado("error"); setTimeout(() => setEstado("idle"), 2500) }
  }

  function cancelar() {
    setVal(value)
    setEstado("idle")
  }

  const indicador = (
    <span className="ml-2 inline-flex items-center text-[11px]">
      {estado === "saving" && <span className="text-zinc-400 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Salvando…</span>}
      {estado === "saved" && <span className="text-emerald-400 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Salvo</span>}
      {estado === "error" && <span className="text-rose-400 inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Erro</span>}
    </span>
  )

  // Read-only
  if (!canEdit) return <span className={className}>{display ?? (value || <span className="italic text-zinc-500">{placeholder ?? "—"}</span>)}{estado === "saving" && indicador}</span>

  // Editing
  if (estado === "editing" || estado === "saving") {
    const inputCls = "w-full bg-zinc-800 border border-zinc-600 rounded-md px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
    if (tipo === "select") {
      return (
        <span className="inline-flex items-center w-full">
          <select ref={ref as React.RefObject<HTMLSelectElement>} value={val} disabled={estado === "saving"}
            onChange={(e) => {
              const novo = e.target.value
              setVal(novo)
              void salvar(novo)
            }}
            onBlur={() => estado === "editing" && val === value && setEstado("idle")}
            className={inputCls}>
            {(props.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {indicador}
        </span>
      )
    }
    if (tipo === "textarea") {
      return (
        <span className="block">
          <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} value={val} disabled={estado === "saving"} rows={4}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => salvar(val)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.blur()
              if (e.key === "Escape") cancelar()
            }}
            className={inputCls} />
          {indicador}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center w-full">
        <input ref={ref as React.RefObject<HTMLInputElement>} type={tipo === "date" ? "date" : tipo === "number" ? "number" : "text"} value={val} disabled={estado === "saving"}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => salvar(val)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") cancelar()
          }}
          className={inputCls} />
        {indicador}
      </span>
    )
  }

  // Idle (editável): clica para editar
  return (
    <span
      role="button"
      tabIndex={0}
      className={`group/inline rounded hover:bg-zinc-800/60 -mx-1 px-1 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500/60 ${tipo === "select" ? "cursor-pointer" : "cursor-text"} ${className ?? ""}`}
      onClick={() => setEstado("editing")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          setEstado("editing")
        }
      }}
    >
      {display ?? (value || <span className="italic text-zinc-500">{placeholder ?? "—"}</span>)}
      <Pencil className="w-3 h-3 text-zinc-600 opacity-0 group-hover/inline:opacity-100 inline ml-1.5 align-baseline transition-opacity" />
      {(estado === "saved" || estado === "error") && indicador}
    </span>
  )
}
