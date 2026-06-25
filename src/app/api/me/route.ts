import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PRESETS } from "@/lib/permissoes"
import { getOrgId } from "@/lib/org"

// GET /api/me — retorna dados do usuário logado + permissões
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      nome: true,
      email: true,
      tipo: true,
      status: true,
      avatarUrl: true,
      permissoes: true,
      organizacoes: {
        where: organizacaoId ? { organizacaoId } : undefined,
        select: {
          organizacaoId: true,
          papel: true,
          categoria: true,
          funcaoProfissional: true,
          areas: true,
        },
        take: 1,
      },
      videomakerRef: { select: { id: true, nome: true, avaliacao: true } },
    },
  })

  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
  const { organizacoes, ...usuarioSemOrganizacoes } = usuario

  // Se não tem permissões, criar com preset
  let permissoes = usuario.permissoes
  if (!permissoes) {
    const preset = PRESETS[usuario.tipo] || PRESETS.solicitante
    permissoes = await prisma.permissaoUsuario.create({
      data: { usuarioId: usuario.id, ...preset },
    })
  }

  return NextResponse.json({
    ...usuarioSemOrganizacoes,
    membership: organizacoes[0] ?? null,
    permissoes,
  })
}
