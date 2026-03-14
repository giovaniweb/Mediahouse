import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmailTeste } from "@/lib/email"

// GET /api/configuracoes/email
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const config = await prisma.configEmail.findFirst({ orderBy: { createdAt: "desc" } })
  if (!config) return NextResponse.json({ config: null })

  // Nunca retorna a API key completa — mostra apenas os primeiros 8 chars para confirmar que existe
  return NextResponse.json({
    config: {
      apiKeyPreview: config.apiKey ? config.apiKey.slice(0, 8) + "••••••••" : "",
      senderEmail: config.senderEmail,
      senderNome: config.senderNome,
      emailsFinanceiro: config.emailsFinanceiro,
      ativo: config.ativo,
    },
  })
}

// POST /api/configuracoes/email
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const papel = (session.user as { tipo?: string }).tipo
  if (!["admin", "gestor"].includes(papel ?? "")) {
    return NextResponse.json({ error: "Apenas admin ou gestor pode alterar configurações" }, { status: 403 })
  }

  const body = await req.json()

  // Testar e-mail
  if (body.acao === "testar") {
    const resultado = await sendEmailTeste(body.destinatario)
    return NextResponse.json(resultado)
  }

  // Salvar config Resend
  const { apiKey, senderEmail, senderNome, emailsFinanceiro } = body

  const existing = await prisma.configEmail.findFirst()

  const data: Record<string, unknown> = {}
  if (apiKey) data.apiKey = apiKey           // só atualiza se fornecida
  if (senderEmail !== undefined) data.senderEmail = senderEmail
  if (senderNome !== undefined) data.senderNome = senderNome
  if (emailsFinanceiro !== undefined) data.emailsFinanceiro = emailsFinanceiro

  if (existing) {
    const atualizado = { ...existing, ...data }
    data.ativo = !!atualizado.apiKey

    const config = await prisma.configEmail.update({ where: { id: existing.id }, data })
    return NextResponse.json({ ok: true, ativo: config.ativo })
  } else {
    const config = await prisma.configEmail.create({
      data: {
        apiKey: apiKey ?? "",
        senderEmail: senderEmail ?? "onboarding@resend.dev",
        senderNome: senderNome ?? "VideoOps",
        emailsFinanceiro: emailsFinanceiro ?? [],
        ativo: !!apiKey,
      },
    })
    return NextResponse.json({ ok: true, ativo: config.ativo })
  }
}
