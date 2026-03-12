import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST() {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const config = await prisma.configWhatsapp.findFirst()
  if (!config) return NextResponse.json({ ok: false, error: "Nenhuma configuração encontrada" })

  try {
    const res = await fetch(`${config.instanceUrl}/instance/connectionState/${config.instanceId}`, {
      headers: { apikey: config.apiKey },
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json()
    if (res.ok) {
      return NextResponse.json({ ok: true, status: json?.instance?.state ?? "conectado" })
    }
    return NextResponse.json({ ok: false, error: json?.message ?? "Falha na conexão" })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro de rede" })
  }
}
