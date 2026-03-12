import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const { comentario } = await req.json()

  if (!comentario?.trim()) {
    return NextResponse.json({ error: "Comentário vazio" }, { status: 400 })
  }

  const novo = await prisma.comentario.create({
    data: {
      demandaId: id,
      usuarioId: session.user.id,
      comentario: comentario.trim(),
    },
    include: {
      usuario: { select: { id: true, nome: true } },
    },
  })

  return NextResponse.json(novo, { status: 201 })
}
