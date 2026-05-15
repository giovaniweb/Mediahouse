import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return null
  if (!["admin", "gestor"].includes(session.user.tipo)) return null
  return session
}

// GET /api/admin/depoimentos — lista todos (ativos + inativos)
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const depoimentos = await prisma.depoimento.findMany({
    orderBy: { ordem: "asc" },
  })
  return NextResponse.json({ depoimentos })
}

// POST /api/admin/depoimentos — criar novo
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  try {
    const body = await req.json()
    const { nome, cidade, videoUrl, thumbnailUrl, descricao, ordem } = body

    if (!nome || !videoUrl) {
      return NextResponse.json({ error: "Nome e videoUrl são obrigatórios" }, { status: 400 })
    }

    // Ordem: por padrão, colocar no final
    let novaOrdem = ordem ?? 0
    if (novaOrdem === 0) {
      const ultimo = await prisma.depoimento.findFirst({ orderBy: { ordem: "desc" } })
      novaOrdem = (ultimo?.ordem ?? 0) + 1
    }

    const depoimento = await prisma.depoimento.create({
      data: {
        nome: nome.trim(),
        cidade: cidade?.trim() || null,
        videoUrl: videoUrl.trim(),
        thumbnailUrl: thumbnailUrl?.trim() || null,
        descricao: descricao?.trim() || null,
        ordem: novaOrdem,
        ativo: true,
      },
    })
    return NextResponse.json({ depoimento }, { status: 201 })
  } catch (e) {
    console.error("[Depoimentos] Erro ao criar:", e)
    return NextResponse.json({ error: "Erro ao criar depoimento" }, { status: 500 })
  }
}
