import { RedirecionarParaArea } from "@/components/publico/RedirecionarParaArea"

// Link antigo do cadastro: leva a /c/<empresa>/videomaker (ver RedirecionarParaArea).
export default function CadastrarVideomaker({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <RedirecionarParaArea busca={searchParams} trecho="/videomaker" />
}
