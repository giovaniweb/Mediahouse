import { NextRequest, NextResponse } from "next/server"
// Recuperação de senha é caminho de autenticação: acontece sem sessão e sem
// empresa. Ver src/lib/prisma-auth.ts.
import { prismaAuth as prisma } from "@/lib/prisma-auth"
import { sendEmailResetSenha } from "@/lib/email"
import { consumirLimiteLogin } from "@/lib/limite-login"
import crypto from "crypto"

// POST /api/auth/esqueci-senha
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json().catch(() => ({}))

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email obrigatório" }, { status: 400 })
    }

    // Cada pedido manda um e-mail: limite no banco por conta e por IP.
    const limite = await consumirLimiteLogin("esqueci", req.headers, email)
    if (limite !== "ok") {
      return limite === "bloqueado"
        ? NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." }, { status: 429, headers: { "Retry-After": "900" } })
        : NextResponse.json({ error: "Não foi possível enviar agora. Tente de novo em alguns minutos." }, { status: 503 })
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, nome: true, email: true, status: true },
    })

    // Conta que não existe, inativa ou sem e-mail recebe a MESMA resposta de
    // quem recebeu o link. Antes a resposta dizia "e-mail não encontrado", e
    // isso servia para descobrir quem tem conta antes de tentar a senha.
    if (!usuario || usuario.status === "inativo" || !usuario.email) {
      return NextResponse.json({ ok: true, enviado: true })
    }

    // Invalida tokens anteriores marcando-os como usados. Apagar não serve: o
    // role de autenticação tem SELECT/INSERT/UPDATE nesta tabela e nada de
    // DELETE, e sob RLS o pedido inteiro caía em 500. O efeito é o mesmo — a
    // troca de senha recusa token com `usedAt` — e o histórico fica.
    await prisma.passwordResetToken.updateMany({
      where: { email: usuario.email, usedAt: null },
      data: { usedAt: new Date() },
    })

    const token = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    await prisma.passwordResetToken.create({
      data: { email: usuario.email, token, expiresAt },
    })

    // Recuperação de senha é um fluxo global de autenticação. O remetente vem
    // somente das variáveis globais, portanto não depende de uma organização.
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
