import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { empresaDoPortal } from "@/lib/portal"
import FormularioPedido, { type TipoPedido } from "@/components/publico/FormularioPedido"

// O formulário de pedido, dentro da área da empresa: o slug
// vem do caminho (/c/<slug>/...), e o formulário o repassa à API sozinho.
// O `?tipo=` vem da porta escolhida na área ("Quero um vídeo", "Quero uma
// arte") e pula a tela de escolher o tipo.
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

const TITULOS: Record<TipoPedido, string> = { video: "Quero um vídeo", conteudo: "Quero uma arte" }

function tipoDaBusca(valor: string | string[] | undefined): TipoPedido | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor
  return v === "video" || v === "conteudo" ? v : undefined
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const empresa = await empresaDoPortal((await params).slug)
  const tipo = tipoDaBusca((await searchParams).tipo)
  return { title: empresa ? `${tipo ? TITULOS[tipo] : "Fazer um pedido"} · ${empresa.nome}` : "Área não encontrada · NuFlow", robots: { index: false, follow: false } }
}

export default async function Pagina({ params, searchParams }: Props) {
  const empresa = await empresaDoPortal((await params).slug)
  if (!empresa) notFound()
  const busca = await searchParams
  // Pedido de gravação tem formulário próprio, curto. O link antigo
  // (?tipo=cobertura, inclusive vindo de /cadastrar-demanda) vai para ele.
  if ((Array.isArray(busca.tipo) ? busca.tipo[0] : busca.tipo) === "cobertura") redirect(`/c/${empresa.slug}/gravacao`)
  return <FormularioPedido tipoFixo={tipoDaBusca(busca.tipo)} />
}
