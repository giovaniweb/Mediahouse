import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const evento = await prisma.evento.findUnique({ where: { id } })
  if (!evento) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })

  // Só admin pode editar eventos privados de outros
  if (evento.privado && evento.usuarioId !== session.user.id && session.user.tipo !== "admin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const updated = await prisma.evento.update({
    where: { id },
    data: {
      titulo: body.titulo ?? evento.titulo,
      descricao: body.descricao ?? evento.descricao,
      inicio: body.inicio ? new Date(body.inicio) : evento.inicio,
      fim: body.fim ? new Date(body.fim) : evento.fim,
      status: body.status ?? evento.status,
      cor: body.cor ?? evento.cor,
      local: body.local ?? evento.local,
    },
  })

  return NextResponse.json({ evento: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const evento = await prisma.evento.findUnique({ where: { id } })
  if (!evento) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })

  if (evento.usuarioId !== session.user.id && session.user.tipo !== "admin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  await prisma.evento.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
