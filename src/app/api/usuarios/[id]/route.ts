import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH /api/usuarios/[id] — atualiza status/tipo (admin)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  // Usuário pode atualizar o próprio perfil; admin pode atualizar qualquer um
  const isOwn = session.user.id === id
  const isAdmin = session.user.tipo === "admin"

  if (!isOwn && !isAdmin) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const body = await req.json()
  const { status, tipo, nome, telefone } = body

  const data: Record<string, unknown> = {}
  if (nome) data.nome = nome
  if (telefone !== undefined) data.telefone = telefone
  if (isAdmin && status) data.status = status
  if (isAdmin && tipo) data.tipo = tipo

  const usuario = await prisma.usuario.update({
    where: { id },
    data,
    select: { id: true, nome: true, email: true, tipo: true, status: true },
  })

  return NextResponse.json({ usuario })
}

// DELETE /api/usuarios/[id] — desativa usuário (admin); não apaga do banco
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  if (session.user.tipo !== "admin") {
    return NextResponse.json({ error: "Somente admin pode desativar usuários" }, { status: 403 })
  }

  if (session.user.id === id) {
    return NextResponse.json({ error: "Não é possível desativar sua própria conta aqui" }, { status: 400 })
  }

  const usuario = await prisma.usuario.update({
    where: { id },
    data: { status: "inativo" },
    select: { id: true, nome: true, status: true },
  })

  return NextResponse.json({ usuario })
}
