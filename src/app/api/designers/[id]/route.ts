import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const designer = await prisma.designer.findUnique({
    where: { id },
    include: {
      demandas: {
        where: { area: "design" },
        select: { id: true, codigo: true, titulo: true, statusVisivel: true, tipoVideo: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  })
  if (!designer) return NextResponse.json({ error: "Designer não encontrado" }, { status: 404 })
  return NextResponse.json({ designer })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const designer = await prisma.designer.update({
    where: { id },
    data: {
      nome: body.nome,
      cidade: body.cidade,
      estado: body.estado,
      telefone: body.telefone,
      whatsapp: body.whatsapp,
      email: body.email,
      cpfCnpj: body.cpfCnpj,
      chavePix: body.chavePix,
      valorDiaria: body.valorDiaria !== undefined ? (body.valorDiaria ? parseFloat(body.valorDiaria) : null) : undefined,
      salario: body.salario !== undefined ? (body.salario ? parseFloat(body.salario) : null) : undefined,
      dadosBancarios: body.dadosBancarios,
      status: body.status,
      observacoes: body.observacoes,
      especialidade: body.especialidade,
      habilidades: body.habilidades,
      portfolio: body.portfolio,
      tipoContrato: body.tipoContrato,
      avaliacao: body.avaliacao,
    },
  })
  return NextResponse.json(designer)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const count = await prisma.demanda.count({ where: { designerId: id } })
  if (count > 0) {
    await prisma.designer.update({ where: { id }, data: { status: "inativo" } })
    return NextResponse.json({ ok: true, softDelete: true })
  }
  await prisma.designer.delete({ where: { id } })
  return NextResponse.json({ ok: true, softDelete: false })
}
