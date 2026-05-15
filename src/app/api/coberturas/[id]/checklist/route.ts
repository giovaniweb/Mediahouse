import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

async function requireAuth() {
  const session = await auth()
  if (!session?.user) return null
  return session
}

// GET /api/coberturas/[id]/checklist?dia=1
export async function GET(req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const dia = req.nextUrl.searchParams.get("dia")

  const where: Record<string, unknown> = { coberturaId: id }
  if (dia) where.dia = parseInt(dia)

  const itens = await prisma.eventoCoberturaChecklist.findMany({
    where,
    orderBy: [{ dia: "asc" }, { categoria: "asc" }, { createdAt: "asc" }],
  })

  // Calcular % por dia
  const porDia: Record<number, { total: number; concluidos: number }> = {}
  for (const item of itens) {
    if (!porDia[item.dia]) porDia[item.dia] = { total: 0, concluidos: 0 }
    porDia[item.dia].total++
    if (item.concluido) porDia[item.dia].concluidos++
  }

  return NextResponse.json({ itens, porDia })
}

// POST /api/coberturas/[id]/checklist — adicionar item
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  try {
    const body = await req.json()
    const { dia, texto, categoria } = body

    if (!texto || !dia) {
      return NextResponse.json({ error: "dia e texto são obrigatórios" }, { status: 400 })
    }

    const item = await prisma.eventoCoberturaChecklist.create({
      data: {
        coberturaId: id,
        dia: parseInt(dia),
        texto: texto.trim(),
        categoria: categoria ?? "equipamento",
        concluido: false,
      },
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch (e) {
    console.error("[Checklist] Erro ao criar:", e)
    return NextResponse.json({ error: "Erro ao criar item" }, { status: 500 })
  }
}

// PATCH /api/coberturas/[id]/checklist — toggle concluido
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id: coberturaId } = await params

  try {
    const body = await req.json()
    const { itemId, concluido } = body

    if (!itemId || concluido === undefined) {
      return NextResponse.json({ error: "itemId e concluido são obrigatórios" }, { status: 400 })
    }

    const item = await prisma.eventoCoberturaChecklist.update({
      where: { id: itemId, coberturaId },
      data: {
        concluido,
        concluidoEm: concluido ? new Date() : null,
        concluidoPor: concluido ? session.user.id : null,
      },
    })

    return NextResponse.json({ item })
  } catch (e) {
    console.error("[Checklist] Erro ao atualizar:", e)
    return NextResponse.json({ error: "Erro ao atualizar item" }, { status: 500 })
  }
}
