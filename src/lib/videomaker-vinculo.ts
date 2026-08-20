// Leituras do vínculo empresa↔videomaker.
//
// O perfil `Videomaker` é global — a rede de profissionais é compartilhada entre
// as empresas. O que NÃO é compartilhado é o combinado comercial: a diária que
// cada empresa negociou e o bloqueio que cada empresa decidiu. Isso vive em
// `VideomakerOrganizacao`, uma linha por empresa.
//
// A R4.1 moveu esses campos para o vínculo e corrigiu a tela de edição, mas
// vários leitores continuaram consultando as colunas antigas do perfil global.
// Duas consequências, ambas em produção:
//
//   1. O custo lançado ao finalizar uma demanda usava a diária global — a
//      negociada ficava ignorada, e quem tinha o global vazio recebia custo R$ 0.
//   2. A lista negra global tinha ZERO registros, então bloquear alguém não o
//      tirava da tela de equipe nem da triagem da IA. Pior: se alguém marcasse
//      ali, o profissional sumiria para TODAS as empresas.
//
// Este módulo é a única porta para esses dois dados. Ler `videomaker.valorDiaria`
// ou `videomaker.emListaNegra` direto é bug — as colunas serão apagadas.

import { prisma } from "@/lib/prisma"

/**
 * Diária que ESTA empresa negociou com o profissional.
 *
 * Devolve `null` quando não há vínculo ou quando o vínculo não tem valor — e
 * `null` é diferente de zero de propósito: quem chama precisa poder distinguir
 * "combinamos R$ 0" de "não há combinado", que era exatamente a confusão que
 * fazia custo entrar como R$ 0 sem ninguém perceber.
 *
 * O perfil global NUNCA é consultado aqui. Para fins financeiros ele não existe.
 */
export async function diariaDaEmpresa(
  videomakerId: string,
  organizacaoId: string
): Promise<number | null> {
  const vinculo = await prisma.videomakerOrganizacao.findUnique({
    where: { organizacaoId_videomakerId: { organizacaoId, videomakerId } },
    select: { valorDiaria: true },
  })
  return vinculo?.valorDiaria ?? null
}

/**
 * Ids dos profissionais que ESTA empresa bloqueou.
 *
 * Bloqueio é estritamente por empresa: se a Contourline barra alguém, ele segue
 * disponível para as outras. Use o retorno em `id: { notIn: [...] }` — devolver
 * a lista de excluídos (em vez de filtrar dentro) mantém o filtro visível na
 * consulta de quem chama, em vez de escondido numa camada.
 */
export async function bloqueadosDaEmpresa(organizacaoId: string): Promise<string[]> {
  const vinculos = await prisma.videomakerOrganizacao.findMany({
    where: { organizacaoId, emListaNegra: true },
    select: { videomakerId: true },
  })
  return vinculos.map((v) => v.videomakerId)
}
