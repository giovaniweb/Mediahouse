import { empresaDoPortal } from "@/lib/portal"
import { arteCompartilhamento, TAMANHO_ARTE } from "@/lib/arte-compartilhamento"

// A prévia do link da área de uma empresa (e das páginas dentro dela): o nome
// da empresa em destaque, o NuFlow assinando embaixo. Slug que não existe ganha
// a arte do NuFlow, sem dizer nada sobre empresas.
export const alt = "Área da empresa no NuFlow"
export const size = TAMANHO_ARTE
export const contentType = "image/png"

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  return arteCompartilhamento(await empresaDoPortal((await params).slug))
}
