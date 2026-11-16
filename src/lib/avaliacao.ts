// Nota agregada de profissional — GLOBAL por desenho.
//
// No modelo híbrido, a média de estrelas é o ativo do profissional na rede: ele
// carrega a reputação de uma empresa para a outra, e é isso que faz o
// marketplace valer alguma coisa. Por isso `Videomaker.avaliacao` e
// `Editor.avaliacao` moram no perfil global e são recalculados sobre TODAS as
// avaliações, sem recorte de empresa.
//
// O COMENTÁRIO é outra história — "sumiu no dia da gravação" é observação
// interna de quem contratou. Desde a Onda 2B, só a empresa que contratou e o
// profissional leem o comentário (lib/rede); a avaliação por convite resolve a
// empresa pelo serviço. A média segue a Política: 24 meses, sem nota removida
// nem contestada (função score_rede).
//
// ── Por que isto virou chamada de função no banco ───────────────────────────
//
// Sob RLS, escrever no perfil exige vínculo com a empresa ativa — senão a
// empresa A renomearia o profissional da empresa B na rede inteira. Só que o
// recálculo da média precisa acontecer também na avaliação por QR PÚBLICO, que
// não tem empresa nenhuma. E RLS decide por LINHA, não por coluna: não há como
// dizer "pode atualizar `avaliacao` e mais nada".
//
// A saída é uma função SECURITY DEFINER que escreve UMA coluna, com um valor que
// ela mesma calcula a partir das avaliações. Ela não aceita a nota de fora, então
// não dá para gravar uma média inventada por ela.
import { prismaBase } from "@/lib/prisma"

/** Recalcula e grava a média do videomaker. Devolve a nova média. */
export async function recalcularMediaVideomaker(videomakerId: string): Promise<number> {
  const linhas = await prismaBase.$queryRaw<{ media: number | null }[]>`
    SELECT public.recalcular_media_videomaker(${videomakerId}) AS media
  `
  return linhas[0]?.media ?? 0
}

/** Recalcula e grava a média do editor. Devolve a nova média. */
export async function recalcularMediaEditor(editorId: string): Promise<number> {
  const linhas = await prismaBase.$queryRaw<{ media: number | null }[]>`
    SELECT public.recalcular_media_editor(${editorId}) AS media
  `
  return linhas[0]?.media ?? 0
}
