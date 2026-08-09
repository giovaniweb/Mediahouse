import AprovacoesView from "@/components/aprovacoes/AprovacoesView"

// Aprovações do Growth (criativos/artes). Sem a aba de pagamentos: ela expõe
// PIX e CPF/CNPJ de videomaker, que não é assunto de quem aprova conteúdo.
export default function AprovacoesGrowthPage() {
  return <AprovacoesView area="design" />
}
