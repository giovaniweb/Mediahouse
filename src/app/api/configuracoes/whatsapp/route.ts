import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const config = await prisma.configWhatsapp.findFirst()
  // Mascara a apiKey ao retornar
  if (config) {
    return NextResponse.json({
      config: {
        ...config,
        apiKey: config.apiKey ? "••••••" + config.apiKey.slice(-4) : "",
      },
    })
  }
  return NextResponse.json({ config: null })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const body = await req.json()
  const { instanceUrl, apiKey, instanceId } = body

  if (!instanceUrl || !instanceId) {
    return NextResponse.json({ error: "instanceUrl e instanceId são obrigatórios" }, { status: 400 })
  }

  const existing = await prisma.configWhatsapp.findFirst()

  const data = {
    instanceUrl,
    instanceId,
    ativo: true,
    ...(apiKey && !apiKey.startsWith("••••") && { apiKey }),
  }

  if (existing) {
    const updated = await prisma.configWhatsapp.update({ where: { id: existing.id }, data })
    return NextResponse.json({ config: updated })
  } else {
    if (!apiKey) return NextResponse.json({ error: "apiKey obrigatória" }, { status: 400 })
    const created = await prisma.configWhatsapp.create({ data: { instanceUrl, apiKey, instanceId, ativo: true } })
    return NextResponse.json({ config: created })
  }
}
