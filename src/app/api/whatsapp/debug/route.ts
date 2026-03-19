import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getWhatsappConfig } from "@/lib/whatsapp"

// GET /api/whatsapp/debug — lista mensagens recentes + config do webhook na Evolution API
// Temporário para debug
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("s")
  if (secret !== "nfdbg2026") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const [mensagens, config] = await Promise.all([
    prisma.mensagemWhatsapp.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        telefone: true,
        tipoMensagem: true,
        conteudo: true,
        direcao: true,
        status: true,
        createdAt: true,
      },
    }),
    getWhatsappConfig(),
  ])

  // Verifica webhook na Evolution API
  let webhookConfig = null
  if (config) {
    try {
      const res = await fetch(
        `${config.instanceUrl}/webhook/find/${config.instanceId}`,
        { headers: { apikey: config.apiKey }, signal: AbortSignal.timeout(5000) }
      )
      webhookConfig = await res.json()
    } catch (e) {
      webhookConfig = { error: String(e) }
    }
  }

  return NextResponse.json({
    totalMensagens: mensagens.length,
    mensagens,
    webhookConfig,
    configAtiva: !!config,
    instanceId: config?.instanceId,
  })
}
