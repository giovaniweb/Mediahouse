import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess("gerenciarFornecedores")
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const item = await prisma.produtoServicoEvento.update({
    where: { id },
    data: {
      nome: body.nome,
      categoria: body.categoria,
      fornecedorId: body.fornecedorId,
      valorUnitario: body.valorUnitario !== undefined ? (body.valorUnitario ? parseFloat(body.valorUnitario) : null) : undefined,
      unidadeMedida: body.unidadeMedida,
      quantidadeMinima: body.quantidadeMinima !== undefined ? (body.quantidadeMinima ? parseInt(body.quantidadeMinima) : null) : undefined,
      prazoMedioDias: body.prazoMedioDias !== undefined ? (body.prazoMedioDias ? parseInt(body.prazoMedioDias) : null) : undefined,
      observacoes: body.observacoes,
      ativo: body.ativo,
    },
  })
  return NextResponse.json({ item })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess("gerenciarFornecedores")
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  await prisma.produtoServicoEvento.update({ where: { id }, data: { ativo: false } })
  return NextResponse.json({ ok: true })
}
