// Rodada dos crons por todas as empresas (Onda 2A, 21/10/2026).
//
// Os crons de agentes e da caixa do WhatsApp atendiam uma página só — 10 e 20
// empresas — e devolviam `nextCursor` para "o agendador" continuar. A Vercel
// nunca chama de volta com o cursor, então da 11ª empresa em diante ninguém
// recebia aviso automático.
//
// Agora a rodada lê as empresas em páginas até o tempo acabar. Se o tempo acaba
// antes, ela se encadeia: depois de responder, chama a própria rota com o
// cursor de onde parou (`after`, que a Vercel mantém vivo até terminar). Cada
// elo é uma chamada nova, com o próprio maxDuration. O número de elos tem teto,
// para um erro nunca virar laço sem fim.
import { after, type NextRequest } from "next/server"

export const MAX_ELOS = 50

type Opcoes<O extends { id: string }, R> = {
  /** Próxima página de empresas depois do cursor, em ordem de id. */
  listar: (cursor: string | null, quantidade: number) => Promise<O[]>
  processar: (org: O) => Promise<R>
  /** Não começa empresa nova depois deste tempo desde o início. */
  orcamentoMs: number
  cursor?: string | null
  tamanhoPagina?: number
  agora?: () => number
}

/** `proximoCursor` nulo = todas atendidas; senão, a última empresa atendida. */
export async function percorrerEmpresas<O extends { id: string }, R>(o: Opcoes<O, R>): Promise<{ resultados: R[]; proximoCursor: string | null }> {
  const agora = o.agora ?? Date.now
  const tamanho = o.tamanhoPagina ?? 50
  const inicio = agora()
  const resultados: R[] = []
  let cursor = o.cursor ?? null
  for (;;) {
    const pagina = await o.listar(cursor, tamanho)
    for (const org of pagina) {
      if (agora() - inicio > o.orcamentoMs) return { resultados, proximoCursor: cursor }
      resultados.push(await o.processar(org))
      cursor = org.id
    }
    if (pagina.length < tamanho) return { resultados, proximoCursor: null }
  }
}

/** O elo atual da cadeia (0 = a chamada da Vercel). */
export function eloDaRequisicao(req: NextRequest): number {
  const n = Number(req.nextUrl.searchParams.get("elo"))
  return Number.isInteger(n) && n > 0 ? n : 0
}

/** O endereço do próximo elo: a mesma rota, com o cursor e o elo seguinte. */
export function urlDoProximoElo(req: NextRequest, cursor: string): URL | null {
  const elo = eloDaRequisicao(req) + 1
  if (elo > MAX_ELOS) return null
  const url = new URL(req.nextUrl.toString())
  url.searchParams.set("cursor", cursor)
  url.searchParams.set("elo", String(elo))
  return url
}

/**
 * Agenda o próximo elo para depois da resposta. Devolve se agendou. O segredo
 * do cron vai no cabeçalho, como na chamada da Vercel; a URL não leva nada.
 */
export function encadear(req: NextRequest, cursor: string | null): boolean {
  const segredo = process.env.CRON_SECRET
  const url = cursor && segredo ? urlDoProximoElo(req, cursor) : null
  if (!url) {
    if (cursor) console.error(`[cron] ${req.nextUrl.pathname}: parou no elo ${eloDaRequisicao(req)} com empresas por atender`)
    return false
  }
  after(async () => {
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${segredo}` }, redirect: "error", signal: AbortSignal.timeout(10_000) })
      if (!res.ok) console.error(`[cron] elo ${url.searchParams.get("elo")} de ${url.pathname} respondeu ${res.status}`)
    } catch (e) {
      // O elo seguinte segue rodando do outro lado mesmo se a espera estourar;
      // aqui só se registra que a chamada não foi confirmada.
      if (!(e instanceof Error && e.name === "TimeoutError")) console.error(`[cron] elo de ${url.pathname} não saiu`, e)
    }
  })
  return true
}
