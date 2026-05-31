import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import type { CategoriaCusto } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

// POST — lança custo
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (!body.descricao?.trim()) return NextResponse.json({ error: "Descrição obrigatória" }, { status: 400 })

  const custo = await prisma.custoEvento.create({
    data: {
      eventoId: id,
      descricao: body.descricao.trim(),
      categoria: (body.categoria ?? "extras") as CategoriaCusto,
      valorPrevisto: body.valorPrevisto ? parseFloat(body.valorPrevisto) : 0,
      valorReal: body.valorReal ? parseFloat(body.valorReal) : null,
      quantidade: body.quantidade ? parseFloat(body.quantidade) : null,
      fornecedorId: body.fornecedorId || null,
      produtoServicoId: body.produtoServicoId || null,
      dataVencimento: body.dataVencimento ? new Date(body.dataVencimento) : null,
    },
  })
  return NextResponse.json({ custo }, { status: 201 })
}

// PATCH — atualiza pago/valorReal
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  await params
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  await prisma.custoEvento.update({
    where: { id: body.id },
    data: {
      ...(body.valorReal !== undefined ? { valorReal: body.valorReal ? parseFloat(body.valorReal) : null } : {}),
      ...(body.pago !== undefined ? { pago: body.pago, dataPagamento: body.pago ? new Date() : null } : {}),
      ...(body.statusPagamento !== undefined ? { statusPagamento: body.statusPagamento } : {}),
    },
  })
  return NextResponse.json({ ok: true })
}

// DELETE ?custoId=
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  await params
  const custoId = req.nextUrl.searchParams.get("custoId")
  if (!custoId) return NextResponse.json({ error: "custoId obrigatório" }, { status: 400 })
  await prisma.custoEvento.delete({ where: { id: custoId } })
  return NextResponse.json({ ok: true })
}
