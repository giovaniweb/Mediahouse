// Helpers de isolamento por organização (SaaS multiempresa — Fase 1).
// Padrão de uso numa rota autenticada:
//   const session = await auth()
//   const organizacaoId = await getOrgId(session)
//   if (!organizacaoId) return semOrg()
//   ...prisma.x.findMany({ where: { organizacaoId } })
//   ...ownership: if (!pertenceAOrg(record, organizacaoId)) return NextResponse.json(..., { status: 404 })
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Session } from "next-auth"

type SessionUser = { id?: string; organizacaoId?: string | null }
// Tipo estrutural mínimo aceito — cobre tanto a Session do NextAuth quanto os
// SessionLike narrowados (ex.: requireEventoAccess) que só carregam user.id.
type SessionShape = { user?: SessionUser | { id: string; tipo?: string } } | null | undefined

// Resolve a organização ativa da sessão. Se o token for antigo (sem organizacaoId),
// faz fallback resolvendo a membership pelo usuário — evita forçar re-login.
export async function getOrgId(session: SessionShape): Promise<string | null> {
  const u = session?.user as SessionUser | undefined
  if (!u) return null
  if (u.organizacaoId) return u.organizacaoId
  if (!u.id) return null
  const m = await prisma.usuarioOrganizacao.findFirst({
    where: { usuarioId: u.id },
    orderBy: { createdAt: "asc" },
    select: { organizacaoId: true },
  })
  return m?.organizacaoId ?? null
}

// Resposta padrão quando a sessão não tem organização resolvível.
export function semOrg() {
  return NextResponse.json({ error: "Organização não encontrada na sessão" }, { status: 403 })
}

// Gate de super-admin (gestão global de organizações). Resolve via DB (a flag não
// vive no token), então funciona mesmo com tokens antigos. Retorna o userId se for
// super-admin, ou um NextResponse 401/403 para a rota devolver direto.
export async function requireSuperAdmin(
  session: SessionShape
): Promise<{ usuarioId: string } | NextResponse> {
  const u = session?.user as SessionUser | undefined
  if (!u?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const usuario = await prisma.usuario.findUnique({ where: { id: u.id }, select: { superAdmin: true } })
  if (!usuario?.superAdmin) return NextResponse.json({ error: "Requer super-admin" }, { status: 403 })
  return { usuarioId: u.id }
}

// Verifica se um registro pertence à organização ativa (defesa contra acesso por ID direto).
export function pertenceAOrg(
  record: { organizacaoId?: string | null } | null | undefined,
  organizacaoId: string
): boolean {
  if (!record) return false
  return record.organizacaoId === organizacaoId
}

// Ownership compartilhado de demanda: resolve a org da sessão e garante que a demanda
// pertence a ela. Retorna { organizacaoId } se ok, ou um NextResponse (403/404) para
// a rota devolver direto. Uso:
//   const guard = await requireDemandaOrg(session, id)
//   if (guard instanceof NextResponse) return guard
//   const { organizacaoId } = guard
export async function requireDemandaOrg(
  session: Session | null,
  demandaId: string
): Promise<{ organizacaoId: string } | NextResponse> {
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const d = await prisma.demanda.findUnique({ where: { id: demandaId }, select: { organizacaoId: true } })
  if (!pertenceAOrg(d, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  return { organizacaoId }
}

// Ownership compartilhado de EventoGestao (módulo de eventos). Mesmo padrão de requireDemandaOrg.
export async function requireEventoGestaoOrg(
  session: SessionShape,
  eventoId: string
): Promise<{ organizacaoId: string } | NextResponse> {
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const e = await prisma.eventoGestao.findUnique({ where: { id: eventoId }, select: { organizacaoId: true } })
  if (!pertenceAOrg(e, organizacaoId)) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
  return { organizacaoId }
}
