"use client"

// O trilho dos quadros: setas laterais, barra de rolagem horizontal no rodapé e
// arrastar o fundo para os lados. Saiu do KanbanBoard (06/10/2026) para o quadro
// da social ser o MESMO quadro de /demandas e /design, e não um segundo que
// cresce com a página. As colunas de dentro usam `styles.column` (altura do
// trilho, rolagem própria) — ver KanbanPreview.module.css.
import { useCallback, useRef, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import styles from "./KanbanPreview.module.css"

export { styles as estiloQuadro }

export function TrilhoQuadro({ children, aviso }: {
  /** As colunas. */
  children: ReactNode
  /** Linha acima do trilho (ex.: "Salvando ordem…"). */
  aviso?: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const arrastando = useRef(false)
  const inicioX = useRef(0)
  const inicioScroll = useRef(0)
  const [dragging, setDragging] = useState(false)

  const rolar = useCallback((quanto: number) => {
    scrollRef.current?.scrollBy({ left: quanto, behavior: "smooth" })
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Só o fundo arrasta; card, botão e campo continuam sendo clicáveis.
    if ((e.target as HTMLElement).closest("[data-card], button, a, input, select, label")) return
    arrastando.current = true
    setDragging(true)
    inicioX.current = e.pageX - (scrollRef.current?.offsetLeft ?? 0)
    inicioScroll.current = scrollRef.current?.scrollLeft ?? 0
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!arrastando.current || !scrollRef.current) return
    e.preventDefault()
    const x = e.pageX - scrollRef.current.offsetLeft
    scrollRef.current.scrollLeft = inicioScroll.current - (x - inicioX.current) * 1.2
  }, [])

  const soltar = useCallback(() => {
    arrastando.current = false
    setDragging(false)
  }, [])

  return (
    <div className={cn("relative h-full flex flex-col", styles.board)}>
      {aviso}
      <button
        onClick={() => rolar(-320)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-30 w-8 h-16 flex items-center justify-center bg-zinc-900/90 border border-zinc-700 rounded-r-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shadow-lg"
        aria-label="Rolar para esquerda"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => rolar(320)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-30 w-8 h-16 flex items-center justify-center bg-zinc-900/90 border border-zinc-700 rounded-l-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shadow-lg"
        aria-label="Rolar para direita"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
      <div
        ref={scrollRef}
        className={cn("kanban-scroll flex gap-3 overflow-x-auto overflow-y-hidden pb-2 h-full min-h-0 px-10 select-none", dragging && "is-dragging", styles.scroll)}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={soltar}
        onMouseLeave={soltar}
      >
        {children}
      </div>
    </div>
  )
}
