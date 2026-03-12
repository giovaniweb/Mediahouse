import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getBoardLists } from "@/lib/trello"

// Armazenamos config em memória/env (pode ser migrado para DB depois)
// Por ora usa variáveis de ambiente, configuráveis pela UI
let trelloConfigCache: { apiKey: string; token: string; boardId: string; ativo: boolean } | null = null

export async function GET() {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  // Lê de env ou cache
  const cfg = trelloConfigCache ?? {
    apiKey: process.env.TRELLO_API_KEY ? "••••" + process.env.TRELLO_API_KEY.slice(-4) : "",
    token: process.env.TRELLO_TOKEN ? "••••" + process.env.TRELLO_TOKEN.slice(-4) : "",
    boardId: process.env.TRELLO_BOARD_ID ?? "",
    ativo: !!(process.env.TRELLO_API_KEY && process.env.TRELLO_TOKEN && process.env.TRELLO_BOARD_ID),
  }

  return NextResponse.json({ config: cfg })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const body = await req.json()
  const { apiKey, token, boardId } = body

  if (!boardId) return NextResponse.json({ error: "boardId é obrigatório" }, { status: 400 })

  // Testa conexão
  try {
    const cfg = {
      apiKey: apiKey?.startsWith("••••") ? (process.env.TRELLO_API_KEY ?? "") : apiKey,
      token: token?.startsWith("••••") ? (process.env.TRELLO_TOKEN ?? "") : token,
      boardId,
    }
    await getBoardLists(cfg)
    trelloConfigCache = { ...cfg, ativo: true }
    return NextResponse.json({ config: trelloConfigCache })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao conectar ao Trello" }, { status: 400 })
  }
}
