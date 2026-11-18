import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { prisma } from "@/lib/prisma"
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
    if (vinculo && capacidade) {
      // Identidade e vínculo já foram revalidados. Não registrar entrada bruta nem sessão.
      await comOrg(organizacaoId, () => registrarAuditoria(prisma, { organizacaoId, usuarioId: session.user.id }, {
        acao: "acesso.negado", recurso: "permissao", recursoId: capacidade, resultado: "negado", correlationId: correlacaoAuditoria(),
      })).catch(() => { console.error("[auditoria] Falha ao registrar acesso negado") })
    }
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  return { usuarioId: session.user.id, organizacaoId, ...vinculo }
}

/**
 * Para rotas que já leem a sessão e a empresa por conta própria: devolve a
 * resposta de recusa (401/403) quando falta a capacidade, ou null. Auditoria de
 * 18/11/2026: várias escritas só conferiam sessão e empresa, e qualquer membro
 * (solicitante, videomaker externo) mexia no cadastro.
 */
export async function semCapacidade(capacidade: PermissaoKey): Promise<NextResponse | null> {
  const r = await requireAcesso(capacidade)
  return r instanceof NextResponse ? r : null
}
