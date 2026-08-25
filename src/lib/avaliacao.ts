// Nota agregada de profissional — GLOBAL por desenho.
//
// No modelo híbrido, a média de estrelas é o ativo do profissional na rede: ele
// carrega a reputação de uma empresa para a outra, e é isso que faz o
// marketplace valer alguma coisa. Por isso `Videomaker.avaliacao` e
// `Editor.avaliacao` moram no perfil global e são recalculados sobre TODAS as
// avaliações, sem recorte de empresa.
//
// O COMENTÁRIO é outra história — "sumiu no dia da gravação" é observação
// interna de quem contratou, não da rede. Hoje ele mora na mesma linha, sem
// dono, e qualquer empresa que abra o perfil lê o que a outra escreveu. Fechar
// isso exige uma coluna em `avaliacoes_videomaker` e `avaliacoes_editor`, que é
// Fase 2. Até lá, o dado agregado está certo e o comentário está em dívida.
import { prisma } from "@/lib/prisma"

function arredondar(media: number | null): number {
  return Math.round((media ?? 0) * 10) / 10
}

/** Recalcula e grava a média do videomaker. Devolve a nova média. */
export async function recalcularMediaVideomaker(videomakerId: string): Promise<number> {
  // `aggregate` em vez de carregar as linhas: o cálculo é do banco, e a rota
  // parava de trazer todas as avaliações para a memória só para somar.
  const { _avg } = await prisma.avaliacaoVideomaker.aggregate({
    where: { videomakerId },
    _avg: { nota: true },
  })
  const media = arredondar(_avg.nota)
  await prisma.videomaker.update({ where: { id: videomakerId }, data: { avaliacao: media } })
  return media
}

/** Recalcula e grava a média do editor. Devolve a nova média. */
export async function recalcularMediaEditor(editorId: string): Promise<number> {
  const { _avg } = await prisma.avaliacaoEditor.aggregate({
    where: { editorId },
    _avg: { nota: true },
  })
  const media = arredondar(_avg.nota)
  await prisma.editor.update({ where: { id: editorId }, data: { avaliacao: media } })
  return media
}
