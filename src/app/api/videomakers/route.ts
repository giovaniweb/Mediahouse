import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get("status")

  const videomakers = await prisma.videomaker.findMany({
    where: status ? { status: status as "ativo" | "inativo" | "preferencial" } : undefined,
    include: {
      _count: { select: { demandas: true } },
    },
    orderBy: [{ status: "asc" }, { nome: "asc" }],
  })

  return NextResponse.json(videomakers)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()

  const videomaker = await prisma.videomaker.create({
    data: {
      nome: body.nome,
      cidade: body.cidade,
      estado: body.estado,
      telefone: body.telefone,
      email: body.email,
      cpfCnpj: body.cpfCnpj,
      valorDiaria: body.valorDiaria ? parseFloat(body.valorDiaria) : undefined,
      dadosBancarios: body.dadosBancarios,
      status: body.status ?? "ativo",
      observacoes: body.observacoes,
      areasAtuacao: body.areasAtuacao ?? [],
      portfolio: body.portfolio,
    },
  })

  return NextResponse.json(videomaker, { status: 201 })
}
