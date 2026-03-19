import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/whatsapp"

// POST /api/configuracoes/whatsapp/teste — testa conexão + opcionalmente envia mensagem de teste
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const config = await prisma.configWhatsapp.findFirst()
  if (!config) return NextResponse.json({ ok: false, error: "Nenhuma configuração encontrada" })

  // Verifica conexão
  let state = "unknown"
  try {
    const res = await fetch(`${config.instanceUrl}/instance/connectionState/${config.instanceId}`, {
      headers: { apikey: config.apiKey },
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json()
    state = json?.instance?.state ?? "unknown"

    if (state !== "open") {
      return NextResponse.json({
        ok: false,
        status: state,
        error: `WhatsApp não está conectado (estado: ${state}). Reconecte via QR Code.`,
      })
    }
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro de rede" })
  }

  // Se veio telefone no body, envia mensagem de teste
  let body: { telefone?: string } = {}
  try {
    body = await req.json()
  } catch {
    // Sem body — apenas teste de conexão
  }

  if (body.telefone) {
    const numero = body.telefone.replace(/\D/g, "")
    if (!numero) {
      return NextResponse.json({ ok: false, error: "Número inválido" })
    }

    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const result = await sendWhatsappMessage(
      numero,
      `*NuFlow — Teste de Conexao*\n\nEsta mensagem confirma que o WhatsApp esta funcionando corretamente.\n\nData/hora: ${agora}`
    )

    if (result?.key?.id) {
      return NextResponse.json({
        ok: true,
        status: state,
        mensagemEnviada: true,
        messageId: result.key.id,
        para: numero,
      })
    } else {
      return NextResponse.json({
        ok: false,
        status: state,
        error: "Conexao OK mas falhou ao enviar mensagem de teste",
        details: result,
      })
    }
  }

  return NextResponse.json({ ok: true, status: state })
}
