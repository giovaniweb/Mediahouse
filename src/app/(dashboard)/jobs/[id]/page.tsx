import { DemandaDetalhe } from "@/components/demandas/DemandaDetalhe"

// Página do Job — a MESMA tela de detalhe de Demanda.
//
// A primeira versão era uma tela própria, só de leitura: bonita de ler e inútil
// para trabalhar. Não dava para editar campo, anexar arquivo, atribuir
// videomaker ou editor, mexer no checklist nem comentar — tudo isso já existia
// em DemandaDetalhe, e a tela de Job simplesmente não tinha.
//
// Um Job É uma Demanda classificada como cobertura (ver lib/job-fase.ts): o
// registro é o mesmo, o id é o mesmo. Manter duas telas para o mesmo registro
// significava manter duas vezes cada campo editável — e foi por isso que a
// segunda nasceu crua e ficou para trás.
//
// O que era próprio do Job não se perdeu: etapa, responsável atual, próxima
// ação e as ações objetivas do videomaker (§13) entraram DENTRO de
// DemandaDetalhe, que já sabe quando a demanda é cobertura.
export default async function JobDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DemandaDetalhe demandaId={String(id)} mode="page" />
}
