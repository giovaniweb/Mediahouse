import type { Metadata } from "next"
import { empresaDoPortal } from "@/lib/portal"

// Só o título da prévia: sem isto, o link da área de uma empresa ia para o
// WhatsApp com o título "NuFlow" do site, embaixo da arte com o nome da empresa.
// A arte vem de opengraph-image.tsx, nesta pasta.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const empresa = await empresaDoPortal((await params).slug)
  if (!empresa) return {}
  const title = `${empresa.nome} · NuFlow`
  const description = "Peça vídeos e artes, agende gravações e acompanhe seus pedidos."
  return {
    openGraph: { title, description, siteName: "NuFlow", type: "website", locale: "pt_BR", url: `/c/${empresa.slug}` },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
