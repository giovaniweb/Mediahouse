import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { getOrgId } from "@/lib/org"

// GET /api/whatsapp/status — estado da conexão WhatsApp da organização do usuário logado
export async function GET() {
  const session = await auth()
  const organizacaoId = session ? await getOrgId(session) : null
  const config = organizacaoId
    ? await prisma.configWhatsapp.findFirst({ where: { organizacaoId, ativo: true } })
    : null
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
