import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { syncEmailInbox } from "@/lib/email-inbox"

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!["admin", "gestor", "operacao"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão para sincronizar." }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const config = await prisma.configEmailEntrada.findUnique({
    where: { organizacaoId },
    select: { id: true },
  })
  if (!config) return NextResponse.json({ error: "Caixa de entrada não configurada." }, { status: 404 })

  try {
    return NextResponse.json({ ok: true, ...(await syncEmailInbox(config.id)) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    )
  }
}
