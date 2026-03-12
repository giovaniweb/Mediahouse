import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

// POST /api/usuarios/me/senha — altera senha do usuário logado
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const { senhaAtual, novaSenha } = body

  if (!senhaAtual || !novaSenha) {
    return NextResponse.json({ error: "Informe a senha atual e a nova senha" }, { status: 400 })
  }
  if (novaSenha.length < 6) {
    return NextResponse.json({ error: "Nova senha deve ter ao menos 6 caracteres" }, { status: 400 })
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.user.id },
    select: { senhaHash: true },
  })

  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  const valida = await bcrypt.compare(senhaAtual, usuario.senhaHash)
  if (!valida) {
    return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 })
  }

  const novoHash = await bcrypt.hash(novaSenha, 12)

  await prisma.usuario.update({
    where: { id: session.user.id },
    data: { senhaHash: novoHash },
  })

  return NextResponse.json({ ok: true })
}
