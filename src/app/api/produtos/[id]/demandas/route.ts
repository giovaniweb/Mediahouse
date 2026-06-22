import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id: produtoId } = await params
  const body = await req.json()
  const { demandaId } = body

  if (!demandaId) {
    return NextResponse.json({ error: "demandaId é obrigatório" }, { status: 400 })
  }

  // Check product exists (e pertence à org)
  const produto = await prisma.produto.findUnique({ where: { id: produtoId } })
  if (!produto || !pertenceAOrg(produto, organizacaoId)) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })
  }

  // Check demand exists (e pertence à org)
  const demanda = await prisma.demanda.findUnique({ where: { id: demandaId } })
  if (!demanda || !pertenceAOrg(demanda, organizacaoId)) {
    return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })
  }

  // Check if already linked
  const existing = await prisma.demandaProduto.findUnique({
    where: { demandaId_produtoId: { demandaId, produtoId } },
  })
  if (existing) {
    return NextResponse.json({ error: "Demanda já vinculada a este produto" }, { status: 409 })
  }

  // Create link
  const link = await prisma.demandaProduto.create({
    data: { demandaId, produtoId },
  })

  // Update product denormalized fields
  const count = await prisma.demandaProduto.count({ where: { produtoId } })
  const latestLink = await prisma.demandaProduto.findFirst({
    where: { produtoId },
    orderBy: { createdAt: "desc" },
  })

  await prisma.produto.update({
    where: { id: produtoId },
    data: {
      totalConteudos: count,
      ultimoConteudo: latestLink?.createdAt ?? null,
    },
  })

  return NextResponse.json(link, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id: produtoId } = await params
  const { searchParams } = req.nextUrl
  const demandaId = searchParams.get("demandaId")

  if (!demandaId) {
    return NextResponse.json({ error: "demandaId é obrigatório" }, { status: 400 })
  }

  // Produto precisa pertencer à org da sessão
  const produto = await prisma.produto.findUnique({ where: { id: produtoId }, select: { organizacaoId: true } })
  if (!produto || !pertenceAOrg(produto, organizacaoId)) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })
  }

  const existing = await prisma.demandaProduto.findUnique({
    where: { demandaId_produtoId: { demandaId, produtoId } },
  })
  if (!existing) {
    return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 })
  }

  await prisma.demandaProduto.delete({
    where: { demandaId_produtoId: { demandaId, produtoId } },
  })

  // Recalculate
  const count = await prisma.demandaProduto.count({ where: { produtoId } })
  const latestLink = await prisma.demandaProduto.findFirst({
    where: { produtoId },
    orderBy: { createdAt: "desc" },
  })

  await prisma.produto.update({
    where: { id: produtoId },
    data: {
      totalConteudos: count,
      ultimoConteudo: latestLink?.createdAt ?? null,
    },
  })

  return NextResponse.json({ ok: true })
}
