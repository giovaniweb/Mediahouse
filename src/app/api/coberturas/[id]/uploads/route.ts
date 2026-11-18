import { NextRequest, NextResponse } from "next/server"
import { recusarUploads } from "@/lib/midia-limite"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireCoberturaOrg } from "@/lib/org"
import { acessoDeCampo } from "@/lib/acesso-cobertura"

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
  const campo = await acessoDeCampo(id)
  if (campo instanceof NextResponse) return campo

  // Sem este guard, trocar o id na URL alcançava cobertura de outra empresa.

  const guard = await requireCoberturaOrg(session, id)

  if (guard instanceof NextResponse) return guard
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
  const campo = await acessoDeCampo(id)
  if (campo instanceof NextResponse) return campo

  // Sem este guard, trocar o id na URL alcançava cobertura de outra empresa.

  const guard = await requireCoberturaOrg(session, id)

  if (guard instanceof NextResponse) return guard

  try {
    const body = await req.json()
    const { url, thumbnailUrl, dia, membroId, tipo, momento, titulo, duracao, tamanhoBytes } = body

    if (!url || !dia) {
      return NextResponse.json({ error: "url e dia são obrigatórios" }, { status: 400 })
    }

    // Quem está escalado sobe em nome da própria linha da equipe, nunca da de outro.
    const membroFinal: string | null = campo.gestao ? (membroId || null) : (campo.membros.includes(membroId) ? membroId : campo.membros[0])

    // Tamanho e tipo conferidos no servidor (lib/midia-limite). Recusado = apagado.
    const recusa = await recusarUploads([url, thumbnailUrl])
    if (recusa) return NextResponse.json({ error: recusa.erro }, { status: recusa.status })

    const upload = await prisma.eventoCoberturaUpload.create({
      data: {
        coberturaId: id,
        url,
        thumbnailUrl: thumbnailUrl || null,
        dia: parseInt(dia),
        membroId: membroFinal,
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
  const campo = await acessoDeCampo(coberturaId)
  if (campo instanceof NextResponse) return campo

  const guard = await requireCoberturaOrg(session, coberturaId)

  if (guard instanceof NextResponse) return guard
  const uploadId = req.nextUrl.searchParams.get("uploadId")

  if (!uploadId) return NextResponse.json({ error: "uploadId obrigatório" }, { status: 400 })

  try {
    // Fora da gestão, só apaga o que a própria pessoa subiu.
    if (!campo.gestao && !(await prisma.eventoCoberturaUpload.findFirst({ where: { id: uploadId, coberturaId, membroId: { in: campo.membros } }, select: { id: true } }))) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }
    await prisma.eventoCoberturaUpload.delete({ where: { id: uploadId, coberturaId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[Uploads] Erro ao deletar:", e)
    return NextResponse.json({ error: "Erro ao deletar upload" }, { status: 500 })
  }
}
