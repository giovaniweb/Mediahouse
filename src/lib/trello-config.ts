// Credenciais do Trello — com dono explícito.
//
// `config_trello` não tem coluna de organização, e as três rotas de integração
// liam a config com `findFirst({ ativo: true })`: qualquer gestor de qualquer
// empresa pegava a primeira linha que existisse. Quando não havia linha nenhuma,
// caíam em TRELLO_API_KEY/TRELLO_BOARD_ID do ambiente — um board só, o mesmo
// para a plataforma inteira.
//
// Na prática isso significava que o gestor de uma empresa nova podia importar os
// cards do Trello de OUTRA como demandas dele, e que o "sincronizar" mandava o
// pipeline dele para o quadro alheio. O lote 1 escopou a consulta de demandas
// dessa sincronização; faltava o outro lado — o destino continuava sendo o board
// de sempre.
//
// Enquanto a tabela não tem dono (Fase 2), o dono é declarado: TRELLO_ORG diz de
// quem é o board, por slug. Sem a variável, é a organização padrão da instalação
// — que é exatamente quem usa o Trello hoje. Para todas as outras empresas a
// integração responde "não configurada", que é a verdade.
import { prisma } from "@/lib/prisma"
import { SLUG_ORG_PADRAO } from "@/lib/org"

export type CredenciaisTrello = { apiKey: string; token: string; boardId: string }

export type ConfigTrelloResolvida =
  | { ok: true; cfg: CredenciaisTrello; listMapping: Record<string, string> | null }
  | { ok: false; erro: string; status: number }

const SLUG_DONO = process.env.TRELLO_ORG || SLUG_ORG_PADRAO

/**
 * Devolve as credenciais do Trello se — e só se — a organização informada for a
 * dona do board. Qualquer outra recebe "não configurada", nunca as credenciais
 * de terceiros.
 */
export async function configTrelloDaOrg(organizacaoId: string): Promise<ConfigTrelloResolvida> {
  const dona = await prisma.organizacao.findUnique({
    where: { slug: SLUG_DONO },
    select: { id: true },
  })

  if (!dona || dona.id !== organizacaoId) {
    return {
      ok: false,
      status: 400,
      erro:
        "Integração com o Trello não configurada para esta empresa. " +
        "O board atual pertence a outra organização.",
    }
  }

  const dbConfig = await prisma.configTrello
    .findFirst({ where: { ativo: true }, orderBy: { createdAt: "desc" } })
    .catch(() => null)

  const apiKey = dbConfig?.apiKey ?? process.env.TRELLO_API_KEY
  const token = dbConfig?.token ?? process.env.TRELLO_TOKEN
  const boardId = dbConfig?.boardId ?? process.env.TRELLO_BOARD_ID

  if (!apiKey || !token || !boardId) {
    return { ok: false, status: 400, erro: "Trello não configurado" }
  }

  return {
    ok: true,
    cfg: { apiKey, token, boardId },
    listMapping: (dbConfig?.listMapping as Record<string, string> | null) ?? null,
  }
}
