// Espelhamento cross-tenant — a camada de decisão.
//
// Uma demanda da empresa A pode ser EXECUTADA pela empresa B sem mudar de dono.
// O que existe é uma aresta (`DemandaCompartilhamento`) sob uma parceria aceita
// (`ParceriaOrganizacao`). O banco impõe as duas coisas — políticas e gatilhos
// da migration `20260908000000` —, e este arquivo é o lado da aplicação.
//
// POR QUE A APLICAÇÃO PRECISA REPETIR O QUE O BANCO JÁ FAZ: `RLS_ATIVO` está
// DESLIGADO em produção até a Virada B. Enquanto estiver, o banco devolve
// qualquer linha e quem isola é exclusivamente o `where` daqui. Depois da
// virada, os dois concordam. Em nenhum momento existe só uma camada.
//
// A REGRA DE ADOÇÃO É OPT-IN, ROTA A ROTA. `requireDemandaOrg` continua sendo o
// padrão; trocá-lo em massa por `requireDemandaAcesso` abriria de uma vez rotas
// que não devem abrir — custo, nota fiscal, exclusão, edição de briefing. Ver
// PLANO-ESPELHAMENTO-CROSS-TENANT.md §2.1 para a tabela do que abre e do que não.
import { NextResponse } from "next/server"
import type { Prisma, EscopoCompartilhamento } from "@prisma/client"
import type { Session } from "next-auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

/** De que lado da mesa a empresa ativa está, neste card. */
export type PapelNoCard = "dona" | "espelho"

export type AcessoDemanda = {
  /** A empresa ativa da sessão. */
  organizacaoId: string
  papel: PapelNoCard
  /** Quem é a DONA do card. Igual a `organizacaoId` quando `papel === "dona"`. */
  donaId: string
  /** O escopo da aresta. `null` quando a empresa ativa é a dona. */
  escopo: EscopoCompartilhamento | null
  /** Nome da outra empresa, para a tela. `null` quando não há espelho. */
  nomeContraparte: string | null
}

/**
 * Filtro de demandas que inclui o que esta empresa EXECUTA por espelhamento.
 *
 * Substitui `{ organizacaoId }` só onde o espelho deve aparecer — Kanban, lista,
 * tabela. NÃO usar em métricas, relatórios nem custos: o card espelhado continua
 * sendo produção da dona, e contá-lo dos dois lados faria a plataforma somar
 * cada job duas vezes. Ver §2.4.
 */
export function escopoComEspelho(organizacaoId: string): Prisma.DemandaWhereInput {
  return {
    OR: [
      { organizacaoId },
      { compartilhamentos: { some: { organizacaoDestinoId: organizacaoId, revogadoEm: null } } },
    ],
  }
}

/** O que a tela precisa saber para desenhar a tag. Nada além disso. */
export type EspelhoDoCard = {
  papel: "origem" | "destino"
  contraparte: string
  escopo: EscopoCompartilhamento
}

/**
 * Traduz as arestas de uma demanda no chip de UMA empresa.
 *
 * Recebe só os campos denormalizados (`nomeOrigem`/`nomeDestino`) de propósito:
 * as relações `origem`/`destino` do modelo ATRAVESSAM a fronteira de empresa, e
 * incluí-las num payload que vai para o outro lado é o vazamento que os rótulos
 * congelados existem para evitar.
 */
export function espelhoDoCard(
  compartilhamentos: Array<{
    organizacaoOrigemId: string
    organizacaoDestinoId: string
    nomeOrigem: string
    nomeDestino: string
    escopo: EscopoCompartilhamento
    revogadoEm: Date | null
  }> | undefined,
  organizacaoId: string
): EspelhoDoCard | null {
  const ativos = (compartilhamentos ?? []).filter((c) => c.revogadoEm === null)
  // Do lado de quem executa a resposta é única — a aresta que aponta para mim.
  const meu = ativos.find((c) => c.organizacaoDestinoId === organizacaoId)
  if (meu) return { papel: "destino", contraparte: meu.nomeOrigem, escopo: meu.escopo }
  // Do lado da dona pode haver mais de uma no futuro; hoje o chip mostra a
  // primeira, e o detalhe do card lista todas.
  const dela = ativos.find((c) => c.organizacaoOrigemId === organizacaoId)
  if (dela) return { papel: "origem", contraparte: dela.nomeDestino, escopo: dela.escopo }
  return null
}

/** O `select` mínimo para alimentar `espelhoDoCard`. */
export const SELECT_ESPELHO = {
  organizacaoOrigemId: true,
  organizacaoDestinoId: true,
  nomeOrigem: true,
  nomeDestino: true,
  escopo: true,
  revogadoEm: true,
} as const

const naoEncontrado = () => NextResponse.json({ error: "Não encontrado" }, { status: 404 })

/**
 * Ownership de demanda que ACEITA espelho — irmão de `requireDemandaOrg`.
 *
 * `minimo` diz o que a rota exige: `acompanhar` para leitura, `executar` para
 * qualquer mudança.
 *
 * Sobre os códigos HTTP, que aqui não são detalhe:
 *
 *   sem aresta          → **404**. Um 403 confirmaria que aquele id existe, que
 *                         é exatamente o que as quatro tentativas de IDOR do
 *                         Passo 3 do plano de voo provaram não vazar.
 *   aresta insuficiente → **403**. Quem só acompanha JÁ enxerga o card; fingir
 *                         que ele não existe seria mentira, e mentira que gera
 *                         chamado de suporte.
 */
export async function requireDemandaAcesso(
  session: Session | null,
  demandaId: string,
  minimo: EscopoCompartilhamento
): Promise<AcessoDemanda | NextResponse> {
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    select: { organizacaoId: true },
  })
  if (!demanda) return naoEncontrado()

  if (demanda.organizacaoId === organizacaoId) {
    return { organizacaoId, papel: "dona", donaId: organizacaoId, escopo: null, nomeContraparte: null }
  }

  const aresta = await prisma.demandaCompartilhamento.findFirst({
    where: { demandaId, organizacaoDestinoId: organizacaoId, revogadoEm: null },
    select: { escopo: true, organizacaoOrigemId: true, nomeOrigem: true },
  })
  if (!aresta) return naoEncontrado()

  if (minimo === "executar" && aresta.escopo !== "executar") {
    return NextResponse.json(
      { error: `Você acompanha esta demanda de ${aresta.nomeOrigem}, mas não executa.` },
      { status: 403 }
    )
  }

  return {
    organizacaoId,
    papel: "espelho",
    donaId: aresta.organizacaoOrigemId,
    escopo: aresta.escopo,
    nomeContraparte: aresta.nomeOrigem,
  }
}
