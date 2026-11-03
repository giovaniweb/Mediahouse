// A empresa de uma página pública que também é aberta de dentro do painel.
//
// A galeria (/galeria) é vitrine pública de cada empresa, mas o Dashboard e o
// Histórico levam a ela sem a empresa no endereço. Antes isso funcionava porque
// a API caía na empresa padrão; a equipe de outra empresa via a galeria da
// Contourline. Agora a ordem é: a empresa do endereço (?org=), senão a de quem
// está logado, senão nenhuma. Nunca uma empresa padrão.
//
// Só para LEITURA de vitrine. Formulário que grava exige a empresa no endereço
// (orgPublica direto): a empresa de quem está logado não é a de quem pede.
import { auth } from "@/lib/auth"
import { getOrgId, orgPublica } from "@/lib/org"

export async function orgPublicaOuDaSessao(
  slug: string | null | undefined,
): Promise<{ organizacaoId: string | null; daSessao: boolean }> {
  if (slug?.trim()) return { organizacaoId: await orgPublica(slug), daSessao: false }
  const session = await auth().catch(() => null)
  if (!session?.user) return { organizacaoId: null, daSessao: false }
  return { organizacaoId: await getOrgId(session), daSessao: true }
}
