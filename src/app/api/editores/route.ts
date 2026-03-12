import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const editores = await prisma.editor.findMany({
    include: {
      demandas: {
        where: { statusVisivel: { notIn: ["finalizado"] } },
        select: { id: true, pesoDemanda: true, titulo: true, prioridade: true, statusVisivel: true },
      },
    },
    orderBy: { nome: "asc" },
  })

  return NextResponse.json({ editores })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()

  const editor = await prisma.editor.create({
    data: {
      nome: body.nome,
      telefone: body.telefone,
      email: body.email,
      especialidade: body.especialidade ?? [],
      cargaLimite: body.cargaLimite ?? 5,
      status: body.status ?? "ativo",
    },
  })

  return NextResponse.json(editor, { status: 201 })
}
