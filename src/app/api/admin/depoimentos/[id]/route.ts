import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

async function contexto() {
  const session = await auth()
  if (!session?.user || !ehGestor(session)) return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return { erro: semOrg() }
  return { organizacaoId }
}

// PUT /api/admin/depoimentos/[id] — atualizar
//
// `updateMany` com a empresa no where, e não `update` por id: o id sozinho
// alterava o depoimento de qualquer empresa. Quem tivesse o id — que aparece na
// própria listagem — reescrevia a vitrine do vizinho.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { erro, organizacaoId } = await contexto()
  if (erro) return erro

  const { id } = await params
  try {
    const body = await req.json()
    const { nome, cidade, videoUrl, thumbnailUrl, descricao, ativo, ordem } = body

    const { count } = await prisma.depoimento.updateMany({
      where: { id, organizacaoId },
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
    if (count === 0) return NextResponse.json({ error: "Depoimento não encontrado" }, { status: 404 })

    const depoimento = await prisma.depoimento.findFirst({ where: { id, organizacaoId } })
    return NextResponse.json({ depoimento })
  } catch (e) {
    console.error("[Depoimentos] Erro ao atualizar:", e)
    return NextResponse.json({ error: "Erro ao atualizar depoimento" }, { status: 500 })
  }
}

// DELETE /api/admin/depoimentos/[id] — deletar permanentemente
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { erro, organizacaoId } = await contexto()
  if (erro) return erro

  const { id } = await params
  try {
    const { count } = await prisma.depoimento.deleteMany({ where: { id, organizacaoId } })
    if (count === 0) return NextResponse.json({ error: "Depoimento não encontrado" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[Depoimentos] Erro ao deletar:", e)
    return NextResponse.json({ error: "Erro ao deletar depoimento" }, { status: 500 })
  }
}
