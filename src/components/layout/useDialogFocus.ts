"use client"
import { useEffect, useRef } from "react"

/** Focus containment for the existing single-dialog surfaces. */
export function useDialogFocus(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close })
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0)
    controls()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        const target = event.target as HTMLInputElement
        if (target.tagName === "SELECT" || target.type === "date" || target.type === "datetime-local") return
        event.preventDefault(); closeRef.current()
      }
      if (event.key !== "Tab") return
      const elements = controls(), first = elements[0], last = elements[elements.length - 1]
      if (!first) { event.preventDefault(); dialog?.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    dialog?.addEventListener("keydown", onKey)
    return () => { dialog?.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus() }
  }, [open])
  return ref
}
