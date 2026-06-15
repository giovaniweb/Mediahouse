import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

// POST /api/configuracoes/whatsapp/desconectar — desconecta instância WhatsApp
export async function POST() {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const config = await prisma.configWhatsapp.findFirst({ where: { organizacaoId } })
  if (!config) {
    return NextResponse.json({ ok: false, error: "Nenhuma configuração encontrada" })
  }

  try {
    const res = await fetch(
      `${config.instanceUrl}/instance/logout/${config.instanceId}`,
      {
        method: "DELETE",
        headers: { apikey: config.apiKey },
        signal: AbortSignal.timeout(8000),
      }
    )
    const json = await res.json()
    return NextResponse.json({
      ok: res.ok,
      message: res.ok ? "WhatsApp desconectado" : "Falha ao desconectar",
      details: json,
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Erro de rede",
    })
  }
}
