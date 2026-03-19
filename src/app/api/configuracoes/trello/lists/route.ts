import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getBoardLists } from "@/lib/trello"

export async function GET() {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  // Tenta config do DB primeiro, depois env
  const dbConfig = await prisma.configTrello.findFirst({ where: { ativo: true } }).catch(() => null)

  const apiKey = dbConfig?.apiKey ?? process.env.TRELLO_API_KEY
  const token = dbConfig?.token ?? process.env.TRELLO_TOKEN
  const boardId = dbConfig?.boardId ?? process.env.TRELLO_BOARD_ID

  if (!apiKey || !token || !boardId) {
    return NextResponse.json({ error: "Trello não configurado" }, { status: 400 })
  }

  try {
    const lists = await getBoardLists({ apiKey, token, boardId })
    return NextResponse.json({
      lists,
      mapping: dbConfig?.listMapping ?? null,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao buscar listas" },
      { status: 500 }
    )
  }
}
