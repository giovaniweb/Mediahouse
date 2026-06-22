import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const { organizacaoId } = guard
  const body = await req.json()

  // Valida que o produto a vincular pertence à mesma organização (evita vínculo cross-org)
  if (body.produtoId) {
    const prod = await prisma.produto.findUnique({ where: { id: body.produtoId }, select: { organizacaoId: true } })
    if (!prod || prod.organizacaoId !== organizacaoId) {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })
    }
  }

  // Remove existing product links
  await prisma.demandaProduto.deleteMany({ where: { demandaId: id } })

  // Create new link if produtoId provided
  if (body.produtoId) {
    await prisma.demandaProduto.create({
      data: {
        demandaId: id,
        produtoId: body.produtoId,
      },
    })
  }

  return NextResponse.json({ ok: true })
}
