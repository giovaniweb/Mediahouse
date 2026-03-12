/**
 * Trello integration service
 * Sincroniza StatusVisível do VideoOps com listas do Trello
 */

const STATUS_TO_LIST: Record<string, string> = {
  entrada: "📥 Entrada",
  producao: "🎬 Em Produção",
  edicao: "✂️ Edição",
  aprovacao: "✅ Aprovação",
  para_postar: "📤 Para Postar",
  finalizado: "🏁 Finalizado",
}

export interface TrelloConfig {
  apiKey: string
  token: string
  boardId: string
}

async function trelloRequest(cfg: TrelloConfig, path: string, method = "GET", body?: object) {
  const base = `https://api.trello.com/1${path}`
  const url = new URL(base)
  url.searchParams.set("key", cfg.apiKey)
  url.searchParams.set("token", cfg.token)

  const res = await fetch(url.toString(), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Trello API error ${res.status}: ${text}`)
  }

  return res.json()
}

// Busca todas as listas do board
export async function getBoardLists(cfg: TrelloConfig): Promise<Array<{ id: string; name: string }>> {
  return trelloRequest(cfg, `/boards/${cfg.boardId}/lists`)
}

// Busca todos os cartões do board
export async function getBoardCards(cfg: TrelloConfig): Promise<Array<{ id: string; name: string; idList: string; desc: string }>> {
  return trelloRequest(cfg, `/boards/${cfg.boardId}/cards`)
}

// Cria cartão em uma lista
export async function createCard(cfg: TrelloConfig, listId: string, name: string, desc: string): Promise<{ id: string }> {
  return trelloRequest(cfg, "/cards", "POST", { idList: listId, name, desc })
}

// Move cartão para outra lista
export async function moveCard(cfg: TrelloConfig, cardId: string, listId: string) {
  return trelloRequest(cfg, `/cards/${cardId}`, "PUT", { idList: listId })
}

// Sincroniza uma demanda com o Trello
export async function syncDemandaTrello(
  cfg: TrelloConfig,
  demanda: { id: string; codigo: string; titulo: string; statusVisivel: string; descricao: string }
) {
  const lists = await getBoardLists(cfg)

  // Encontra a lista alvo pelo nome mapeado
  const listaAlvo = STATUS_TO_LIST[demanda.statusVisivel]
  const lista = lists.find((l) => l.name === listaAlvo || l.name.includes(demanda.statusVisivel))
  if (!lista) {
    console.warn(`[Trello] Lista não encontrada para status: ${demanda.statusVisivel}`)
    return null
  }

  const cards = await getBoardCards(cfg)
  // Busca cartão existente pelo código da demanda
  const cardExistente = cards.find((c) => c.name.includes(demanda.codigo))

  if (cardExistente) {
    // Move para a lista correta
    await moveCard(cfg, cardExistente.id, lista.id)
    return { action: "moved", cardId: cardExistente.id }
  } else {
    // Cria novo cartão
    const desc = `${demanda.descricao}\n\n---\nVideoOps ID: ${demanda.id}`
    const card = await createCard(cfg, lista.id, `[${demanda.codigo}] ${demanda.titulo}`, desc)
    return { action: "created", cardId: card.id }
  }
}

export { STATUS_TO_LIST }
