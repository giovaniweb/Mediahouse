import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH /api/custos-videomaker/[id] — atualizar custo (ex: marcar como pago)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const custo = await prisma.custoVideomaker.findUnique({ where: { id } })
  if (!custo) return NextResponse.json({ error: "Custo não encontrado" }, { status: 404 })

  const updated = await prisma.custoVideomaker.update({
    where: { id },
    data: {
      pago: body.pago ?? custo.pago,
      dataPagamento: body.dataPagamento ? new Date(body.dataPagamento) : custo.dataPagamento,
      comprovante: body.comprovante ?? custo.comprovante,
      valor: body.valor ? parseFloat(body.valor) : custo.valor,
      descricao: body.descricao ?? custo.descricao,
      tipo: body.tipo ?? custo.tipo,
    },
    include: {
      videomaker: { select: { id: true, nome: true } },
      demanda: { select: { id: true, codigo: true, titulo: true } },
    },
  })

  return NextResponse.json({ custo: updated })
}

// DELETE /api/custos-videomaker/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  await prisma.custoVideomaker.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
