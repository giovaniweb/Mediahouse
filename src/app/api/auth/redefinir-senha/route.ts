import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

// GET /api/auth/redefinir-senha?token=xxx — valida se token é válido
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")

  if (!token) {
    return NextResponse.json({ valido: false, error: "Token não informado" })
  }

  const registro = await prisma.passwordResetToken.findUnique({
    where: { token },
  })

  if (!registro) {
    return NextResponse.json({ valido: false, error: "Token inválido" })
  }

  if (registro.usedAt) {
    return NextResponse.json({ valido: false, error: "Este link já foi utilizado" })
  }

  if (registro.expiresAt < new Date()) {
    return NextResponse.json({ valido: false, error: "Este link expirou. Solicite um novo." })
  }

  return NextResponse.json({ valido: true })
}

// POST /api/auth/redefinir-senha — efetua a troca de senha
export async function POST(req: NextRequest) {
  try {
    const { token, novaSenha } = await req.json()

    if (!token || !novaSenha) {
      return NextResponse.json({ error: "Token e nova senha são obrigatórios" }, { status: 400 })
    }

    if (novaSenha.length < 8) {
      return NextResponse.json({ error: "A senha deve ter no mínimo 8 caracteres" }, { status: 400 })
    }

    const registro = await prisma.passwordResetToken.findUnique({
      where: { token },
    })

    if (!registro) {
      return NextResponse.json({ error: "Link inválido" }, { status: 400 })
    }

    if (registro.usedAt) {
      return NextResponse.json({ error: "Este link já foi utilizado" }, { status: 400 })
    }

    if (registro.expiresAt < new Date()) {
      return NextResponse.json({ error: "Este link expirou. Solicite um novo." }, { status: 400 })
    }

    // Atualiza a senha
    const senhaHash = await bcrypt.hash(novaSenha, 12)

    await prisma.$transaction([
      prisma.usuario.update({
        where: { email: registro.email },
        data: { senhaHash },
      }),
      prisma.passwordResetToken.update({
        where: { token },
        data: { usedAt: new Date() },
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Erro redefinir-senha:", err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
