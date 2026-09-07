import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmailTeste, statusEmailGlobal } from "@/lib/email"
import { getOrgId, semOrg } from "@/lib/org"

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function emailsValidos(valores: unknown): string[] | null {
  if (!Array.isArray(valores) || valores.length > 20) return null
  const emails = valores.map((valor) => typeof valor === "string" ? valor.trim().toLowerCase() : "")
  if (emails.some((email) => !EMAIL_VALIDO.test(email))) return null
  return [...new Set(emails)]
}

// GET /api/configuracoes/email
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const config = await prisma.configEmail.findFirst({
    where: { organizacaoId },
    orderBy: { createdAt: "desc" },
    select: { emailsFinanceiro: true },
  })
  const global = statusEmailGlobal()

  // API key e remetente não pertencem mais a uma organização e nunca são lidos
  // do banco. A tela recebe apenas o estado global e os destinatários locais.
  return NextResponse.json({
    config: {
      senderEmail: global.senderEmail,
      senderNome: global.senderNome,
      emailsFinanceiro: config?.emailsFinanceiro ?? [],
      ativo: global.ativo,
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
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body: unknown = await req.json()
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })

  // Testar e-mail
  if ("acao" in body && body.acao === "testar") {
    const destinatario = "destinatario" in body ? body.destinatario : null
    if (typeof destinatario !== "string" || !EMAIL_VALIDO.test(destinatario.trim())) {
      return NextResponse.json({ ok: false, error: "Informe um e-mail válido para teste" }, { status: 400 })
    }
    const resultado = await sendEmailTeste(destinatario)
    return NextResponse.json(resultado)
  }

  // A única preferência por organização é quem recebe os avisos financeiros.
  // Credencial e remetente vêm exclusivamente das variáveis globais da Vercel.
  const emails = "emailsFinanceiro" in body ? emailsValidos(body.emailsFinanceiro) : null
  if (!emails) {
    return NextResponse.json({ error: "Informe até 20 e-mails válidos, separados por vírgula" }, { status: 400 })
  }

  const existing = await prisma.configEmail.findFirst({ where: { organizacaoId } })

  if (existing) {
    await prisma.configEmail.update({ where: { id: existing.id }, data: { emailsFinanceiro: emails } })
  } else {
    await prisma.configEmail.create({
      data: {
        organizacaoId,
        emailsFinanceiro: emails,
      },
    })
  }

  return NextResponse.json({ ok: true, ...statusEmailGlobal() })
}
