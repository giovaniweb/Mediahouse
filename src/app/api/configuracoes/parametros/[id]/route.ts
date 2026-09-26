import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pertenceAOrg } from "@/lib/org"

// Garante que o parâmetro pertence à org da sessão (404 se não).
async function assertParamOrg(organizacaoId: string, id: string): Promise<NextResponse | null> {
  const p = await prisma.configParametro.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!pertenceAOrg(p, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  return null
}

// PATCH /api/configuracoes/parametros/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso

  const { id } = await params
  const guard = await assertParamOrg(acesso.organizacaoId, id)
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
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso

  const papel = acesso.papel
  if (papel !== "admin") return NextResponse.json({ error: "Apenas admin pode excluir parâmetros" }, { status: 403 })

  const { id } = await params
  const guard = await assertParamOrg(acesso.organizacaoId, id)
  if (guard) return guard
  await prisma.configParametro.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
