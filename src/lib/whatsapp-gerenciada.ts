// Evolution gerenciada: a instância de uma empresa nova no servidor do NuFlow.
//
// A chave MESTRA (EVOLUTION_API_KEY) abre todas as instâncias do servidor —
// inclusive a da Contourline. Até 30/10/2026 ela era gravada na configuração de
// cada empresa nova, e o admin dessa empresa podia levá-la embora (ver a trava
// em api/configuracoes/whatsapp). Agora ela só é usada aqui, no servidor, para
// criar a instância e descobrir a chave DELA; a empresa guarda só essa.
//
// A Evolution v2 aceita no cabeçalho `apikey` a chave mestra ou a chave da
// própria instância, e a da instância só vale para ela.

type Instancia = { chave: string } | { erro: string }

const TEMPO = 10_000

/** A chave da instância no corpo da Evolution: v2 manda `hash` (texto); v1, `hash.apikey`. */
function chaveDoCriado(corpo: unknown): string | null {
  const hash = (corpo as { hash?: unknown } | null)?.hash
  if (typeof hash === "string" && hash) return hash
  const apikey = (hash as { apikey?: unknown } | null | undefined)?.apikey
  return typeof apikey === "string" && apikey ? apikey : null
}

/** A chave de uma instância já existente: v2 lista `{ name, token }`; v1, `{ instance: { instanceName, apikey } }`. */
function chaveDaLista(corpo: unknown, nome: string): string | null {
  const lista = Array.isArray(corpo) ? corpo : [corpo]
  for (const item of lista as Record<string, unknown>[]) {
    const v1 = item?.instance as Record<string, unknown> | undefined
    const nomeItem = item?.name ?? v1?.instanceName
    const chave = item?.token ?? v1?.apikey
    if (nomeItem === nome && typeof chave === "string" && chave) return chave
  }
  return null
}

/**
 * Cria (ou acha) a instância `nome` no servidor gerenciado e devolve a chave
 * dela. Nunca devolve a chave mestra: sem a chave da instância, é erro.
 */
export async function chaveDaInstanciaGerenciada(url: string, chaveMestra: string, nome: string): Promise<Instancia> {
  const base = url.replace(/\/$/, "")
  const headers = { apikey: chaveMestra, "Content-Type": "application/json" }
  const caminho = encodeURIComponent(nome)
  try {
    const estado = await fetch(`${base}/instance/connectionState/${caminho}`, { headers, signal: AbortSignal.timeout(TEMPO) })
    if (estado.status === 404) {
      const criado = await fetch(`${base}/instance/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({ instanceName: nome, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
        signal: AbortSignal.timeout(TEMPO),
      })
      if (!criado.ok) return { erro: `Não foi possível criar a instância "${nome}" (${criado.status}).` }
      const chave = chaveDoCriado(await criado.json().catch(() => null))
      return chave ? { chave } : { erro: `A Evolution criou "${nome}" mas não devolveu a chave da instância.` }
    }
    if (!estado.ok) return { erro: `A Evolution respondeu ${estado.status} ao consultar "${nome}".` }

    const lista = await fetch(`${base}/instance/fetchInstances?instanceName=${caminho}`, { headers, signal: AbortSignal.timeout(TEMPO) })
    if (!lista.ok) return { erro: `A Evolution respondeu ${lista.status} ao listar "${nome}".` }
    const chave = chaveDaLista(await lista.json().catch(() => null), nome)
    return chave ? { chave } : { erro: `A instância "${nome}" existe, mas a Evolution não devolveu a chave dela.` }
  } catch (e) {
    return { erro: `Erro ao falar com a Evolution: ${e instanceof Error ? e.message : String(e)}` }
  }
}
