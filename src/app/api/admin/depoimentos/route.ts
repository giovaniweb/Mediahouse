import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

// Depoimentos da vitrine pública — agora com dono.
//
// A tabela nasceu quando havia um cliente só. Sem coluna de empresa, esta tela
// listava (e permitia editar e apagar) o depoimento de qualquer empresa da
// plataforma, e a vitrine de cada uma mostrava o do vizinho. A Fase 2 criou a
// coluna; aqui ela passa a valer.
async function contexto() {
  const session = await auth()
  if (!session?.user || !ehGestor(session)) return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return { erro: semOrg() }
  return { organizacaoId }
}

// GET /api/admin/depoimentos — lista os da empresa (ativos + inativos)
export async function GET() {
  const { erro, organizacaoId } = await contexto()
  if (erro) return erro

  const depoimentos = await prisma.depoimento.findMany({
    where: { organizacaoId },
    orderBy: { ordem: "asc" },
  })
  return NextResponse.json({ depoimentos })
}

// POST /api/admin/depoimentos — criar novo
export async function POST(req: NextRequest) {
  const { erro, organizacaoId } = await contexto()
  if (erro) return erro

  try {
    const body = await req.json()
    const { nome, cidade, videoUrl, thumbnailUrl, descricao, ordem } = body

    if (!nome || !videoUrl) {
      return NextResponse.json({ error: "Nome e videoUrl são obrigatórios" }, { status: 400 })
    }

    // Ordem: por padrão, no final da fila DESTA empresa. Antes o "último" era o
    // último da plataforma inteira, então a numeração de uma empresa pulava
    // conforme a outra cadastrava.
    let novaOrdem = ordem ?? 0
    if (novaOrdem === 0) {
      const ultimo = await prisma.depoimento.findFirst({
        where: { organizacaoId },
        orderBy: { ordem: "desc" },
      })
      novaOrdem = (ultimo?.ordem ?? 0) + 1
    }

    const depoimento = await prisma.depoimento.create({
      data: {
        organizacaoId,
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
