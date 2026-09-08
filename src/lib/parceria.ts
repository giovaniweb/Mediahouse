// Parceria entre empresas — o aperto de mão que precede o espelhamento.
//
// Uma demanda só pode ser espelhada para uma empresa com quem a dona já tem
// parceria ACEITA. O gatilho `compartilhamento_derivar_origem` recusa a aresta
// sem isso, então a regra vale mesmo para um script ou uma rota nova que
// esqueça de conferir: a rota é uma porta, o gatilho é a parede.
//
// Sem esta camada, qualquer empresa da plataforma jogaria card no Kanban de
// qualquer outra — e a empresa de destino descobriria que a de origem existe no
// instante em que um card aparecesse no quadro dela.
import { prisma } from "@/lib/prisma"
// Resolver a empresa parceira pelo SLUG usa o cliente de autenticação, e a razão
// é a mesma de `orgPublica`: `organizacoes_a_propria` devolve só a própria
// empresa, então perguntar "qual é o id da empresa X" pelo cliente normal não
// tem resposta. `prismaAuth` enxerga três tabelas, só leitura — é o role feito
// para resolver empresa antes de haver empresa.
import { prismaAuth } from "@/lib/prisma-auth"
import type { StatusParceria } from "@prisma/client"

/**
 * Quem decide parceria e terceirização.
 *
 * É gestão, não uma `PermissaoKey` nova. Duas razões: o ato é comercial e vale
 * para a empresa inteira (não é "mover card", que é operação), e uma chave nova
 * obrigaria a tocar todos os presets e a tela de permissões para expressar algo
 * que hoje só admin e gestor fazem. Vira chave no dia em que alguém precisar
 * conceder isso a um papel específico — não antes.
 */
export function ehGestaoDaEmpresa(papel: string | null | undefined): boolean {
  return papel === "admin" || papel === "gestor"
}

export type ParceiroVisivel = {
  parceriaId: string
  organizacaoId: string
  nome: string
  status: StatusParceria
  /** Esta empresa convidou, ou foi convidada? Decide quem pode aceitar. */
  papel: "convidante" | "convidada"
  criadoEm: Date
  respondidoEm: Date | null
}

/**
 * As parcerias desta empresa, dos dois lados, já traduzidas para "quem é o
 * outro". A tela nunca precisa saber se a empresa está na coluna de convidante
 * ou de convidada — só quem é o parceiro e o que dá para fazer.
 *
 * Os nomes saem dos rótulos congelados na própria linha. Ler `organizacoes` da
 * contraparte não é possível, e é assim de propósito.
 */
export async function parceriasDaEmpresa(
  organizacaoId: string,
  status?: StatusParceria[]
): Promise<ParceiroVisivel[]> {
  const linhas = await prisma.parceriaOrganizacao.findMany({
    where: {
      OR: [{ organizacaoConvidanteId: organizacaoId }, { organizacaoConvidadaId: organizacaoId }],
      ...(status ? { status: { in: status } } : {}),
    },
    orderBy: { criadoEm: "desc" },
  })

  return linhas.map((p) => {
    const souConvidante = p.organizacaoConvidanteId === organizacaoId
    return {
      parceriaId: p.id,
      organizacaoId: souConvidante ? p.organizacaoConvidadaId : p.organizacaoConvidanteId,
      nome: souConvidante ? p.nomeConvidada : p.nomeConvidante,
      status: p.status,
      papel: souConvidante ? ("convidante" as const) : ("convidada" as const),
      criadoEm: p.criadoEm,
      respondidoEm: p.respondidoEm,
    }
  })
}

/** As empresas para quem esta pode terceirizar hoje. */
export async function parceirosAtivos(organizacaoId: string): Promise<ParceiroVisivel[]> {
  const todas = await parceriasDaEmpresa(organizacaoId, ["aceita"])
  return todas
}

/**
 * Resolve a empresa a convidar a partir do slug que a pessoa digitou.
 *
 * Devolve só id e nome — nunca a linha inteira. `organizacoes` vai ganhar plano
 * e assinatura, e uma função de convite não tem por que enxergar isso.
 */
export async function resolverEmpresaPorSlug(
  slug: string
): Promise<{ id: string; nome: string } | null> {
  const alvo = slug.trim().toLowerCase()
  if (!alvo) return null
  const org = await prismaAuth.organizacao.findUnique({
    where: { slug: alvo },
    select: { id: true, nome: true, ativo: true },
  })
  if (!org?.ativo) return null
  return { id: org.id, nome: org.nome }
}
