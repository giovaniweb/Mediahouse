import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/org"
import type { TipoUsuario } from "@prisma/client"

// Gera um slug seguro a partir do nome (a-z0-9-, sem acentos).
function gerarSlug(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 40)
}

// GET /api/admin/organizacoes — lista organizações (super-admin)
export async function GET() {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const orgs = await prisma.organizacao.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, nome: true, slug: true, logoUrl: true, ativo: true, createdAt: true,
      _count: { select: { membros: true } },
    },
  })
  return NextResponse.json({ organizacoes: orgs })
}

// POST /api/admin/organizacoes — cria organização (super-admin)
// body: { nome, slug? }
export async function POST(req: NextRequest) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const body = await req.json().catch(() => ({}))
  const nome = (body.nome as string | undefined)?.trim()
  if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  let slug = (body.slug as string | undefined)?.trim() || gerarSlug(nome)
  if (!slug) return NextResponse.json({ error: "Slug inválido" }, { status: 400 })

  // Garante unicidade do slug (sufixo incremental se necessário)
  const base = slug
  for (let i = 2; await prisma.organizacao.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = `${base}-${i}`
  }

  const org = await prisma.organizacao.create({
    data: { nome, slug, ativo: true },
    select: { id: true, nome: true, slug: true, ativo: true, createdAt: true },
  })

  // Vincula opcionalmente um usuário inicial como admin da nova org.
  // body.adminUsuarioId (id) OU body.adminEmail (email existente).
  const adminUsuarioId = body.adminUsuarioId as string | undefined
  const adminEmail = body.adminEmail as string | undefined
  let membership: { usuarioId: string; papel: TipoUsuario } | null = null
  if (adminUsuarioId || adminEmail) {
    const usuario = adminUsuarioId
      ? await prisma.usuario.findUnique({ where: { id: adminUsuarioId }, select: { id: true } })
      : await prisma.usuario.findUnique({ where: { email: adminEmail! }, select: { id: true } })
    if (usuario) {
      await prisma.usuarioOrganizacao.upsert({
        where: { usuarioId_organizacaoId: { usuarioId: usuario.id, organizacaoId: org.id } },
        update: { papel: "admin" },
        create: { usuarioId: usuario.id, organizacaoId: org.id, papel: "admin" },
      })
      membership = { usuarioId: usuario.id, papel: "admin" }
    }
  }

  return NextResponse.json({ organizacao: org, membership }, { status: 201 })
}
