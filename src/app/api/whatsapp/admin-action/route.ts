import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// POST /api/whatsapp/admin-action — ações administrativas (temporário)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { secret, action, ...params } = body

    if (secret !== "nfdbg2026") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    if (action === "send_message") {
      // Busca config direto
      const config = await prisma.configWhatsapp.findFirst({ where: { ativo: true } })
      if (!config) return NextResponse.json({ error: "no config" })

      // Limpa número
      const numero = params.telefone.replace(/\D/g, "")

      const res = await fetch(`${config.instanceUrl}/message/sendText/${config.instanceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.apiKey },
        body: JSON.stringify({
          number: numero,
          textMessage: { text: params.mensagem },
          options: { delay: 1200, presence: "composing" },
        }),
        signal: AbortSignal.timeout(15000),
      })
      const json = await res.json()
      return NextResponse.json({ ok: res.ok, status: res.status, result: json })
    }

    if (action === "update_demanda") {
      const demanda = await prisma.demanda.findFirst({
        where: { codigo: params.codigo },
      })
      if (!demanda) return NextResponse.json({ error: "demanda not found" })

      const updated = await prisma.demanda.update({
        where: { id: demanda.id },
        data: params.data,
      })
      return NextResponse.json({ ok: true, id: updated.id, codigo: updated.codigo })
    }

    return NextResponse.json({ error: "unknown action" })
  } catch (e) {
    console.error("[admin-action] Error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
