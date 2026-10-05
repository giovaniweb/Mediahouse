import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { empresaDoPortal } from "@/lib/portal"
import CadastroProfissional from "@/components/publico/CadastroProfissional"

// "Sou videomaker", dentro da área da empresa: o slug vem do caminho
// (/c/<slug>/...), e o formulário o repassa à API sozinho.
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const empresa = await empresaDoPortal((await params).slug)
  return { title: empresa ? `Trabalhe com a gente · ${empresa.nome}` : "Área não encontrada · NuFlow", robots: { index: false, follow: false } }
}

export default async function Pagina({ params }: Props) {
  if (!await empresaDoPortal((await params).slug)) notFound()
  return <CadastroProfissional papel="videomaker" />
}
