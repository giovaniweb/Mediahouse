import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/demandas/[id]/posicao
// Body: { posicaoKanban: number }
// Atualiza a posição do card dentro da sua coluna
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { posicaoKanban } = body

  if (typeof posicaoKanban !== "number") {
    return NextResponse.json({ error: "posicaoKanban deve ser um número" }, { status: 400 })
  }

  await prisma.demanda.update({
    where: { id },
    data: { posicaoKanban },
  })

  return NextResponse.json({ ok: true })
}
