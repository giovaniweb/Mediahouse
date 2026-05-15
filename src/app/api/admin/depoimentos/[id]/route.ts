import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return null
  if (!["admin", "gestor"].includes(session.user.tipo)) return null
  return session
}

// PUT /api/admin/depoimentos/[id] — atualizar
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  try {
    const body = await req.json()
    const { nome, cidade, videoUrl, thumbnailUrl, descricao, ativo, ordem } = body

    const depoimento = await prisma.depoimento.update({
      where: { id },
      data: {
        ...(nome !== undefined && { nome: nome.trim() }),
        ...(cidade !== undefined && { cidade: cidade?.trim() || null }),
        ...(videoUrl !== undefined && { videoUrl: videoUrl.trim() }),
        ...(thumbnailUrl !== undefined && { thumbnailUrl: thumbnailUrl?.trim() || null }),
        ...(descricao !== undefined && { descricao: descricao?.trim() || null }),
        ...(ativo !== undefined && { ativo }),
        ...(ordem !== undefined && { ordem }),
      },
    })
    return NextResponse.json({ depoimento })
  } catch (e) {
    console.error("[Depoimentos] Erro ao atualizar:", e)
    return NextResponse.json({ error: "Erro ao atualizar depoimento" }, { status: 500 })
  }
}

// DELETE /api/admin/depoimentos/[id] — deletar permanentemente
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  try {
    await prisma.depoimento.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[Depoimentos] Erro ao deletar:", e)
    return NextResponse.json({ error: "Erro ao deletar depoimento" }, { status: 500 })
  }
}
