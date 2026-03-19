import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const ideia = await prisma.ideiaVideo.findUnique({
    where: { id },
    include: {
      produto: { select: { id: true, nome: true } },
      demanda: { select: { id: true, codigo: true, titulo: true, statusVisivel: true } },
      usuario: { select: { id: true, nome: true } },
    },
  })

  if (!ideia) return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })

  return NextResponse.json(ideia)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { titulo, descricao, status, classificacao, produtoId, tags, linkReferencia } = body

  const ideia = await prisma.ideiaVideo.findUnique({ where: { id } })
  if (!ideia) return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {}
  if (titulo !== undefined) data.titulo = titulo
  if (descricao !== undefined) data.descricao = descricao
  if (status !== undefined) data.status = status
  if (classificacao !== undefined) data.classificacao = classificacao
  if (produtoId !== undefined) data.produtoId = produtoId || null
  if (tags !== undefined) data.tags = tags
  if (linkReferencia !== undefined) data.linkReferencia = linkReferencia

  const updated = await prisma.ideiaVideo.update({
    where: { id },
    data,
    include: {
      produto: { select: { id: true, nome: true } },
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  await prisma.ideiaVideo.update({
    where: { id },
    data: { status: "descartada" },
  })

  return NextResponse.json({ ok: true })
}
