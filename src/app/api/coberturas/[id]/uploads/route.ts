import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

async function requireAuth() {
  const session = await auth()
  if (!session?.user) return null
  return session
}

// GET /api/coberturas/[id]/uploads?dia=1&membroId=X&tipo=video
export async function GET(req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const sp = req.nextUrl.searchParams
  const dia = sp.get("dia")
  const membroId = sp.get("membroId")
  const tipo = sp.get("tipo")

  const where: Record<string, unknown> = { coberturaId: id }
  if (dia) where.dia = parseInt(dia)
  if (membroId) where.membroId = membroId
  if (tipo) where.tipo = tipo

  const uploads = await prisma.eventoCoberturaUpload.findMany({
    where,
    include: {
      membro: { select: { id: true, nome: true, funcao: true } },
    },
    orderBy: [{ dia: "asc" }, { createdAt: "desc" }],
  })

  return NextResponse.json({ uploads })
}

// POST /api/coberturas/[id]/uploads — registrar upload após browser fazer PUT no Supabase
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  try {
    const body = await req.json()
    const { url, thumbnailUrl, dia, membroId, tipo, momento, titulo, duracao, tamanhoBytes } = body

    if (!url || !dia) {
      return NextResponse.json({ error: "url e dia são obrigatórios" }, { status: 400 })
    }

    const upload = await prisma.eventoCoberturaUpload.create({
      data: {
        coberturaId: id,
        url,
        thumbnailUrl: thumbnailUrl || null,
        dia: parseInt(dia),
        membroId: membroId || null,
        tipo: tipo ?? "video",
        momento: momento ?? "outro",
        titulo: titulo?.trim() || null,
        duracao: duracao ? parseInt(duracao) : null,
        tamanhoBytes: tamanhoBytes ? BigInt(tamanhoBytes) : null,
      },
      include: {
        membro: { select: { id: true, nome: true } },
      },
    })

    // Log
    await prisma.eventoCoberturaLog
      .create({
        data: {
          coberturaId: id,
          usuarioId: session.user.id,
          acao: "upload",
          detalhe: `Upload dia ${dia}: ${titulo ?? url.split("/").pop()}`,
        },
      })
      .catch(() => null)

    return NextResponse.json({ upload }, { status: 201 })
  } catch (e) {
    console.error("[Uploads] Erro ao registrar:", e)
    return NextResponse.json({ error: "Erro ao registrar upload" }, { status: 500 })
  }
}

// DELETE /api/coberturas/[id]/uploads?uploadId=X
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id: coberturaId } = await params
  const uploadId = req.nextUrl.searchParams.get("uploadId")

  if (!uploadId) return NextResponse.json({ error: "uploadId obrigatório" }, { status: 400 })

  try {
    await prisma.eventoCoberturaUpload.delete({ where: { id: uploadId, coberturaId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[Uploads] Erro ao deletar:", e)
    return NextResponse.json({ error: "Erro ao deletar upload" }, { status: 500 })
  }
}
