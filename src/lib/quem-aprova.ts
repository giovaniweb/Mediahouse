// Quem decide a fila de Aprovações: admin/gestor da empresa ativa OU o líder do
// audiovisual dela. Saiu de api/demandas/[id]/aprovar (21/10/2026) para a
// criação usar a mesma régua: quem pode aprovar não precisa aprovar o próprio
// pedido depois (o "+ Novo Job" de /jobs).
import type { Session } from "next-auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import type { CategoriaPessoa, StatusInterno } from "@prisma/client"

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

// ── Pedido feito por dentro nasce aprovado ───────────────────────────────────
// Decisão de 28/10/2026: "só preciso de aprovação de demandas externas". O
// portão de Aprovações deixou de ser universal. Quem está logado e é da casa
// cria o pedido já aprovado; a fila fica com o que chega de fora sem login —
// formulário público, área do cliente (/c/<slug>), WhatsApp e e-mail, que nem
// passam por aqui.
//
// Duas exceções continuam indo para a fila:
//   - profissional externo logado (freelancer no portal): é gente de fora;
//   - urgência de quem não decide a fila: furar a fila é decisão de gestão.
// Sem vínculo com a empresa, também vai para a fila (fail-closed).

/** A regra, sem banco. `decide` = admin/gestor ou líder do audiovisual. */
export function pedidoNasceAprovado(q: {
  decide: boolean
  categoria: CategoriaPessoa | null
  urgente: boolean
}): boolean {
  if (q.decide) return true
  if (!q.categoria || q.categoria === "externo") return false
  return !q.urgente
}

export type EntradaDoPedido = {
  aprovado: boolean
  /** Quem criou decide a fila: aí ele fica registrado como quem aprovou. */
  porQuemDecide: boolean
  statusInterno: StatusInterno
}

/** Onde nasce o pedido criado por alguém logado. */
export async function entradaDoPedidoInterno(
  quem: { usuarioId: string; gestor: boolean },
  organizacaoId: string,
  urgente: boolean
): Promise<EntradaDoPedido> {
  const membro = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId: quem.usuarioId, organizacaoId } },
    select: { categoria: true, liderAudiovisual: true },
  })
  const decide = quem.gestor || !!membro?.liderAudiovisual
  const aprovado = pedidoNasceAprovado({ decide, categoria: membro?.categoria ?? null, urgente })
  return {
    aprovado,
    porQuemDecide: decide,
    statusInterno: aprovado
      ? statusAoAprovar(urgente)
      : urgente ? "urgencia_pendente_aprovacao" : "aguardando_aprovacao_interna",
  }
}

// ── Quem aprova a ENTREGA por dentro ─────────────────────────────────────────
// Outra pergunta que a de cima: aquela é a entrada do pedido na fila; esta é a
// peça pronta, na etapa de aprovação. Aprova quem pediu, a social media dona do
// pedido (decisão de 05/10: "só a social prioriza e aprova os próprios
// pedidos"), gestor e admin. Quem fez a peça não aprova a própria entrega —
// nem quando também é gestor: aí quem aprova é quem pediu, ou o cliente pelo link.

export type PessoasDaEntrega = {
  solicitanteId: string
  socialId?: string | null
  responsavelId?: string | null
  responsaveis?: { usuario?: { id?: string | null } | null }[] | null
  editor?: { usuarioId?: string | null } | null
  designer?: { usuarioId?: string | null } | null
  videomaker?: { usuarioId?: string | null } | null
}

/** Editor, designer, videomaker ou responsável/executor do card. */
export function fezAPeca(usuarioId: string, d: PessoasDaEntrega): boolean {
  const quemFez = [
    d.responsavelId,
    ...(d.responsaveis ?? []).map((r) => r.usuario?.id),
    d.editor?.usuarioId,
    d.designer?.usuarioId,
    d.videomaker?.usuarioId,
  ]
  return quemFez.includes(usuarioId)
}

export function podeAprovarEntrega(
  quem: { usuarioId: string; gestor: boolean },
  d: PessoasDaEntrega,
): boolean {
  if (fezAPeca(quem.usuarioId, d)) return false
  return quem.gestor || d.solicitanteId === quem.usuarioId || d.socialId === quem.usuarioId
}

/** O que a consulta precisa trazer para `podeAprovarEntrega` decidir. */
export const SELECT_PESSOAS_DA_ENTREGA = {
  solicitanteId: true,
  socialId: true,
  responsavelId: true,
  responsaveis: { select: { usuario: { select: { id: true } } } },
  editor: { select: { usuarioId: true } },
  designer: { select: { usuarioId: true } },
  videomaker: { select: { usuarioId: true } },
} as const
