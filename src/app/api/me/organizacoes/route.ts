import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, COOKIE_ORG_ATIVA } from "@/lib/org"

// GET /api/me/organizacoes — empresas em que a pessoa é membro, e qual está ativa.
//
// `/api/me` está na lista de rotas públicas do middleware, então a autenticação
// é feita aqui dentro: sem sessão, 401.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const usuarioId = (session.user as { id?: string }).id
  if (!usuarioId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const vinculos = await prisma.usuarioOrganizacao.findMany({
    where: { usuarioId, organizacao: { ativo: true } },
    select: {
      papel: true,
      organizacao: { select: { id: true, nome: true, slug: true, logoUrl: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  const ativa = await getOrgId(session)

  return NextResponse.json({
    ativa,
    organizacoes: vinculos.map((v) => ({ ...v.organizacao, papel: v.papel, ativa: v.organizacao.id === ativa })),
  })
}

// POST /api/me/organizacoes — troca a empresa ativa.
//
// O corpo é só um pedido: a membership é conferida no banco antes de gravar o
// cookie, e o `getOrgId` confere DE NOVO a cada requisição. Cookie forjado ou
// membership revogada não dão acesso a nada.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const usuarioId = (session.user as { id?: string }).id
  if (!usuarioId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { organizacaoId } = await req.json().catch(() => ({ organizacaoId: null }))
  if (typeof organizacaoId !== "string" || !organizacaoId) {
    return NextResponse.json({ error: "organizacaoId obrigatório" }, { status: 400 })
  }

  const vinculo = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
    select: { papel: true, organizacao: { select: { id: true, nome: true, slug: true, ativo: true } } },
  })
  if (!vinculo || !vinculo.organizacao.ativo) {
    // 404 e não 403: não confirma para quem tenta que a empresa existe.
    return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 })
  }

  const res = NextResponse.json({ ok: true, organizacao: { ...vinculo.organizacao, papel: vinculo.papel } })
  res.cookies.set(COOKIE_ORG_ATIVA, organizacaoId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
