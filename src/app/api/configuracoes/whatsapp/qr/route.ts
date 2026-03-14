import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/configuracoes/whatsapp/qr — busca QR code da Evolution API
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const config = await prisma.configWhatsapp.findFirst({ orderBy: { createdAt: "desc" } })
  if (!config || !config.instanceUrl || !config.apiKey || !config.instanceId) {
    return NextResponse.json({ error: "WhatsApp não configurado" }, { status: 400 })
  }

  try {
    // Tentar conectar e obter QR
    const res = await fetch(`${config.instanceUrl}/instance/connect/${config.instanceId}`, {
      headers: { apikey: config.apiKey },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Evolution API retornou ${res.status}` }, { status: 502 })
    }

    const data = await res.json()

    // Evolution API retorna: { qrcode: { base64: "..." } } ou { instance: { state: "open" } }
    if (data?.instance?.state === "open") {
      return NextResponse.json({ conectado: true, estado: "open" })
    }

    const qrcode = data?.qrcode?.base64 ?? data?.base64 ?? data?.qrcode ?? null

    return NextResponse.json({ conectado: false, qrcode, estado: data?.instance?.state ?? "qr" })
  } catch (err) {
    return NextResponse.json({ error: `Erro ao conectar: ${err}` }, { status: 502 })
  }
}
