"use client"

import { useId, useState } from "react"
import { useDialogFocus } from "@/components/layout/useDialogFocus"
import { LIMITE_MOTIVO, type PedidoDeTexto } from "@/lib/kanban-movimento"
import styles from "./PedidoMotivo.module.css"

// Pergunta curta antes de mover o card para uma coluna que exige texto.
// O card só muda de coluna depois do "Mover"; "Cancelar", Esc ou clique fora
// deixam tudo como estava.
export function PedidoMotivo({ pedido, tituloCard, onConfirmar, onCancelar }: {
  pedido: PedidoDeTexto
  tituloCard: string
  onConfirmar: (texto: string) => void
  onCancelar: () => void
}) {
  const [texto, setTexto] = useState("")
  // Foco no campo ao abrir, Tab preso na caixa, Esc cancela e o foco volta ao card.
  const caixa = useDialogFocus(true, onCancelar)
  const idTitulo = useId()
  const idAjuda = useId()
  const pronto = texto.trim().length > 0

  function confirmar() {
    if (pronto) onConfirmar(texto.trim())
  }

  return (
    <div className={styles.fundo} onClick={(e) => { if (e.target === e.currentTarget) onCancelar() }}>
      <div ref={caixa} role="dialog" aria-modal="true" aria-labelledby={idTitulo} aria-describedby={idAjuda} className={styles.caixa}>
      <form
        onSubmit={(e) => { e.preventDefault(); confirmar() }}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); confirmar() } }}
      >
        <h2 id={idTitulo}>{pedido.titulo}</h2>
        <p className={styles.card}>{tituloCard}</p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={LIMITE_MOTIVO}
          rows={3}
          placeholder={pedido.placeholder}
          aria-label={pedido.titulo}
        />
        <p id={idAjuda} className={styles.ajuda}>{pedido.explicacao}</p>
        <div className={styles.acoes}>
          <button type="button" onClick={onCancelar}>Cancelar</button>
          <button type="submit" disabled={!pronto} data-principal>{pedido.confirmar}</button>
        </div>
      </form>
      </div>
    </div>
  )
}
