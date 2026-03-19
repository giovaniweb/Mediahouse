import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PRESETS } from "@/lib/permissoes"

// GET /api/me — retorna dados do usuário logado + permissões
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

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
      videomakerRef: { select: { id: true, nome: true, avaliacao: true } },
    },
  })

  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  // Se não tem permissões, criar com preset
  let permissoes = usuario.permissoes
  if (!permissoes) {
    const preset = PRESETS[usuario.tipo] || PRESETS.solicitante
    permissoes = await prisma.permissaoUsuario.create({
      data: { usuarioId: usuario.id, ...preset },
    })
  }

  return NextResponse.json({
    ...usuario,
    permissoes,
  })
}
