import { auth } from "@/lib/auth"
import { getOrgId } from "@/lib/org"
import { papelNaOrg } from "@/lib/papel"
import { temPermissao } from "@/lib/permissoes-server"
import type { PermissaoKey } from "@/lib/permissoes"

type SessionLike = { user: { id: string; tipo?: string } }

// Retorna a sessão se o usuário tem a permissão indicada (ou administra a
// empresa). Usado pelas rotas do módulo de eventos; default = verEventos.
//
// A permissão é lida na EMPRESA ATIVA: antes vinha de uma linha global por
// usuário, então um acesso concedido numa empresa valia em todas as outras.
export async function requireEventoAccess(
  permissao: PermissaoKey = "verEventos"
): Promise<SessionLike | null> {
  const session = await auth()
  if (!session?.user) return null

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return null

  const ok = await temPermissao(session.user.id, organizacaoId, permissao, papelNaOrg(session))
  return ok ? (session as SessionLike) : null
}
