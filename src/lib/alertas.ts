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
 * Alertas de PENDÊNCIA: descrevem uma condição que continua verdadeira até
 * alguém agir. Cada um sabe dizer se ainda vale.
 *
 * `aindaVale` recebe o alerta e o contexto já carregado, e devolve `true` se o
 * alerta deve continuar ativo. Nada de consulta por alerta: o contexto vem
 * pronto de fora, senão resolver 700 alertas viraria 700 idas ao banco.
 */
type Contexto = {
  /** statusInterno da demanda do alerta (undefined = demanda não existe mais) */
  statusDemanda?: string
  /** a demanda ainda tem custo esperando decisão de pagamento? */
  temCustoAguardandoDecisao?: boolean
  /** o WhatsApp da empresa está conectado agora? */
  whatsappConectado?: boolean
}

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

  // Vale enquanto a demanda não tiver andado. Quem cria é o agente de alertas,
  // que reavalia todo dia — aqui basta fechar quando a demanda foi finalizada
  // ou sumiu.
  demanda_parada: (c) => !!c.statusDemanda && c.statusDemanda !== "encerrado",

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

/** Depois de quantos dias um alerta de fato deixa de ocupar a lista. */
export const DIAS_ATE_EXPIRAR_FATO = 7

/**
 * Fecha os alertas que deixaram de ser verdade.
 *
 * Com `demandaId`, olha só os alertas daquela demanda — é o uso normal, chamado
 * em segundo plano depois de uma mutação. Sem ele, varre a organização inteira:
 * é a rede de segurança do cron diário, e foi assim que a faxina dos 706 foi
 * feita.
 *
 * Devolve o que fechou, por motivo, para o chamador poder registrar.
 */
export async function resolverAlertas(
  organizacaoId: string | null | undefined,
  demandaId?: string
): Promise<{ pendencias: number; fatosExpirados: number }> {
  if (!organizacaoId) return { pendencias: 0, fatosExpirados: 0 }

  const ativos = await prisma.alertaIA.findMany({
    where: {
      organizacaoId,
      status: "ativo",
      ...(demandaId ? { demandaId } : {}),
      tipoAlerta: { in: Object.keys(TIPOS_PENDENTES) },
    },
    select: { id: true, tipoAlerta: true, demandaId: true },
  })

  let pendencias = 0

  if (ativos.length > 0) {
    // Contexto de todas as demandas citadas, numa consulta só.
    const idsDemanda = [...new Set(ativos.map((a) => a.demandaId).filter((d): d is string => !!d))]
    const demandas = idsDemanda.length
      ? await prisma.demanda.findMany({
          where: { id: { in: idsDemanda }, organizacaoId },
          select: {
            id: true,
            statusInterno: true,
            custos: { where: { statusPagamento: "nf_enviada" }, select: { id: true }, take: 1 },
          },
        })
      : []
    const porDemanda = new Map(demandas.map((d) => [d.id, d]))

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

    const paraFechar: string[] = []
    for (const alerta of ativos) {
      const d = alerta.demandaId ? porDemanda.get(alerta.demandaId) : undefined
      const vale = TIPOS_PENDENTES[alerta.tipoAlerta]({
        statusDemanda: d?.statusInterno,
        temCustoAguardandoDecisao: d ? d.custos.length > 0 : undefined,
        whatsappConectado,
      })
      if (!vale) paraFechar.push(alerta.id)
    }

    if (paraFechar.length > 0) {
      const r = await prisma.alertaIA.updateMany({
        where: { id: { in: paraFechar }, organizacaoId },
        data: { status: "resolvido", resolvedAt: new Date() },
      })
      pendencias = r.count
    }
  }

  // Fatos velhos saem da lista. Ficam no banco (o sino e o histórico continuam
  // enxergando) — só param de contar como pendência aberta.
  const limite = new Date(Date.now() - DIAS_ATE_EXPIRAR_FATO * 86_400_000)
  const expirados = await prisma.alertaIA.updateMany({
    where: {
      organizacaoId,
      status: "ativo",
      tipoAlerta: { in: TIPOS_FATO },
      createdAt: { lt: limite },
      ...(demandaId ? { demandaId } : {}),
    },
    data: { status: "resolvido", resolvedAt: new Date() },
  })

  return { pendencias, fatosExpirados: expirados.count }
}
