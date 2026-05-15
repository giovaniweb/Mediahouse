import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

async function requireAuth() {
  const session = await auth()
  if (!session?.user) return null
  return session
}

// GET /api/coberturas/[id]/equipe
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const equipe = await prisma.eventoCoberturaEquipe.findMany({
    where: { coberturaId: id },
    include: {
      videomaker: { select: { id: true, nome: true, cidade: true, telefone: true } },
      _count: { select: { uploads: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({ equipe })
}

// POST /api/coberturas/[id]/equipe — adicionar membro
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  try {
    const body = await req.json()
    const { videomakerId, nome, funcao, diariasTotal, valorDiaria } = body

    if (!nome && !videomakerId) {
      return NextResponse.json({ error: "nome ou videomakerId é obrigatório" }, { status: 400 })
    }

    // Buscar nome do videomaker se fornecido
    let membroNome = nome
    if (videomakerId && !nome) {
      const vm = await prisma.videomaker.findUnique({
        where: { id: videomakerId },
        select: { nome: true },
      })
      membroNome = vm?.nome ?? "Videomaker"
    }

    const membro = await prisma.eventoCoberturaEquipe.create({
      data: {
        coberturaId: id,
        videomakerId: videomakerId || null,
        nome: membroNome.trim(),
        funcao: funcao ?? "captacao",
        diariasTotal: diariasTotal ?? 0,
        valorDiaria: valorDiaria ?? null,
      },
      include: {
        videomaker: { select: { id: true, nome: true } },
      },
    })

    return NextResponse.json({ membro }, { status: 201 })
  } catch (e) {
    console.error("[Equipe] Erro ao adicionar:", e)
    return NextResponse.json({ error: "Erro ao adicionar membro" }, { status: 500 })
  }
}

// DELETE /api/coberturas/[id]/equipe?membroId=X
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const membroId = req.nextUrl.searchParams.get("membroId")

  if (!membroId) return NextResponse.json({ error: "membroId obrigatório" }, { status: 400 })

  try {
    const count = await prisma.eventoCoberturaUpload.count({
      where: { coberturaId: id, membroId },
    })
    if (count > 0) {
      return NextResponse.json(
        { error: `Membro tem ${count} uploads. Remova os uploads antes.` },
        { status: 409 }
      )
    }
    await prisma.eventoCoberturaEquipe.delete({ where: { id: membroId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[Equipe] Erro ao remover:", e)
    return NextResponse.json({ error: "Erro ao remover membro" }, { status: 500 })
  }
}
