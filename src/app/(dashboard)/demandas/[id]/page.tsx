"use client"

import { useParams } from "next/navigation"
import { DemandaDetalhe } from "@/components/demandas/DemandaDetalhe"

// Página de detalhe da demanda — reusa o componente compartilhado DemandaDetalhe
// (o mesmo que abre dentro do modal ao clicar num card do kanban).
export default function DemandaDetailPage() {
  const { id } = useParams()
  return <DemandaDetalhe demandaId={String(id)} mode="page" />
}
