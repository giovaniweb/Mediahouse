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

    if (!usuario) {
      return NextResponse.json(
        { ok: false, error: "E-mail não encontrado. Verifique se digitou corretamente." },
        { status: 404 }
      )
    }

    if (usuario.status === "inativo") {
      return NextResponse.json(
        { ok: false, error: "Esta conta está inativa. Entre em contato com o administrador." },
        { status: 403 }
      )
    }

    // Usuário sem email não pode redefinir senha por este método
    if (!usuario.email) {
      return NextResponse.json({ ok: false, error: "Usuário sem e-mail cadastrado. Entre em contato com o administrador." }, { status: 400 })
    }

    // Invalida tokens anteriores
    await prisma.passwordResetToken.deleteMany({ where: { email: usuario.email } })

    const token = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    await prisma.passwordResetToken.create({
      data: { email: usuario.email, token, expiresAt },
    })

    // Resolve a organização do usuário de forma determinística (primeira membership)
    // para usar a config de e-mail correta — sem cair em config global aleatória.
    const membership = await prisma.usuarioOrganizacao.findFirst({
      where: { usuarioId: usuario.id },
      orderBy: { createdAt: "asc" },
      select: { organizacaoId: true },
    })

    const resultado = await sendEmailResetSenha(usuario.email, usuario.nome, token, membership?.organizacaoId ?? null)

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
