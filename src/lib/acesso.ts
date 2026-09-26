import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrgId, semOrg } from "@/lib/org"
import { comOrg } from "@/lib/org-contexto"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import type { PermissaoKey } from "@/lib/permissoes"

/** Fronteira HTTP: identidade, vínculo atual e capacidade da empresa selecionada. */
export async function requireAcesso(capacidade?: PermissaoKey) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const vinculo = await comOrg(organizacaoId, () => permissoesEfetivas(session.user.id, organizacaoId))
  if (!vinculo || (capacidade && !vinculo.permissoes[capacidade])) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  return { usuarioId: session.user.id, organizacaoId, ...vinculo }
}
