import { prisma } from "@/lib/prisma"

/**
 * Resolução automática de alertas.
 *
 * O AlertaIA era gravado uma vez e nunca mais olhava para a realidade. Em
 * 18/08/2026 a base tinha 751 alertas, 706 ainda "ativos", e apenas 18 haviam
 * sido resolvidos em toda a história — o mais velho estava ativo há 151 dias.
 * Dos 173 alertas de `aprovacao_pendente` ativos, 172 falavam de demandas que já
 * tinham sido aprovadas.
 *
 * O efeito prático é pior do que ruído: quem abre a Central de Alertas vê
 * centenas de itens dos quais quase todos são mentira, e aprende a não abrir. O
 * sistema detectava as demandas paradas e ninguém via, porque o aviso verdadeiro
 * estava enterrado entre os falsos.
 *
 * Só existia um ponto no sistema inteiro que resolvia alerta sozinho
 * (`videomakers/[id]/aprovar`, quando o videomaker é aprovado). Este módulo
 * generaliza esse padrão.
 */

/** Estados da demanda em que o alerta de aprovação interna ainda faz sentido. */
const AGUARDANDO_APROVACAO = ["aguardando_aprovacao_interna", "urgencia_pendente_aprovacao"]

/**
 * O que cada regra precisa saber para decidir. O contexto vem pronto de fora:
 * resolver 700 alertas não pode virar 700 idas ao banco.
 */
type Contexto = {
  /** statusInterno da demanda do alerta (undefined = demanda não existe mais) */
  statusDemanda?: string
  /** a demanda ainda tem custo esperando decisão de pagamento? */
  temCustoAguardandoDecisao?: boolean
  /** o WhatsApp da empresa está conectado agora? */
  whatsappConectado?: boolean
  /** quando o alerta foi criado */
  alertaCriadoEm?: Date
  /** `updatedAt` da demanda — última vez que alguém mexeu nela */
  demandaMexidaEm?: Date
}

/**
 * Alertas de PENDÊNCIA: descrevem uma condição que continua verdadeira até
 * alguém agir. Devolve `true` se o alerta deve continuar ativo.
 */
export const TIPOS_PENDENTES: Record<string, (ctx: Contexto) => boolean> = {
  // Vale enquanto a demanda estiver esperando decisão.
  aprovacao_pendente: (c) => !!c.statusDemanda && AGUARDANDO_APROVACAO.includes(c.statusDemanda),
  urgencia_pendente: (c) => !!c.statusDemanda && AGUARDANDO_APROVACAO.includes(c.statusDemanda),

  // Vale enquanto a demanda estiver com ajuste pedido.
  ajuste_solicitado: (c) => c.statusDemanda === "ajuste_solicitado",

  // O alerta é sobre a DECISÃO de pagar, não sobre o dinheiro sair: nasce em
  // `nf_enviada` ("NF recebida, aguardando aprovação interna") e a aprovação
  // move para `aguardando_pagamento`. Usar `pago` aqui manteria o alerta aberto
  // por semanas depois de alguém já ter decidido.
  pagamento_pendente: (c) => c.temCustoAguardandoDecisao === true,

  // "Esta demanda não anda há N dias." Deixa de ser verdade no instante em que
  // ela anda — isto é, quando alguém mexe nela DEPOIS de o alerta ser criado.
  //
  // A primeira versão desta regra só fechava com a demanda encerrada, e por isso
  // deixaria 274 alertas de pé: demanda destravada, alerta imortal.
  demanda_parada: (c) => {
    if (!c.statusDemanda) return false
    if (c.statusDemanda === "encerrado") return false
    if (!c.demandaMexidaEm || !c.alertaCriadoEm) return true
    return c.demandaMexidaEm <= c.alertaCriadoEm
  },

  // Valem enquanto o WhatsApp estiver fora do ar. Note que estes não têm
  // demandaId: são da empresa, não de uma demanda.
  whatsapp_desconectado: (c) => c.whatsappConectado === false,
  whatsapp_webhook_rejeitado: (c) => c.whatsappConectado === false,

  // Já resolvido no ponto da ação desde antes deste módulo; fica aqui para o
  // caso de algum escapar (ex.: videomaker aprovado por outro caminho).
  novo_videomaker_pendente: () => true,
}

/**
 * Alertas de FATO: descrevem algo que aconteceu. Não há o que fazer a respeito,
 * então nunca houve condição para deixarem de valer — e é por isso que entopem a
 * lista. São material de sino (`/api/notificacoes`, que filtra por `lida`), não
 * de lista de pendências.
 *
 * Em vez de sumirem na hora (o sino precisa deles), expiram por idade.
 */
export const TIPOS_FATO = [
  "video_aprovado",
  "nova_demanda_audiovisual",
  "demanda_externa",
  "demanda_email",
  "nf_recebida",
  "mencao_comentario",
  "whatsapp_reconectou",
]

/** Depois de quantos dias um alerta sem condição própria sai da lista. */
export const DIAS_ATE_EXPIRAR_FATO = 7

/**
 * Tipos que ninguém declarou também expiram por idade.
 *
 * A ferramenta `criar_alerta` da IA grava `tipoAlerta: input.tipo` — o modelo
 * escolhe a string. Por isso a base tem tipos que não aparecem em lugar nenhum
 * do código: `capacidade_baixa`, `sobrecarga_editor`, `processo_falho`,
 * `processo_quebrado`, `dados_incompletos`, `cadastro_incompleto`, e mais meia
 * dúzia — cerca de 80 alertas em 18/08/2026, e o agente cria mais todo dia.
 *
 * Um alerta cujo tipo não se sabe avaliar não pode viver para sempre: é
 * exatamente assim que a lista chegou a 706. Sem condição conhecida, a regra é a
 * mais conservadora que ainda termina — sai da lista por idade.
 */
export function ehTipoConhecido(tipo: string): boolean {
  return tipo in TIPOS_PENDENTES || TIPOS_FATO.includes(tipo)
}

// ─── Motor ───────────────────────────────────────────────────────────────────

type AlertaAtivo = { id: string; tipoAlerta: string; demandaId: string | null; createdAt: Date }
type DemandaCtx = { statusInterno: string; updatedAt: Date; custos: { id: string }[] }

/** Carrega, de uma vez, tudo que as regras vão precisar olhar. */
async function carregarContexto(organizacaoId: string, demandaId?: string) {
  // Todos os ativos, de qualquer tipo. Filtrar por `TIPOS_PENDENTES` aqui era o
  // que deixava os tipos inventados pela IA fora do alcance do resolvedor.
  const ativos: AlertaAtivo[] = await prisma.alertaIA.findMany({
    where: { organizacaoId, status: "ativo", ...(demandaId ? { demandaId } : {}) },
    select: { id: true, tipoAlerta: true, demandaId: true, createdAt: true },
  })

  const idsDemanda = [...new Set(ativos.map((a) => a.demandaId).filter((d): d is string => !!d))]
  const demandas = idsDemanda.length
    ? await prisma.demanda.findMany({
        where: { id: { in: idsDemanda }, organizacaoId },
        select: {
          id: true,
          statusInterno: true,
          updatedAt: true,
          custos: { where: { statusPagamento: "nf_enviada" }, select: { id: true }, take: 1 },
        },
      })
    : []
  const porDemanda = new Map<string, DemandaCtx>(demandas.map((d) => [d.id, d]))

  // O estado do WhatsApp só é consultado se algum alerta depender dele.
  let whatsappConectado: boolean | undefined
  if (ativos.some((a) => a.tipoAlerta.startsWith("whatsapp_"))) {
    const cfg = await prisma.configWhatsapp.findFirst({
      where: { organizacaoId },
      select: { lastStatus: true, telefoneConectado: true },
    })
    // `lastStatus: "open"` mente quando não há celular pareado — a instância
    // sobe e se diz aberta sem sessão nenhuma. `telefoneConectado` é o que
    // prova que existe um aparelho do outro lado.
    whatsappConectado = cfg?.lastStatus === "open" && !!cfg.telefoneConectado
  }

  return { ativos, porDemanda, whatsappConectado }
}

/** `true` = este alerta deve fechar. Único lugar onde o critério mora. */
function deveFechar(
  alerta: AlertaAtivo,
  porDemanda: Map<string, DemandaCtx>,
  whatsappConectado: boolean | undefined,
  limiteIdade: Date
): boolean {
  const regra = TIPOS_PENDENTES[alerta.tipoAlerta]

  if (regra) {
    const d = alerta.demandaId ? porDemanda.get(alerta.demandaId) : undefined
    return !regra({
      statusDemanda: d?.statusInterno,
      temCustoAguardandoDecisao: d ? d.custos.length > 0 : undefined,
      whatsappConectado,
      alertaCriadoEm: alerta.createdAt,
      demandaMexidaEm: d?.updatedAt,
    })
  }

  // Fato declarado ou tipo que ninguém declarou: sai por idade.
  return alerta.createdAt < limiteIdade
}

/**
 * Fecha os alertas que deixaram de ser verdade.
 *
 * Com `demandaId`, olha só os alertas daquela demanda — é o uso normal, chamado
 * em segundo plano depois de uma mutação. Sem ele, varre a organização inteira:
 * é a rede de segurança do cron diário, e é o que a faxina única roda.
 */
export async function resolverAlertas(
  organizacaoId: string | null | undefined,
  demandaId?: string
): Promise<{ pendencias: number; expirados: number }> {
  if (!organizacaoId) return { pendencias: 0, expirados: 0 }

  const { ativos, porDemanda, whatsappConectado } = await carregarContexto(organizacaoId, demandaId)
  if (ativos.length === 0) return { pendencias: 0, expirados: 0 }

  const limiteIdade = new Date(Date.now() - DIAS_ATE_EXPIRAR_FATO * 86_400_000)
  const paraFechar: string[] = []
  let pendencias = 0
  let expirados = 0

  for (const alerta of ativos) {
    if (!deveFechar(alerta, porDemanda, whatsappConectado, limiteIdade)) continue
    paraFechar.push(alerta.id)
    if (TIPOS_PENDENTES[alerta.tipoAlerta]) pendencias++
    else expirados++
  }

  // Em lotes: `IN` com centenas de ids numa consulta só é o tipo de coisa que
  // passa em teste com 10 linhas e estoura na faxina com 700.
  const TAMANHO_LOTE = 200
  for (let i = 0; i < paraFechar.length; i += TAMANHO_LOTE) {
    await prisma.alertaIA.updateMany({
      where: { id: { in: paraFechar.slice(i, i + TAMANHO_LOTE) }, organizacaoId },
      data: { status: "resolvido", resolvedAt: new Date() },
    })
  }

  return { pendencias, expirados }
}

/**
 * O que a resolução faria, sem escrever nada.
 *
 * Existe para a simulação da faxina responder "quantos fechariam" em vez de
 * "quantos existem" — que é a pergunta de quem está prestes a mexer em 700
 * linhas de uma vez. Usa o mesmo `deveFechar` da execução, senão a simulação
 * prometeria uma coisa e a faxina faria outra.
 */
export async function simularResolucao(organizacaoId: string): Promise<{
  total: number
  fecharia: Record<string, number>
  ficaria: Record<string, number>
}> {
  const { ativos, porDemanda, whatsappConectado } = await carregarContexto(organizacaoId)
  const limiteIdade = new Date(Date.now() - DIAS_ATE_EXPIRAR_FATO * 86_400_000)

  const fecharia: Record<string, number> = {}
  const ficaria: Record<string, number> = {}
  let total = 0

  for (const alerta of ativos) {
    if (deveFechar(alerta, porDemanda, whatsappConectado, limiteIdade)) {
      fecharia[alerta.tipoAlerta] = (fecharia[alerta.tipoAlerta] ?? 0) + 1
      total++
    } else {
      ficaria[alerta.tipoAlerta] = (ficaria[alerta.tipoAlerta] ?? 0) + 1
    }
  }

  return { total, fecharia, ficaria }
}
