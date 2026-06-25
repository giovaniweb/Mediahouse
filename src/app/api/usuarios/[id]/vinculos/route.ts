import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { contarVinculos } from "@/lib/usuario-vinculos"

type Params = { params: Promise<{ id: string }> }

// GET /api/usuarios/[id]/vinculos — vínculos do usuário (admin/gestor), p/ a UI decidir
// entre "Excluir cadastro vazio" e "Mesclar duplicado". Org-scoped (só pessoa da org).
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  const membership = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId: id, organizacaoId } },
    select: { id: true },
  })
  if (!membership) return NextResponse.json({ error: "Pessoa não encontrada nesta organização" }, { status: 404 })

  const vinculos = await contarVinculos(id)
  return NextResponse.json({ vinculos })
}
