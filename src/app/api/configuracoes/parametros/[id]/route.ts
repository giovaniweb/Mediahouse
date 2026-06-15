import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"
import type { Session } from "next-auth"

// Garante que o parâmetro pertence à org da sessão (404 se não).
async function assertParamOrg(session: Session | null, id: string): Promise<NextResponse | null> {
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const p = await prisma.configParametro.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!pertenceAOrg(p, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  return null
}

// PATCH /api/configuracoes/parametros/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await assertParamOrg(session, id)
  if (guard) return guard
  const body = await req.json()

  const p = await prisma.configParametro.update({
    where: { id },
    data: {
      ...(body.label !== undefined && { label: body.label }),
      ...(body.ordem !== undefined && { ordem: body.ordem }),
      ...(body.ativo !== undefined && { ativo: body.ativo }),
    },
  })
  return NextResponse.json({ parametro: p })
}

// DELETE /api/configuracoes/parametros/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const papel = (session.user as { tipo?: string }).tipo
  if (papel !== "admin") return NextResponse.json({ error: "Apenas admin pode excluir parâmetros" }, { status: 403 })

  const { id } = await params
  const guard = await assertParamOrg(session, id)
  if (guard) return guard
  await prisma.configParametro.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
