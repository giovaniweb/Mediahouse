import { RedirecionarParaArea } from "@/components/publico/RedirecionarParaArea"

// Link antigo do pedido: leva a /c/<empresa>/pedido (ver RedirecionarParaArea).
export default function CadastrarDemanda({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <RedirecionarParaArea busca={searchParams} trecho="/pedido" />
}
