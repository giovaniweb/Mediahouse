import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/org"
import type { TipoUsuario } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

const PAPEIS_VALIDOS: TipoUsuario[] = [
  "admin", "gestor", "videomaker", "editor", "designer", "social", "solicitante", "gestor_eventos",
]

// GET /api/admin/organizacoes/[id]/usuarios — lista membros da org (super-admin)
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const org = await prisma.organizacao.findUnique({ where: { id }, select: { id: true } })
  if (!org) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 })

  const membros = await prisma.usuarioOrganizacao.findMany({
    where: { organizacaoId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, papel: true, createdAt: true,
      usuario: { select: { id: true, nome: true, email: true, tipo: true } },
    },
  })
  return NextResponse.json({ membros })
}

// POST /api/admin/organizacoes/[id]/usuarios — adiciona/atualiza membership (super-admin)
// body: { usuarioId? , email?, papel }
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const org = await prisma.organizacao.findUnique({ where: { id }, select: { id: true } })
  if (!org) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const papel = (body.papel as TipoUsuario | undefined) ?? "solicitante"
  if (!PAPEIS_VALIDOS.includes(papel)) {
    return NextResponse.json({ error: `Papel inválido. Use: ${PAPEIS_VALIDOS.join(", ")}` }, { status: 400 })
  }

  const usuario = body.usuarioId
    ? await prisma.usuario.findUnique({ where: { id: body.usuarioId as string }, select: { id: true } })
    : body.email
      ? await prisma.usuario.findUnique({ where: { email: body.email as string }, select: { id: true } })
      : null
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado (informe usuarioId ou email)" }, { status: 404 })

  const membership = await prisma.usuarioOrganizacao.upsert({
    where: { usuarioId_organizacaoId: { usuarioId: usuario.id, organizacaoId: id } },
    update: { papel },
    create: { usuarioId: usuario.id, organizacaoId: id, papel },
    select: { id: true, usuarioId: true, organizacaoId: true, papel: true },
  })
  return NextResponse.json({ membership }, { status: 201 })
}

// DELETE /api/admin/organizacoes/[id]/usuarios?usuarioId=... — remove membership (super-admin)
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const usuarioId = req.nextUrl.searchParams.get("usuarioId")
  if (!usuarioId) return NextResponse.json({ error: "usuarioId obrigatório" }, { status: 400 })

  const r = await prisma.usuarioOrganizacao.deleteMany({ where: { organizacaoId: id, usuarioId } })
  if (r.count === 0) return NextResponse.json({ error: "Membership não encontrada" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
