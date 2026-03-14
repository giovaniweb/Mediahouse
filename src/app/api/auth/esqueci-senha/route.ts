import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendEmailResetSenha } from "@/lib/email"
import crypto from "crypto"

// POST /api/auth/esqueci-senha
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email obrigatório" }, { status: 400 })
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, nome: true, email: true, status: true },
    })

    if (!usuario || usuario.status === "inativo") {
      return NextResponse.json({ ok: true })
    }

    // Invalida tokens anteriores
    await prisma.passwordResetToken.deleteMany({ where: { email: usuario.email } })

    const token = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    await prisma.passwordResetToken.create({
      data: { email: usuario.email, token, expiresAt },
    })

    const resultado = await sendEmailResetSenha(usuario.email, usuario.nome, token)

    if (resultado.ok) {
      return NextResponse.json({ ok: true, enviado: true })
    }

    // E-mail falhou — retorna erro descritivo
    return NextResponse.json({ ok: false, error: resultado.error ?? "Falha ao enviar e-mail" }, { status: 500 })
  } catch (err) {
    console.error("Erro esqueci-senha:", err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
