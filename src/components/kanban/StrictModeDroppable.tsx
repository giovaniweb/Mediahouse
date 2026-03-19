"use client"

import { useEffect, useState } from "react"
import { Droppable, type DroppableProps } from "@hello-pangea/dnd"

/**
 * Workaround para @hello-pangea/dnd com React Strict Mode (Next.js 13+).
 * O Droppable precisa ser renderizado somente após o mount para evitar
 * o bug "Unable to find draggable" causado pelo double-render do strict mode.
 */
export function StrictModeDroppable({ children, ...props }: DroppableProps) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    // Aguarda o próximo frame de animação para garantir que o DOM está pronto
    const animation = requestAnimationFrame(() => setEnabled(true))
    return () => {
      cancelAnimationFrame(animation)
      setEnabled(false)
    }
  }, [])

  if (!enabled) {
    return null
  }

  return <Droppable {...props}>{children}</Droppable>
}
