import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { Departamento, Prioridade, StatusVisivel, StatusInterno } from "@prisma/client"

// ─── List name → StatusVisivel mapping (fuzzy, case-insensitive) ─────────────

const LIST_KEYWORDS: Array<{ keywords: string[]; statusVisivel: StatusVisivel; statusInterno: StatusInterno }> = [
  {
    keywords: ["entrada", "inbox", "backlog", "novo", "novas", "new", "caixa"],
    statusVisivel: "entrada",
    statusInterno: "aguardando_triagem",
  },
  {
    keywords: ["produção", "producao", "doing", "andamento", "em progresso", "in progress"],
    statusVisivel: "producao",
    statusInterno: "planejamento",
  },
  {
    keywords: ["fila de edicao", "na fila"],
    statusVisivel: "edicao",
    statusInterno: "fila_edicao",
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
  {
    keywords: ["impedimento", "bloqueado", "blocked"],
    statusVisivel: "entrada",
    statusInterno: "impedimento",
  },
  {
    keywords: ["urgente"],
    statusVisivel: "entrada",
    statusInterno: "urgencia_aprovada",
  },
  {
    keywords: ["materiais extras", "extras"],
    statusVisivel: "finalizado",
    statusInterno: "entregue_cliente",
  },
]

// Lists to skip entirely (templates, non-demand content)
const SKIP_LIST_KEYWORDS = ["processos", "ideias", "ideia"]

function shouldSkipList(listName: string): boolean {
  const lower = listName.toLowerCase().trim()
  return SKIP_LIST_KEYWORDS.some((kw) => lower.includes(kw))
}

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
    if (name.includes("urgente") || name.includes("urgent")) return "urgente"
    if (name.includes("prioridade") || name.includes("alta") || name.includes("high")) return "alta"
    if (name.includes("atrasado")) return "alta"
  }
  return "normal"
}

// ─── Label → Editor name detection ──────────────────────────────────────────

const EDITOR_LABEL_NAMES = ["gabriel", "alan", "joao", "joão", "giovani", "cristiano", "paula"]

function extractEditorNameFromLabels(labels: Array<{ name?: string; color?: string }> | undefined): string | null {
  if (!labels || labels.length === 0) return null
  for (const label of labels) {
    const name = (label.name ?? "").toLowerCase().trim()
    if (EDITOR_LABEL_NAMES.some((en) => name.includes(en))) {
      return label.name?.trim() ?? null
    }
  }
  return null
}

// ─── Extract department from labels ─────────────────────────────────────────

function resolveDepartamento(labels: Array<{ name?: string; color?: string }> | undefined): Departamento {
  if (!labels || labels.length === 0) return "audiovisual"
  for (const label of labels) {
    const name = (label.name ?? "").toLowerCase()
    if (name.includes("growth")) return "growth"
    if (name.includes("social")) return "audiovisual"
    if (name.includes("evento")) return "eventos"
  }
  return "audiovisual"
}

// ─── Extract Drive links from description ───────────────────────────────────

function extractDriveLink(desc: string | undefined): string | null {
  if (!desc) return null
  const driveMatch = desc.match(/https?:\/\/drive\.google\.com\S+/)
  return driveMatch ? driveMatch[0] : null
}

// ─── Unique code generator (counter-based to avoid DB round-trip per card) ──

async function getNextCodeStart(): Promise<number> {
  const last = await prisma.demanda.findFirst({
    where: { codigo: { startsWith: "TRL-" } },
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  })
  return last ? parseInt(last.codigo.replace("TRL-", ""), 10) + 1 : 1
}

function formatCode(num: number): string {
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
  closed?: boolean
  labels?: TrelloLabel[]
  due?: string | null
  dateLastActivity?: string
  idChecklists?: string[]
  shortUrl?: string
}

interface TrelloChecklist {
  id: string
  name: string
  idCard: string
  checkItems?: Array<{
    name: string
    state: string // "complete" | "incomplete"
  }>
}

interface TrelloList {
  id: string
  name: string
  closed?: boolean
}

interface TrelloExport {
  lists?: TrelloList[]
  cards?: TrelloCard[]
  checklists?: TrelloChecklist[]
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
  const checklists = body.checklists ?? []

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

  // Build checklist map: cardId → checklists
  const checklistMap = new Map<string, TrelloChecklist[]>()
  for (const cl of checklists) {
    const existing = checklistMap.get(cl.idCard) ?? []
    existing.push(cl)
    checklistMap.set(cl.idCard, existing)
  }

  // Find already-imported card IDs (deduplication)
  const existingCardIds = await prisma.demanda.findMany({
    where: { trelloCardId: { not: null } },
    select: { trelloCardId: true },
  })
  const importedSet = new Set(existingCardIds.map((d) => d.trelloCardId))

  // Load editors from DB for label matching
  const allEditors = await prisma.editor.findMany({
    select: { id: true, nome: true },
  })
  // Build a fuzzy lookup: first name lowercase → editor id
  const editorLookup = new Map<string, string>()
  for (const editor of allEditors) {
    const firstName = editor.nome.toLowerCase().split(" ")[0]
    editorLookup.set(firstName, editor.id)
    // Also add full name
    editorLookup.set(editor.nome.toLowerCase(), editor.id)
  }

  // Get next code starting number
  let codeNum = await getNextCodeStart()

  let imported = 0
  let skipped = 0
  let skippedClosed = 0
  let skippedLists = 0
  const errors: string[] = []
  const details: Array<{ card: string; status: "imported" | "skipped" | "error"; info?: string }> = []

  // Filter only open cards
  const openCards = cards.filter((c) => !c.closed)

  for (const card of openCards) {
    // Skip if already imported
    if (importedSet.has(card.id)) {
      skipped++
      details.push({ card: card.name.slice(0, 60), status: "skipped", info: "Já importado" })
      continue
    }

    // Skip cards from template/ideas lists
    const listName = listMap.get(card.idList) ?? "Entrada"
    if (shouldSkipList(listName)) {
      skippedLists++
      details.push({ card: card.name.slice(0, 60), status: "skipped", info: `Lista ignorada: ${listName}` })
      continue
    }

    try {
      const { statusVisivel, statusInterno } = resolveStatusFromListName(listName)
      const prioridade = resolvePrioridade(card.labels)
      const departamento = resolveDepartamento(card.labels)
      const codigo = formatCode(codeNum++)

      // Resolve editor from label
      const editorLabelName = extractEditorNameFromLabels(card.labels)
      let editorId: string | null = null
      if (editorLabelName) {
        const firstName = editorLabelName.toLowerCase().split(" ")[0]
        editorId = editorLookup.get(firstName) ?? editorLookup.get(editorLabelName.toLowerCase()) ?? null
      }

      // Extract Drive link from description
      const driveLink = extractDriveLink(card.desc)

      // Build description with original Trello info
      let descricao = card.desc || `Importado do Trello: ${card.name}`
      if (card.shortUrl) {
        descricao += `\n\n📋 Trello: ${card.shortUrl}`
      }

      // Create demand
      const demanda = await prisma.demanda.create({
        data: {
          codigo,
          titulo: card.name.slice(0, 200),
          descricao,
          departamento,
          tipoVideo: "video_institucional",
          cidade: "Belo Horizonte",
          prioridade,
          statusVisivel,
          statusInterno,
          solicitanteId: session.user.id,
          editorId,
          trelloCardId: card.id,
          dataLimite: card.due ? new Date(card.due) : null,
          linkBrutos: driveLink,
        },
      })

      // Import checklists as checklist items
      const cardChecklists = checklistMap.get(card.id)
      if (cardChecklists && cardChecklists.length > 0) {
        const checklistItems = []
        let ordem = 0
        for (const cl of cardChecklists) {
          for (const item of cl.checkItems ?? []) {
            checklistItems.push({
              demandaId: demanda.id,
              texto: item.name.slice(0, 200),
              concluido: item.state === "complete",
              grupo: "geral",
              ordem: ordem++,
            })
          }
        }
        if (checklistItems.length > 0) {
          await prisma.checklistItem.createMany({ data: checklistItems })
        }
      }

      imported++
      const editorInfo = editorLabelName ? ` · Editor: ${editorLabelName}` : ""
      details.push({
        card: card.name.slice(0, 60),
        status: "imported",
        info: `${codigo} · ${statusVisivel} · ${prioridade}${editorInfo}`,
      })
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
    skippedClosed: cards.length - openCards.length,
    skippedLists,
    total: cards.length,
    openCards: openCards.length,
    errors: errors.slice(0, 20),
    details,
  })
}
