// Quem decide a fila de Aprovações: admin/gestor da empresa ativa OU o líder do
// audiovisual dela. Saiu de api/demandas/[id]/aprovar (21/10/2026) para a
// criação usar a mesma régua: quem pode aprovar não precisa aprovar o próprio
// pedido depois (o "+ Novo Job" de /jobs).
import type { Session } from "next-auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import type { StatusInterno } from "@prisma/client"

export async function podeAprovar(session: Session, organizacaoId: string): Promise<boolean> {
  if (ehGestor(session)) return true
  const membro = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId: session.user.id, organizacaoId } },
    select: { liderAudiovisual: true },
  })
  return !!membro?.liderAudiovisual
}

/**
 * Para onde a aprovação leva. Urgência aprovada pula a triagem e entra em
 * produção — é o que a urgência significa, e é a transição que
 * TRANSICOES_VALIDAS já declara.
 */
export function statusAoAprovar(urgente: boolean): StatusInterno {
  return urgente ? "urgencia_aprovada" : "aguardando_triagem"
}
