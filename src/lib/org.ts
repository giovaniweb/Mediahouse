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

// Resolve a organização ativa da sessão. Se o token for antigo (sem organizacaoId),
// faz fallback resolvendo a membership pelo usuário — evita forçar re-login.
export async function getOrgId(session: Session | null | undefined): Promise<string | null> {
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

// Verifica se um registro pertence à organização ativa (defesa contra acesso por ID direto).
export function pertenceAOrg(
  record: { organizacaoId?: string | null } | null | undefined,
  organizacaoId: string
): boolean {
  if (!record) return false
  return record.organizacaoId === organizacaoId
}
