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
      editor: { select: { id: true, nome: true } },
      usuario: { select: { id: true, nome: true } },
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
    const { token, videomakerId, nome, funcao, diariasTotal, valorDiaria } = body

    // Resolver token unificado (vm:/ed:/user:) → FK direta (sem espelho em eventos)
    let vmId: string | null = videomakerId || null
    let edId: string | null = null
    let usId: string | null = null
    let membroNome: string = nome ?? ""

    if (typeof token === "string" && token.includes(":")) {
      const idx = token.indexOf(":")
      const prefix = token.slice(0, idx)
      const refId = token.slice(idx + 1)
      if (prefix === "ed") {
        edId = refId
        if (!membroNome) {
          const ed = await prisma.editor.findUnique({ where: { id: refId }, select: { nome: true } })
          membroNome = ed?.nome ?? "Editor"
        }
      } else if (prefix === "user") {
        usId = refId
        if (!membroNome) {
          const u = await prisma.usuario.findUnique({ where: { id: refId }, select: { nome: true } })
          membroNome = u?.nome ?? "Membro"
        }
      } else {
        vmId = refId
      }
    }

    if (!membroNome && !vmId) {
      return NextResponse.json({ error: "nome, token ou videomakerId é obrigatório" }, { status: 400 })
    }

    // Buscar nome do videomaker se fornecido sem nome
    if (vmId && !membroNome) {
      const vm = await prisma.videomaker.findUnique({
        where: { id: vmId },
        select: { nome: true },
      })
      membroNome = vm?.nome ?? "Videomaker"
    }

    const membro = await prisma.eventoCoberturaEquipe.create({
      data: {
        coberturaId: id,
        videomakerId: vmId,
        editorId: edId,
        usuarioId: usId,
        nome: membroNome.trim(),
        funcao: funcao ?? "captacao",
        diariasTotal: diariasTotal ?? 0,
        valorDiaria: valorDiaria ?? null,
      },
      include: {
        videomaker: { select: { id: true, nome: true } },
        editor: { select: { id: true, nome: true } },
        usuario: { select: { id: true, nome: true } },
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
