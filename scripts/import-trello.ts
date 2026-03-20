/**
 * Script para importar demandas do Trello JSON export
 * Uso: npx tsx scripts/import-trello.ts
 */

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"
import pg from "pg"
import fs from "fs"
import path from "path"
import dotenv from "dotenv"

// Load env
dotenv.config({ path: path.join(__dirname, "../.env.local") })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error("DATABASE_URL not set")

// Setup Prisma with pg adapter (same as the app)
const pool = new pg.Pool({ connectionString: DATABASE_URL })
const adapter = new PrismaPg(pool as any)
const prisma = new PrismaClient({ adapter } as any)

// ─── Config ─────────────────────────────────────────────────────────────────

const TRELLO_JSON_PATH = path.join(
  process.env.HOME || "/Users/giovanigomes",
  "Downloads/kXzOYsXT - liberacao-de-videos-ii.json"
)

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrelloLabel { name?: string; color?: string }
interface TrelloCard {
  id: string; name: string; desc?: string; idList: string
  closed?: boolean; labels?: TrelloLabel[]; due?: string | null
  dateLastActivity?: string; idChecklists?: string[]; shortUrl?: string
}
interface TrelloChecklist {
  id: string; name: string; idCard: string
  checkItems?: Array<{ name: string; state: string }>
}
interface TrelloList { id: string; name: string; closed?: boolean }
interface TrelloExport { lists?: TrelloList[]; cards?: TrelloCard[]; checklists?: TrelloChecklist[] }

// ─── List mapping ───────────────────────────────────────────────────────────

const LIST_KEYWORDS = [
  { keywords: ["entrada", "inbox", "caixa"], sv: "entrada", si: "aguardando_triagem" },
  { keywords: ["produção", "producao"], sv: "producao", si: "planejamento" },
  { keywords: ["fila de edicao", "na fila"], sv: "edicao", si: "fila_edicao" },
  { keywords: ["edição", "edicao", "edit"], sv: "edicao", si: "editando" },
  { keywords: ["aprovação", "aprovacao", "approv"], sv: "aprovacao", si: "revisao_pendente" },
  { keywords: ["para postar", "post", "publicar"], sv: "para_postar", si: "postagem_pendente" },
  { keywords: ["finalizado", "done", "concluído", "concluido"], sv: "finalizado", si: "entregue_cliente" },
  { keywords: ["impedimento", "bloqueado"], sv: "entrada", si: "impedida" },
  { keywords: ["urgente"], sv: "entrada", si: "urgencia_aprovada" },
  { keywords: ["materiais extras", "extras"], sv: "finalizado", si: "entregue_cliente" },
  { keywords: ["15 dias"], sv: "para_postar", si: "postagem_pendente" },
]

const SKIP_LIST_KEYWORDS = ["processos", "ideias", "ideia"]

function shouldSkipList(listName: string): boolean {
  const lower = listName.toLowerCase().trim()
  return SKIP_LIST_KEYWORDS.some((kw) => lower.includes(kw))
}

function resolveStatus(listName: string) {
  const lower = listName.toLowerCase().trim()
  for (const rule of LIST_KEYWORDS) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) return { statusVisivel: rule.sv, statusInterno: rule.si }
    }
  }
  return { statusVisivel: "entrada", statusInterno: "aguardando_triagem" }
}

function resolvePrioridade(labels: TrelloLabel[] | undefined): string {
  if (!labels) return "normal"
  for (const l of labels) {
    const n = (l.name ?? "").toLowerCase()
    if (n.includes("urgente")) return "urgente"
    if (n.includes("prioridade") || n.includes("atrasado")) return "alta"
  }
  return "normal"
}

const EDITOR_NAMES = ["gabriel", "alan", "joao", "joão", "giovani", "cristiano", "paula"]

function extractEditorLabel(labels: TrelloLabel[] | undefined): string | null {
  if (!labels) return null
  for (const l of labels) {
    const n = (l.name ?? "").toLowerCase().trim()
    if (EDITOR_NAMES.some((en) => n.includes(en))) return l.name?.trim() ?? null
  }
  return null
}

function resolveDepartamento(labels: TrelloLabel[] | undefined): string {
  if (!labels) return "audiovisual"
  for (const l of labels) {
    const n = (l.name ?? "").toLowerCase()
    if (n.includes("growth")) return "growth"
    if (n.includes("social")) return "social_media"
  }
  return "audiovisual"
}

function extractDriveLink(desc: string | undefined): string | null {
  if (!desc) return null
  const match = desc.match(/https?:\/\/drive\.google\.com\S+/)
  return match ? match[0] : null
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄 Importação Trello → NuFlow")
  console.log("─".repeat(60))

  // Read JSON
  const raw = fs.readFileSync(TRELLO_JSON_PATH, "utf-8")
  const data: TrelloExport = JSON.parse(raw)

  const lists = data.lists ?? []
  const cards = data.cards ?? []
  const checklists = data.checklists ?? []

  console.log(`📋 Board: ${lists.length} listas, ${cards.length} cards, ${checklists.length} checklists`)

  // Build maps
  const listMap = new Map(lists.map((l) => [l.id, l.name]))
  const checklistMap = new Map<string, TrelloChecklist[]>()
  for (const cl of checklists) {
    const arr = checklistMap.get(cl.idCard) ?? []
    arr.push(cl)
    checklistMap.set(cl.idCard, arr)
  }

  // Get existing imported IDs
  const existingCards = await prisma.demanda.findMany({
    where: { trelloCardId: { not: null } },
    select: { trelloCardId: true },
  })
  const importedSet = new Set(existingCards.map((d: any) => d.trelloCardId))
  console.log(`📦 Já importados: ${importedSet.size} cards`)

  // Load editors
  const editors = await prisma.editor.findMany({ select: { id: true, nome: true } })
  const editorLookup = new Map<string, string>()
  for (const e of editors) {
    editorLookup.set(e.nome.toLowerCase().split(" ")[0], e.id)
    editorLookup.set(e.nome.toLowerCase(), e.id)
  }
  console.log(`👥 Editores no banco: ${editors.map((e: any) => e.nome).join(", ")}`)

  // Get Giovani (gestor) as solicitante
  const gestor = await prisma.usuario.findFirst({
    where: { OR: [{ nome: { contains: "Giovani", mode: "insensitive" } }, { tipo: "gestor" }] },
    select: { id: true, nome: true },
  })
  if (!gestor) {
    console.error("❌ Nenhum gestor encontrado no banco!")
    process.exit(1)
  }
  console.log(`👤 Solicitante: ${gestor.nome} (${gestor.id})`)

  // Get next code number
  const lastTrl = await prisma.demanda.findFirst({
    where: { codigo: { startsWith: "TRL-" } },
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  })
  let codeNum = lastTrl ? parseInt(lastTrl.codigo.replace("TRL-", ""), 10) + 1 : 1

  // Filter open cards only
  const openCards = cards.filter((c) => !c.closed)
  console.log(`\n📊 Cards abertos: ${openCards.length} de ${cards.length} total`)

  // Stats
  let imported = 0, skipped = 0, skippedList = 0, errCount = 0

  // List distribution
  const listDistribution: Record<string, number> = {}
  for (const card of openCards) {
    const ln = listMap.get(card.idList) ?? "???"
    listDistribution[ln] = (listDistribution[ln] ?? 0) + 1
  }
  console.log("\n📂 Distribuição por lista:")
  for (const [name, count] of Object.entries(listDistribution)) {
    const skip = shouldSkipList(name) ? " ⏭️ SKIP" : ""
    console.log(`   ${name}: ${count}${skip}`)
  }

  console.log("\n🚀 Importando...\n")

  for (const card of openCards) {
    const listName = listMap.get(card.idList) ?? "Entrada"

    // Skip already imported
    if (importedSet.has(card.id)) {
      skipped++
      continue
    }

    // Skip template lists
    if (shouldSkipList(listName)) {
      skippedList++
      continue
    }

    try {
      const { statusVisivel, statusInterno } = resolveStatus(listName)
      const prioridade = resolvePrioridade(card.labels)
      const departamento = resolveDepartamento(card.labels)
      const codigo = `TRL-${String(codeNum++).padStart(4, "0")}`

      // Resolve editor
      const editorLabel = extractEditorLabel(card.labels)
      let editorId: string | null = null
      if (editorLabel) {
        const firstName = editorLabel.toLowerCase().split(" ")[0]
        editorId = editorLookup.get(firstName) ?? editorLookup.get(editorLabel.toLowerCase()) ?? null
      }

      // Drive link
      const driveLink = extractDriveLink(card.desc)

      // Description
      let descricao = card.desc || `Importado do Trello: ${card.name}`
      if (card.shortUrl) descricao += `\n\n📋 Trello: ${card.shortUrl}`

      // Create demand
      const demanda = await (prisma.demanda as any).create({
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
          solicitanteId: gestor.id,
          editorId,
          trelloCardId: card.id,
          dataLimite: card.due ? new Date(card.due) : null,
          linkBrutos: driveLink,
        },
      })

      // Import checklists
      const cardChecklists = checklistMap.get(card.id)
      if (cardChecklists && cardChecklists.length > 0) {
        const items: any[] = []
        let ordem = 0
        for (const cl of cardChecklists) {
          for (const item of cl.checkItems ?? []) {
            items.push({
              demandaId: demanda.id,
              texto: item.name.slice(0, 200),
              concluido: item.state === "complete",
              grupo: "geral",
              ordem: ordem++,
            })
          }
        }
        if (items.length > 0) {
          await (prisma.checklistItem as any).createMany({ data: items })
        }
      }

      const editorInfo = editorLabel ? ` [Editor: ${editorLabel}${editorId ? " ✓" : " ✗"}]` : ""
      const checkInfo = cardChecklists ? ` [${cardChecklists.reduce((s, c) => s + (c.checkItems?.length ?? 0), 0)} checklist items]` : ""
      console.log(`  ✅ ${codigo} | ${statusVisivel.padEnd(12)} | ${card.name.slice(0, 50)}${editorInfo}${checkInfo}`)
      imported++
    } catch (e) {
      const msg = e instanceof Error ? e.message : "?"
      console.log(`  ❌ ${card.name.slice(0, 50)}: ${msg.slice(0, 80)}`)
      errCount++
    }
  }

  console.log("\n" + "─".repeat(60))
  console.log(`✅ Importados: ${imported}`)
  console.log(`⏭️  Já existiam: ${skipped}`)
  console.log(`🚫 Listas ignoradas: ${skippedList}`)
  console.log(`❌ Erros: ${errCount}`)
  console.log(`📊 Total processados: ${openCards.length}`)

  await pool.end()
  process.exit(0)
}

main().catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})
