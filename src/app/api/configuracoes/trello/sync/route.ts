import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { syncDemandaTrello } from "@/lib/trello"

export async function POST() {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const apiKey = process.env.TRELLO_API_KEY
  const token = process.env.TRELLO_TOKEN
  const boardId = process.env.TRELLO_BOARD_ID

  if (!apiKey || !token || !boardId) {
    return NextResponse.json({ ok: false, error: "Credenciais Trello não configuradas nas variáveis de ambiente" })
  }

  const cfg = { apiKey, token, boardId }

  const demandas = await prisma.demanda.findMany({
    where: { statusInterno: { notIn: ["encerrado", "expirado"] } },
    select: { id: true, codigo: true, titulo: true, descricao: true, statusVisivel: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  let count = 0
  const errors: string[] = []

  for (const d of demandas) {
    try {
      await syncDemandaTrello(cfg, d)
      count++
    } catch (e) {
      errors.push(`${d.codigo}: ${e instanceof Error ? e.message : "Erro"}`)
    }
  }

  return NextResponse.json({ ok: true, count, errors })
}
