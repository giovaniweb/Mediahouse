import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/configuracoes/whatsapp/qr — busca QR code da Evolution API
// Se a instância não existir (404), cria automaticamente antes de conectar
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const config = await prisma.configWhatsapp.findFirst({ orderBy: { createdAt: "desc" } })
  if (!config || !config.instanceUrl || !config.apiKey || !config.instanceId) {
    return NextResponse.json({ error: "WhatsApp não configurado" }, { status: 400 })
  }

  const base = config.instanceUrl.replace(/\/$/, "")
  const headers = { apikey: config.apiKey, "Content-Type": "application/json" }

  try {
    // 1ª tentativa: conectar direto
    let res = await fetch(`${base}/instance/connect/${config.instanceId}`, { headers })

    // Se 404 → instância não existe, criar primeiro
    if (res.status === 404) {
      const createRes = await fetch(`${base}/instance/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          instanceName: config.instanceId,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      })

      if (!createRes.ok) {
        const err = await createRes.text().catch(() => createRes.status.toString())
        return NextResponse.json(
          { error: `Não foi possível criar a instância (${createRes.status}): ${err}` },
          { status: 502 }
        )
      }

      // 2ª tentativa após criar
      res = await fetch(`${base}/instance/connect/${config.instanceId}`, { headers })
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `Evolution API retornou ${res.status}` },
        { status: 502 }
      )
    }

    const data = await res.json()

    // Evolution API retorna: { qrcode: { base64: "..." } } ou { instance: { state: "open" } }
    if (data?.instance?.state === "open") {
      return NextResponse.json({ conectado: true, estado: "open" })
    }

    let qrcode = data?.qrcode?.base64 ?? data?.base64 ?? data?.qrcode ?? null

    // Garantir que o base64 tem o prefixo correto para uso em <img src>
    if (qrcode && typeof qrcode === "string" && !qrcode.startsWith("data:")) {
      qrcode = `data:image/png;base64,${qrcode}`
    }

    return NextResponse.json({ conectado: false, qrcode, estado: data?.instance?.state ?? "qr" })
  } catch (err) {
    return NextResponse.json({ error: `Erro ao conectar: ${err}` }, { status: 502 })
  }
}
