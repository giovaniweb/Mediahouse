import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

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
