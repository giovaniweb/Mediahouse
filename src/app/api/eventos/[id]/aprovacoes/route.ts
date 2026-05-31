import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import type { TipoAprovacao } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

// POST — solicita aprovação
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const aprovacao = await prisma.eventoGestaoAprovacao.create({
    data: { eventoId: id, tipo: (body.tipo ?? "orcamento") as TipoAprovacao, status: "pendente", observacao: body.observacao ?? null },
  })
  return NextResponse.json({ aprovacao }, { status: 201 })
}

// PATCH — aprovar/reprovar
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  await params
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  await prisma.eventoGestaoAprovacao.update({
    where: { id: body.id },
    data: {
      status: body.status,
      aprovadoPor: session.user.id,
      ...(body.observacao !== undefined ? { observacao: body.observacao } : {}),
    },
  })
  return NextResponse.json({ ok: true })
}
