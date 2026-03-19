import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getBoardLists, getBoardCards } from "@/lib/trello"
import type { Departamento } from "@prisma/client"

// Reverse mapping: Trello list name → StatusVisivel
const LIST_NAME_TO_STATUS: Record<string, string> = {
  "📥 Entrada": "entrada",
  "entrada": "entrada",
  "🎬 Em Produção": "producao",
  "produção": "producao",
  "producao": "producao",
  "✂️ Edição": "edicao",
  "edição": "edicao",
  "edicao": "edicao",
  "✅ Aprovação": "aprovacao",
  "aprovação": "aprovacao",
  "aprovacao": "aprovacao",
  "📤 Para Postar": "para_postar",
  "para postar": "para_postar",
  "🏁 Finalizado": "finalizado",
  "finalizado": "finalizado",
  "concluído": "finalizado",
  "done": "finalizado",
}

const STATUS_VISIVEL_TO_INTERNO: Record<string, string> = {
  entrada: "aguardando_triagem",
  producao: "planejamento",
  edicao: "editando",
  aprovacao: "revisao_pendente",
  para_postar: "postagem_pendente",
  finalizado: "entregue_cliente",
}

function resolveStatusFromList(
  listId: string,
  listName: string,
  customMapping: Record<string, string> | null
): { statusVisivel: string; statusInterno: string } {
  // Custom mapping takes priority
  if (customMapping && customMapping[listId]) {
    const sv = customMapping[listId]
    return { statusVisivel: sv, statusInterno: STATUS_VISIVEL_TO_INTERNO[sv] ?? "aguardando_triagem" }
  }

  // Try name-based mapping (case-insensitive)
  const lower = listName.toLowerCase().trim()
  for (const [key, val] of Object.entries(LIST_NAME_TO_STATUS)) {
    if (lower.includes(key.toLowerCase())) {
      return { statusVisivel: val, statusInterno: STATUS_VISIVEL_TO_INTERNO[val] ?? "aguardando_triagem" }
    }
  }

  // Default: entrada
  return { statusVisivel: "entrada", statusInterno: "aguardando_triagem" }
}

// Generate unique demand code
async function nextCode(): Promise<string> {
  const last = await prisma.demanda.findFirst({
    where: { codigo: { startsWith: "TRL-" } },
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  })
  const num = last ? parseInt(last.codigo.replace("TRL-", ""), 10) + 1 : 1
  return `TRL-${String(num).padStart(4, "0")}`
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  // Get config
  const dbConfig = await prisma.configTrello.findFirst({ where: { ativo: true } }).catch(() => null)
  const apiKey = dbConfig?.apiKey ?? process.env.TRELLO_API_KEY
  const token = dbConfig?.token ?? process.env.TRELLO_TOKEN
  const boardId = dbConfig?.boardId ?? process.env.TRELLO_BOARD_ID

  if (!apiKey || !token || !boardId) {
    return NextResponse.json({ error: "Trello não configurado" }, { status: 400 })
  }

  const cfg = { apiKey, token, boardId }
  const body = await req.json().catch(() => ({}))
  const customMapping = (body.mapping as Record<string, string>) ?? (dbConfig?.listMapping as Record<string, string> | null) ?? null

  try {
    const [lists, cards] = await Promise.all([
      getBoardLists(cfg),
      getBoardCards(cfg),
    ])

    const listMap = new Map(lists.map((l: { id: string; name: string }) => [l.id, l.name]))

    // Find already imported card IDs
    const existingCardIds = await prisma.demanda.findMany({
      where: { trelloCardId: { not: null } },
      select: { trelloCardId: true },
    })
    const importedSet = new Set(existingCardIds.map(d => d.trelloCardId))

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const card of cards) {
      if (importedSet.has(card.id)) {
        skipped++
        continue
      }

      try {
        const listName = listMap.get(card.idList) ?? "Entrada"
        const { statusVisivel, statusInterno } = resolveStatusFromList(card.idList, listName, customMapping)

        const codigo = await nextCode()

        await prisma.demanda.create({
          data: {
            codigo,
            titulo: card.name.slice(0, 200),
            descricao: card.desc || `Importado do Trello: ${card.name}`,
            departamento: "outros" as Departamento,
            tipoVideo: "outro",
            cidade: "",
            statusVisivel: statusVisivel as import("@prisma/client").StatusVisivel,
            statusInterno: statusInterno as import("@prisma/client").StatusInterno,
            solicitanteId: session.user.id,
            trelloCardId: card.id,
          },
        })

        imported++
      } catch (e) {
        errors.push(`"${card.name.slice(0, 30)}": ${e instanceof Error ? e.message : "Erro"}`)
      }
    }

    return NextResponse.json({
      ok: true,
      imported,
      skipped,
      total: cards.length,
      errors: errors.slice(0, 10),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao importar" },
      { status: 500 }
    )
  }
}

// GET: Preview what will be imported (dry run)
export async function GET() {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const dbConfig = await prisma.configTrello.findFirst({ where: { ativo: true } }).catch(() => null)
  const apiKey = dbConfig?.apiKey ?? process.env.TRELLO_API_KEY
  const token = dbConfig?.token ?? process.env.TRELLO_TOKEN
  const boardId = dbConfig?.boardId ?? process.env.TRELLO_BOARD_ID

  if (!apiKey || !token || !boardId) {
    return NextResponse.json({ error: "Trello não configurado" }, { status: 400 })
  }

  try {
    const [lists, cards] = await Promise.all([
      getBoardLists({ apiKey, token, boardId }),
      getBoardCards({ apiKey, token, boardId }),
    ])

    const existingCardIds = await prisma.demanda.findMany({
      where: { trelloCardId: { not: null } },
      select: { trelloCardId: true },
    })
    const importedSet = new Set(existingCardIds.map(d => d.trelloCardId))

    const newCards = cards.filter((c: { id: string }) => !importedSet.has(c.id))

    return NextResponse.json({
      total: cards.length,
      alreadyImported: cards.length - newCards.length,
      toImport: newCards.length,
      lists: lists.map((l: { id: string; name: string }) => ({
        id: l.id,
        name: l.name,
        cardCount: cards.filter((c: { idList: string }) => c.idList === l.id).length,
      })),
      preview: newCards.slice(0, 20).map((c: { id: string; name: string; idList: string }) => ({
        id: c.id,
        name: c.name,
        list: lists.find((l: { id: string }) => l.id === c.idList)?.name ?? "?",
      })),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    )
  }
}
