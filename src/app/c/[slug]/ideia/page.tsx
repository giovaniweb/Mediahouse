import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { empresaDoPortal } from "@/lib/portal"
import FormularioIdeia from "@/components/publico/FormularioIdeia"

// "Mande uma ideia": ideia ou solicitação para a social media, sem login.
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const empresa = await empresaDoPortal((await params).slug)
  return { title: empresa ? `Mande uma ideia · ${empresa.nome}` : "Área não encontrada · NuFlow", robots: { index: false, follow: false } }
}

export default async function Pagina({ params }: Props) {
  if (!await empresaDoPortal((await params).slug)) notFound()
  return <FormularioIdeia />
}
