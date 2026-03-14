import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH /api/configuracoes/parametros/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const p = await prisma.configParametro.update({
    where: { id },
    data: {
      ...(body.label !== undefined && { label: body.label }),
      ...(body.ordem !== undefined && { ordem: body.ordem }),
      ...(body.ativo !== undefined && { ativo: body.ativo }),
    },
  })
  return NextResponse.json({ parametro: p })
}

// DELETE /api/configuracoes/parametros/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const papel = (session.user as { tipo?: string }).tipo
  if (papel !== "admin") return NextResponse.json({ error: "Apenas admin pode excluir parâmetros" }, { status: 403 })

  const { id } = await params
  await prisma.configParametro.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
