import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const editor = await prisma.editor.findUnique({
    where: { id },
    include: {
      demandas: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, codigo: true, titulo: true, statusVisivel: true,
          prioridade: true, createdAt: true,
        },
      },
    },
  })

  if (!editor) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  return NextResponse.json({ editor })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const editor = await prisma.editor.update({
    where: { id },
    data: {
      nome: body.nome,
      telefone: body.telefone,
      email: body.email,
      especialidade: body.especialidade,
      cargaLimite: body.cargaLimite,
      status: body.status,
    },
  })

  return NextResponse.json(editor)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  await prisma.editor.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
