"use client"

import { DemandaDetalhe } from "./DemandaDetalhe"

// Modal do kanban: abre a MESMA visão completa da página /demandas/[id] dentro de
// um overlay grande, sem sair do kanban. Toda a lógica (edição, upload, IA,
// separação por área audiovisual/Growth) vive em DemandaDetalhe.
export function DemandaModal({ demandaId, onClose, abrirEnvioAprovacao = false }: {
  demandaId: string | null
  onClose: () => void
  /** Abre já no passo de anexar a arte e enviar para aprovação. */
  abrirEnvioAprovacao?: boolean
}) {
  if (!demandaId) return null
  return (
    <DemandaDetalhe
      demandaId={demandaId}
      mode="modal"
      onClose={onClose}
      abrirEnvioAprovacao={abrirEnvioAprovacao}
    />
  )
}
