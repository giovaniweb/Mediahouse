import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { Departamento, Prioridade, StatusVisivel, StatusInterno } from "@prisma/client"

// ─── List name → StatusVisivel mapping (fuzzy, case-insensitive) ─────────────

const LIST_KEYWORDS: Array<{ keywords: string[]; statusVisivel: StatusVisivel; statusInterno: StatusInterno }> = [
  {
    keywords: ["entrada", "inbox", "backlog", "novo", "novas", "new"],
    statusVisivel: "entrada",
    statusInterno: "aguardando_triagem",
  },
  {
    keywords: ["produção", "producao", "doing", "andamento", "em progresso", "in progress"],
    statusVisivel: "producao",
    statusInterno: "planejamento",
  },
  {
    keywords: ["edição", "edicao", "edit", "editing"],
    statusVisivel: "edicao",
    statusInterno: "editando",
  },
  {
    keywords: ["revisão", "revisao", "review", "aprovação", "aprovacao", "approv"],
    statusVisivel: "aprovacao",
    statusInterno: "revisao_pendente",
  },
  {
    keywords: ["para postar", "post", "publicar", "agendar", "schedule"],
    statusVisivel: "para_postar",
    statusInterno: "postagem_pendente",
  },
  {
    keywords: ["entregue", "done", "concluído", "concluido", "finalizado", "finished", "complete"],
    statusVisivel: "finalizado",
    statusInterno: "entregue_cliente",
  },
]

function resolveStatusFromListName(listName: string): { statusVisivel: StatusVisivel; statusInterno: StatusInterno } {
  const lower = listName.toLowerCase().trim()
  for (const rule of LIST_KEYWORDS) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        return { statusVisivel: rule.statusVisivel, statusInterno: rule.statusInterno }
      }
    }
  }
  return { statusVisivel: "entrada", statusInterno: "aguardando_triagem" }
}

// ─── Label → Prioridade mapping ──────────────────────────────────────────────

function resolvePrioridade(labels: Array<{ name?: string; color?: string }> | undefined): Prioridade {
  if (!labels || labels.length === 0) return "normal"
  for (const label of labels) {
    const name = (label.name ?? "").toLowerCase()
    const color = (label.color ?? "").toLowerCase()
    if (name.includes("urgente") || name.includes("urgent") || color === "red") return "urgente"
    if (name.includes("alta") || name.includes("high") || color === "orange") return "alta"
  }
  return "normal"
}

// ─── Unique code generator ───────────────────────────────────────────────────

async function nextCode(): Promise<string> {
  const last = await prisma.demanda.findFirst({
    where: { codigo: { startsWith: "TRL-" } },
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  })
  const num = last ? parseInt(last.codigo.replace("TRL-", ""), 10) + 1 : 1
  return `TRL-${String(num).padStart(4, "0")}`
}

// ─── Trello JSON export types ────────────────────────────────────────────────

interface TrelloLabel {
  name?: string
  color?: string
}

interface TrelloCard {
  id: string
  name: string
  desc?: string
  idList: string
  labels?: TrelloLabel[]
  due?: string | null
}

interface TrelloList {
  id: string
  name: string
}

interface TrelloExport {
  lists?: TrelloList[]
  cards?: TrelloCard[]
}

// ─── POST: Import from uploaded Trello JSON ──────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  let body: TrelloExport
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const lists = body.lists
  const cards = body.cards

  if (!Array.isArray(lists) || !Array.isArray(cards)) {
    return NextResponse.json(
      { error: "Formato inválido. O arquivo deve conter 'lists' e 'cards' do export Trello." },
      { status: 400 }
    )
  }

  if (cards.length === 0) {
    return NextResponse.json({ ok: true, imported: 0, skipped: 0, errors: [], details: [] })
  }

  // Build list id → name map
  const listMap = new Map<string, string>(lists.map((l) => [l.id, l.name]))

  // Find already-imported card IDs (deduplication)
  const existingCardIds = await prisma.demanda.findMany({
    where: { trelloCardId: { not: null } },
    select: { trelloCardId: true },
  })
  const importedSet = new Set(existingCardIds.map((d) => d.trelloCardId))

  let imported = 0
  let skipped = 0
  const errors: string[] = []
  const details: Array<{ card: string; status: "imported" | "skipped" | "error"; info?: string }> = []

  for (const card of cards) {
    // Skip if already imported
    if (importedSet.has(card.id)) {
      skipped++
      details.push({ card: card.name.slice(0, 60), status: "skipped", info: "Já importado" })
      continue
    }

    try {
      const listName = listMap.get(card.idList) ?? "Entrada"
      const { statusVisivel, statusInterno } = resolveStatusFromListName(listName)
      const prioridade = resolvePrioridade(card.labels)
      const codigo = await nextCode()

      await prisma.demanda.create({
        data: {
          codigo,
          titulo: card.name.slice(0, 200),
          descricao: card.desc || `Importado do Trello: ${card.name}`,
          departamento: "outros" as Departamento,
          tipoVideo: "outro",
          cidade: "",
          prioridade,
          statusVisivel,
          statusInterno,
          solicitanteId: session.user.id,
          trelloCardId: card.id,
          dataLimite: card.due ? new Date(card.due) : null,
        },
      })

      imported++
      details.push({ card: card.name.slice(0, 60), status: "imported", info: `${statusVisivel} · ${prioridade}` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido"
      errors.push(`"${card.name.slice(0, 30)}": ${msg}`)
      details.push({ card: card.name.slice(0, 60), status: "error", info: msg })
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    total: cards.length,
    errors: errors.slice(0, 20),
    details: details.slice(0, 100),
  })
}
