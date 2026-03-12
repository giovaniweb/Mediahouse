import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/usuarios/me
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      tipo: true,
      status: true,
      avatarUrl: true,
      createdAt: true,
    },
  })

  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  return NextResponse.json({ usuario })
}

// PATCH /api/usuarios/me — atualiza nome, telefone, avatarUrl
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const { nome, telefone, avatarUrl } = body

  const usuario = await prisma.usuario.update({
    where: { id: session.user.id },
    data: {
      ...(nome && { nome }),
      ...(telefone !== undefined && { telefone }),
      ...(avatarUrl !== undefined && { avatarUrl }),
    },
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      avatarUrl: true,
    },
  })

  return NextResponse.json({ usuario })
}
