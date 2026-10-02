import { NextRequest, NextResponse } from "next/server"
// Recuperação de senha é caminho de autenticação: acontece sem sessão e sem
// empresa. Ver src/lib/prisma-auth.ts.
import { prismaAuth as prisma } from "@/lib/prisma-auth"
import { checarRateLimit, ipDaRequisicao } from "@/lib/rate-limit"
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
    const limite = checarRateLimit(`redefinir-senha:${ipDaRequisicao(req.headers)}`, 10, 15 * 60 * 1000)
    if (!limite.ok) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
        { status: 429, headers: { "Retry-After": String(limite.retryAfterSegundos) } }
      )
    }

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

    // O role de autenticação não pode atualizar usuarios diretamente. A função
    // confere expiração/uso de novo, bloqueia o token e aplica a troca atomicamente.
    const [resultado] = await prisma.$queryRaw<{ trocou: boolean }[]>`
      SELECT public.redefinir_senha_por_token(${token}, ${senhaHash}) AS trocou
    `
    if (!resultado?.trocou) {
      return NextResponse.json({ error: "Link inválido, expirado ou já utilizado" }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Erro redefinir-senha:", err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
