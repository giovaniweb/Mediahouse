"use client"

// Casca dos modais de criação de demanda (audiovisual e Growth).
//
// Além do visual, ela carrega as duas guardas de fechamento acidental que
// custaram caro para acertar no audiovisual — e que o Growth não tinha:
// o gesto completo no backdrop e a exceção de ESC para select/data.
// O texto do "tem certeza?" fica com quem chama, porque varia (o audiovisual
// precisa avisar sobre os anexos que não voltam).

import { useEffect, useRef, useId } from "react"
import { X, Plus } from "lucide-react"
import { useVisualPreview } from "@/components/layout/useVisualPreview"
import styles from "./DemandSurface.module.css"
import { cn } from "@/lib/utils"

interface ModalFormularioProps {
  aberto: boolean
  titulo: string
  icone?: React.ComponentType<{ className?: string }>
  /** Chamado por X, Cancelar, ESC e clique no fundo. É aqui que vai o confirm. */
  aoTentarFechar: () => void
  aoConfirmar: () => void
  /** Conteúdo do botão principal — muda de rótulo enquanto salva/envia anexos. */
  rotuloConfirmar: React.ReactNode
  ocupado?: boolean
  children: React.ReactNode
  className?: string
}

export function ModalFormulario({
  aberto, titulo, icone: Icone = Plus, aoTentarFechar, aoConfirmar,
  rotuloConfirmar, ocupado, children, className,
}: ModalFormularioProps) {
  const { modern } = useVisualPreview()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  // O gesto de clique começou no fundo? (ver comentário do backdrop, mais abaixo)
  const pressionouNoFundo = useRef(false)

  // Ref sincronizada por effect (escrever ref durante o render é proibido): sem
  // ela o listener de ESC seria reassinado a cada tecla digitada no formulário.
  const fecharRef = useRef(aoTentarFechar)
  useEffect(() => { fecharRef.current = aoTentarFechar })

  useEffect(() => {
    if (!aberto) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      // ESC dentro de <select> ou <input type="date"> serve para fechar o
      // dropdown/calendário do próprio controle — e borbulhava até aqui,
      // derrubando o modal inteiro. O formulário tem vários desses campos: é a
      // explicação mais provável do "fecha sozinho e perde tudo".
      if (e.defaultPrevented) return
      const alvo = e.target as HTMLElement | null
      const tag = alvo?.tagName
      if (tag === "SELECT" || (tag === "INPUT" && (alvo as HTMLInputElement).type === "date")) return
      fecharRef.current()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0)
    controls()[0]?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const elements = controls()
      const first = elements[0], last = elements[elements.length - 1]
      if (!first) { event.preventDefault(); dialog?.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    dialog?.addEventListener("keydown", trap)
    return () => { dialog?.removeEventListener("keydown", trap); previous?.focus() }
  }, [aberto])

  if (!aberto) return null

  // O evento `click` tem como alvo o ancestral comum do mousedown e do mouseup:
  // selecionar texto na descrição e soltar o mouse fora do card marcava o overlay
  // como alvo e fechava o modal. Por isso o fechamento exige que o gesto INTEIRO
  // (descer e soltar o botão) tenha acontecido no fundo.
  return (
    <div
      ref={overlayRef}
      className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm", modern && styles.overlay)}
      onMouseDown={e => { pressionouNoFundo.current = e.target === overlayRef.current }}
      onClick={e => {
        if (e.target === overlayRef.current && pressionouNoFundo.current) aoTentarFechar()
        pressionouNoFundo.current = false
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={cn(
        "flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60",
        modern && styles.surface,
        className
      )}>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/80 px-7 py-5">
          <h2 id={titleId} className="flex items-center gap-2.5 text-lg font-semibold text-zinc-50">
            <Icone className="h-5 w-5 text-purple-400" />
            {titulo}
          </h2>
          <button
            onClick={aoTentarFechar}
            aria-label="Fechar"
            className="text-zinc-500 transition-colors hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo (scrollável) */}
        <div className="flex-1 overflow-y-auto px-7 py-6">{children}</div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-800/80 px-7 py-4">
          <button
            onClick={aoTentarFechar}
            className="rounded-xl border border-zinc-800 px-5 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-900"
          >
            Cancelar
          </button>
          <button
            onClick={aoConfirmar}
            disabled={ocupado}
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/30 transition-colors hover:bg-purple-500 disabled:opacity-60"
          >
            {rotuloConfirmar}
          </button>
        </div>

      </div>
    </div>
  )
}
