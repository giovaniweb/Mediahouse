import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/whatsapp/status — retorna estado da conexão WhatsApp (sem auth para sidebar)
export async function GET() {
  const config = await prisma.configWhatsapp.findFirst({ where: { ativo: true } })
  if (!config) {
    return NextResponse.json({ connected: false, reason: "no_config" })
  }

  try {
    const res = await fetch(
      `${config.instanceUrl}/instance/connectionState/${config.instanceId}`,
      {
        headers: { apikey: config.apiKey },
        signal: AbortSignal.timeout(5000),
      }
    )

    if (!res.ok) {
      return NextResponse.json({ connected: false, reason: "api_error", status: res.status })
    }

    const json = await res.json()
    const state = json?.instance?.state ?? "unknown"

    return NextResponse.json({
      connected: state === "open",
      state,
      instanceName: config.instanceId,
    })
  } catch (e) {
    return NextResponse.json({
      connected: false,
      reason: "network_error",
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
