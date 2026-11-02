"use client"

// O que todo card de quadro tem igual: a alça de arrastar e o clique que só
// abre quando não houve arrasto. Saiu do DemandaCard (07/10/2026) para o card de
// Job e o da social terem o mesmo gesto do card de Demandas e do Growth.
import { useRef } from "react"
import { GripVertical } from "lucide-react"
import { ATRIBUTO_ALCA } from "./sensorAlca"
import card from "@/components/demandas/DemandCardModern.module.css"

// Quanto o ponteiro pode andar entre apertar e soltar para ainda contar como
// clique. É o mesmo limite com que o quadro começa a arrastar (5 px).
const LIMITE_CLIQUE = 5

/**
 * Clique e arrasto não brigam. Depois de um arrasto o quadro só marca o clique
 * (preventDefault); o clique abre só quando o ponteiro quase não andou, não
 * houve arrasto e não foi na alça.
 */
export function useCliqueDoCard(abrir: () => void) {
  const inicio = useRef<{ x: number; y: number } | null>(null)
  const foiClique = (e: React.MouseEvent) => {
    const de = inicio.current
    inicio.current = null
    if (e.defaultPrevented) return false
    if ((e.target as Element).closest?.(`[${ATRIBUTO_ALCA}]`)) return false
    return !de || Math.hypot(e.clientX - de.x, e.clientY - de.y) <= LIMITE_CLIQUE
  }
  return {
    foiClique,
    /** Espalhar no elemento de fora do card. */
    alvo: {
      onClick: (e: React.MouseEvent) => { if (foiClique(e)) abrir() },
      onPointerDown: (e: React.PointerEvent) => { inicio.current = { x: e.clientX, y: e.clientY } },
    },
    /**
     * Para o título-link: Enter abre, Ctrl/⌘+clique abre em outra aba, e o
     * clique comum abre no painel sem navegar.
     */
    noLink: (e: React.MouseEvent) => {
      e.stopPropagation()
      if (e.metaKey || e.ctrlKey || e.shiftKey) return
      const clique = foiClique(e)
      e.preventDefault()
      if (clique) abrir()
    },
  }
}

/** A alça visível (44 px no celular), que arrasta na hora no toque. */
export function AlcaArrastar() {
  return (
    <span {...{ [ATRIBUTO_ALCA]: "" }} className={card.alca} title="Arraste para mudar de etapa" aria-hidden="true">
      <GripVertical size={18} />
    </span>
  )
}
