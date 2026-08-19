"use client"

// Casca dos modais de criação de demanda (audiovisual e Growth).
//
// Além do visual, ela carrega as duas guardas de fechamento acidental que
// custaram caro para acertar no audiovisual — e que o Growth não tinha:
// o gesto completo no backdrop e a exceção de ESC para select/data.
// O texto do "tem certeza?" fica com quem chama, porque varia (o audiovisual
// precisa avisar sobre os anexos que não voltam).

import { useEffect, useRef } from "react"
import { X, Plus } from "lucide-react"
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

  if (!aberto) return null

  // O evento `click` tem como alvo o ancestral comum do mousedown e do mouseup:
  // selecionar texto na descrição e soltar o mouse fora do card marcava o overlay
  // como alvo e fechava o modal. Por isso o fechamento exige que o gesto INTEIRO
  // (descer e soltar o botão) tenha acontecido no fundo.
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={e => { pressionouNoFundo.current = e.target === overlayRef.current }}
      onClick={e => {
        if (e.target === overlayRef.current && pressionouNoFundo.current) aoTentarFechar()
        pressionouNoFundo.current = false
      }}
    >
      <div className={cn(
        "flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60",
        className
      )}>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/80 px-7 py-5">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold text-zinc-50">
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
