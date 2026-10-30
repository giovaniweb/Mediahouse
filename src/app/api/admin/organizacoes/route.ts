import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
// Painel de Super Admin: lista TODAS as empresas, por definição. Atravessa o
// isolamento pela conexão de dono, atrás de `requireSuperAdmin`.
// Ver src/lib/prisma-admin.ts.
import { prismaAdmin as prisma } from "@/lib/prisma-admin"
import { requireSuperAdmin } from "@/lib/org"
import { SLUG_PUBLICO, SUBDOMINIOS_RESERVADOS } from "@/lib/subdominio"
import { usuarioPorEmail } from "@/lib/criar-usuario"
import type { TipoUsuario } from "@prisma/client"

// Gera um slug seguro (a-z0-9-, sem acentos) a partir do nome ou do slug
// digitado. O digitado também passa por aqui: até 30/10/2026 ele era gravado
// como veio, e uma empresa ganhou slug com espaço e acento — o link /c/ dela
// nunca abriu.
function gerarSlug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 40)
    .replace(/^-+|-+$/g, "")
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

  let slug = gerarSlug((body.slug as string | undefined)?.trim() || nome)
  if (!SLUG_PUBLICO.test(slug)) return NextResponse.json({ error: "Slug inválido: use letras, números e hífen." }, { status: 400 })

  // Garante unicidade do slug (sufixo incremental se necessário). Endereço
  // reservado do NuFlow (www, api, teste…) conta como ocupado.
  const base = slug
  for (let i = 2; SUBDOMINIOS_RESERVADOS.has(slug) || await prisma.organizacao.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = `${base}-${i}`
  }

  const org = await prisma.organizacao.create({
    data: { nome, slug, ativo: true },
    select: { id: true, nome: true, slug: true, ativo: true, createdAt: true },
  })

  // Vincula opcionalmente um usuário inicial como admin da nova org.
  // body.adminUsuarioId (escolhido na busca) OU body.adminEmail (e-mail existente).
  const adminUsuarioId = body.adminUsuarioId as string | undefined
  const adminEmail = (body.adminEmail as string | undefined)?.trim()
  let membership: { usuarioId: string; papel: TipoUsuario } | null = null
  if (adminUsuarioId || adminEmail) {
    const usuario = adminUsuarioId
      ? await prisma.usuario.findUnique({ where: { id: adminUsuarioId }, select: { id: true } })
      : await usuarioPorEmail(adminEmail!)
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
