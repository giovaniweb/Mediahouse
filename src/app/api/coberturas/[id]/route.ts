import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

async function requireAuth() {
  const session = await auth()
  if (!session?.user) return null
  return session
}

// GET /api/coberturas/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const cobertura = await prisma.eventoCobertura.findUnique({
    where: { id },
    include: {
      produto: { select: { id: true, nome: true } },
      equipe: {
        include: {
          videomaker: { select: { id: true, nome: true, cidade: true } },
          _count: { select: { uploads: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      checklist: { orderBy: [{ dia: "asc" }, { categoria: "asc" }] },
      uploads: {
        orderBy: [{ dia: "asc" }, { createdAt: "desc" }],
        include: {
          membro: { select: { id: true, nome: true } },
        },
      },
      album: { orderBy: { createdAt: "asc" } },
      log: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  })

  if (!cobertura) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })

  return NextResponse.json({ cobertura })
}

// PUT /api/coberturas/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  try {
    const body = await req.json()
    const {
      titulo, tipo, status, descricao, cliente, local, cidade,
      dataInicio, dataFim, totalDias, diasAtivos,
      linkDrive, linkDownloadPublico, senhaDownload, produtoId,
    } = body

    const cobertura = await prisma.eventoCobertura.update({
      where: { id },
      data: {
        ...(titulo !== undefined && { titulo: titulo.trim() }),
        ...(tipo !== undefined && { tipo }),
        ...(status !== undefined && { status }),
        ...(descricao !== undefined && { descricao: descricao?.trim() || null }),
        ...(cliente !== undefined && { cliente: cliente?.trim() || null }),
        ...(local !== undefined && { local: local?.trim() || null }),
        ...(cidade !== undefined && { cidade: cidade?.trim() || null }),
        ...(dataInicio !== undefined && { dataInicio: new Date(dataInicio) }),
        ...(dataFim !== undefined && { dataFim: new Date(dataFim) }),
        ...(totalDias !== undefined && { totalDias }),
        ...(diasAtivos !== undefined && { diasAtivos }),
        ...(linkDrive !== undefined && { linkDrive: linkDrive?.trim() || null }),
        ...(linkDownloadPublico !== undefined && { linkDownloadPublico }),
        ...(senhaDownload !== undefined && { senhaDownload: senhaDownload?.trim() || null }),
        ...(produtoId !== undefined && { produtoId: produtoId || null }),
      },
    })

    await prisma.eventoCoberturaLog
      .create({
        data: {
          coberturaId: id,
          usuarioId: session.user.id,
          acao: "atualizacao",
          detalhe: `Evento atualizado`,
        },
      })
      .catch(() => null)

    return NextResponse.json({ cobertura })
  } catch (e) {
    console.error("[Coberturas] Erro ao atualizar:", e)
    return NextResponse.json({ error: "Erro ao atualizar cobertura" }, { status: 500 })
  }
}

// DELETE /api/coberturas/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  try {
    const count = await prisma.eventoCoberturaUpload.count({ where: { coberturaId: id } })
    if (count > 0) {
      // Soft delete — cancelar em vez de apagar
      await prisma.eventoCobertura.update({ where: { id }, data: { status: "cancelado" } })
      return NextResponse.json({ ok: true, softDelete: true })
    }
    await prisma.eventoCobertura.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[Coberturas] Erro ao deletar:", e)
    return NextResponse.json({ error: "Erro ao deletar cobertura" }, { status: 500 })
  }
}
