import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get("status")

  const where = status ? { status: status as "ativo" | "inativo" } : {}

  const editores = await prisma.editor.findMany({
    where,
    include: {
      demandas: {
        where: { statusVisivel: { notIn: ["finalizado"] } },
        select: { id: true, pesoDemanda: true, titulo: true, prioridade: true, statusVisivel: true },
      },
    },
    orderBy: { nome: "asc" },
  })

  // Adicionar _count de demandas ativas para facilitar no frontend
  const editoresComCarga = editores.map(e => ({
    ...e,
    _count: { demandas: e.demandas.length },
  }))

  return NextResponse.json({ editores: editoresComCarga })
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
