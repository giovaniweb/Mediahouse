import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const vm = await prisma.videomaker.findUnique({
    where: { id },
    include: {
      demandas: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, codigo: true, titulo: true, statusVisivel: true,
          statusInterno: true, prioridade: true, createdAt: true,
        },
      },
    },
  })

  if (!vm) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  return NextResponse.json({ videomaker: vm })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const vm = await prisma.videomaker.update({
    where: { id },
    data: {
      nome: body.nome,
      cidade: body.cidade,
      estado: body.estado,
      telefone: body.telefone,
      email: body.email,
      cpfCnpj: body.cpfCnpj,
      valorDiaria: body.valorDiaria ? parseFloat(body.valorDiaria) : undefined,
      dadosBancarios: body.dadosBancarios,
      status: body.status,
      avaliacao: body.avaliacao,
      observacoes: body.observacoes,
      areasAtuacao: body.areasAtuacao,
      portfolio: body.portfolio,
      podeEditar: body.podeEditar,
    },
  })

  return NextResponse.json(vm)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  await prisma.videomaker.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
