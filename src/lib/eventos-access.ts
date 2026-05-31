import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { PermissaoKey } from "@/lib/permissoes"

type SessionLike = { user: { id: string; tipo?: string } }

// Retorna a sessão se o usuário tem a permissão indicada (ou é admin/gestor).
// Usado pelas rotas do módulo de eventos. permissao default = verEventos.
export async function requireEventoAccess(
  permissao: PermissaoKey = "verEventos"
): Promise<SessionLike | null> {
  const session = await auth()
  if (!session?.user) return null

  const tipo = (session.user as { tipo?: string }).tipo
  if (tipo === "admin" || tipo === "gestor") return session as SessionLike

  const perm = await prisma.permissaoUsuario.findUnique({
    where: { usuarioId: session.user.id },
    select: { [permissao]: true } as Record<string, boolean>,
  })
  if (perm && (perm as Record<string, boolean>)[permissao]) return session as SessionLike

  return null
}
