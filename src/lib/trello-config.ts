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

// Dono do board declarado por variável, para o caso de a config ainda não estar
// no banco. Continua existindo porque `config_trello` está vazia em produção: a
// integração roda pelas variáveis de ambiente, que são de uma empresa só.
const SLUG_DONO = process.env.TRELLO_ORG || SLUG_ORG_PADRAO

/**
 * Devolve as credenciais do Trello desta organização.
 *
 * Ordem: a configuração DELA no banco vem primeiro — desde a Fase 2 a tabela
 * tem coluna de empresa, então cada uma pode ter o próprio board. Sem linha no
 * banco, sobra a queda para as variáveis de ambiente, que valem só para a
 * empresa declarada em TRELLO_ORG. Qualquer outra recebe "não configurada" —
 * nunca a credencial de terceiros.
 */
export async function configTrelloDaOrg(organizacaoId: string): Promise<ConfigTrelloResolvida> {
  const doBanco = await prisma.configTrello
    .findFirst({ where: { organizacaoId, ativo: true }, orderBy: { createdAt: "desc" } })
    .catch(() => null)

  if (doBanco) {
    return {
      ok: true,
      cfg: { apiKey: doBanco.apiKey, token: doBanco.token, boardId: doBanco.boardId },
      listMapping: (doBanco.listMapping as Record<string, string> | null) ?? null,
    }
  }

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
        "Conecte um board em Configurações → Trello.",
    }
  }

  const apiKey = process.env.TRELLO_API_KEY
  const token = process.env.TRELLO_TOKEN
  const boardId = process.env.TRELLO_BOARD_ID

  if (!apiKey || !token || !boardId) {
    return { ok: false, status: 400, erro: "Trello não configurado" }
  }

  return { ok: true, cfg: { apiKey, token, boardId }, listMapping: null }
}
