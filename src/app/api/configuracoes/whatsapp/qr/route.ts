import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/configuracoes/whatsapp/qr — busca QR code da Evolution API
// Fluxo:
//   1. Verifica connectionState da instância
//   2a. Se "open" → retorna { conectado: true }
//   2b. Se instância existe mas desconectada → GET /instance/connect para QR
//   3. Se 404 (instância não existe) → tenta criar via POST /instance/create
//   4. Se criação falhar → retorna mensagem clara para criar no painel da Evolution API
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
    // ── Passo 1: verificar estado da conexão ──────────────────────────────
    const stateRes = await fetch(`${base}/instance/connectionState/${config.instanceId}`, { headers })

    if (stateRes.ok) {
      const stateData = await stateRes.json()
      const state = stateData?.instance?.state ?? stateData?.state ?? null

      // Já conectado
      if (state === "open") {
        return NextResponse.json({ conectado: true, estado: "open" })
      }

      // Instância existe mas desconectada → buscar QR code
      const connectRes = await fetch(`${base}/instance/connect/${config.instanceId}`, { headers })
      if (!connectRes.ok) {
        const body = await connectRes.text().catch(() => "")
        return NextResponse.json(
          { error: `Erro ao conectar (${connectRes.status}): ${body}` },
          { status: 502 }
        )
      }

      const data = await connectRes.json()
      if (data?.instance?.state === "open") {
        return NextResponse.json({ conectado: true, estado: "open" })
      }

      let qrcode = data?.qrcode?.base64 ?? data?.base64 ?? data?.qrcode ?? null
      if (qrcode && typeof qrcode === "string" && !qrcode.startsWith("data:")) {
        qrcode = `data:image/png;base64,${qrcode}`
      }

      return NextResponse.json({ conectado: false, qrcode, estado: state ?? "qr" })
    }

    // ── Passo 2: instância não existe (404) → tentar criar ────────────────
    if (stateRes.status === 404) {
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
        // Criação falhou → provavelmente plano hosted que exige painel
        return NextResponse.json(
          {
            error:
              `A instância "${config.instanceId}" não existe e não foi possível criá-la automaticamente. ` +
              `Acesse o painel da sua Evolution API, crie a instância com esse nome e tente novamente.`,
          },
          { status: 502 }
        )
      }

      // Criação OK → buscar QR code
      const connectRes = await fetch(`${base}/instance/connect/${config.instanceId}`, { headers })
      if (!connectRes.ok) {
        return NextResponse.json(
          { error: `Instância criada, mas erro ao obter QR (${connectRes.status})` },
          { status: 502 }
        )
      }

      const data = await connectRes.json()
      let qrcode = data?.qrcode?.base64 ?? data?.base64 ?? data?.qrcode ?? null
      if (qrcode && typeof qrcode === "string" && !qrcode.startsWith("data:")) {
        qrcode = `data:image/png;base64,${qrcode}`
      }

      return NextResponse.json({ conectado: false, qrcode, estado: "qr" })
    }

    // ── Outro erro na verificação de estado ───────────────────────────────
    const body = await stateRes.text().catch(() => "")
    return NextResponse.json(
      { error: `Evolution API retornou ${stateRes.status}: ${body}` },
      { status: 502 }
    )
  } catch (err) {
    return NextResponse.json({ error: `Erro ao conectar: ${err}` }, { status: 502 })
  }
}
