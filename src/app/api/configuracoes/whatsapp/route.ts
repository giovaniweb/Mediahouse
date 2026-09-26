import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function apresentacao(config: {
  id: string; instanceUrl: string; instanceId: string; instanceName: string | null;
  ativo: boolean; apiKey: string; telefoneConectado: string | null;
  pushName: string | null; connectedAt: Date | null; lastStatus: string | null;
}) {
  return {
    id: config.id, instanceUrl: config.instanceUrl, instanceId: config.instanceId,
    instanceName: config.instanceName, ativo: config.ativo,
    apiKey: config.apiKey ? "••••••" : "",
    telefoneConectado: config.telefoneConectado, pushName: config.pushName,
    connectedAt: config.connectedAt, lastStatus: config.lastStatus,
  }
}

export async function GET() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const { organizacaoId } = acesso

  const config = await prisma.configWhatsapp.findFirst({ where: { organizacaoId } })
  return NextResponse.json({ config: config ? apresentacao(config) : null })
}

export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso

  const { organizacaoId } = acesso

  const body = await req.json()
  const { instanceUrl, apiKey, instanceId } = body

  if (!instanceUrl || !instanceId) {
    return NextResponse.json({ error: "instanceUrl e instanceId são obrigatórios" }, { status: 400 })
  }

  const existing = await prisma.configWhatsapp.findFirst({ where: { organizacaoId } })

  const data = {
    instanceUrl,
    instanceId,
    ativo: true,
    ...(apiKey && !apiKey.startsWith("••••") && { apiKey }),
  }

  if (existing) {
    const updated = await prisma.configWhatsapp.update({ where: { id: existing.id }, data })
    return NextResponse.json({ config: apresentacao(updated) })
  } else {
    if (!apiKey) return NextResponse.json({ error: "apiKey obrigatória" }, { status: 400 })
    const created = await prisma.configWhatsapp.create({ data: { organizacaoId, instanceUrl, apiKey, instanceId, ativo: true } })
    return NextResponse.json({ config: apresentacao(created) })
  }
}
