import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { executarAgenteComTools, MODELO_POTENTE, MODELO_RAPIDO } from "@/lib/claude"
import { executarFerramenta } from "@/lib/ia-tools-executor"
import { sendWhatsappMessage, templates } from "@/lib/whatsapp"
import { hojeEmSaoPaulo, inicioDoDia, janelaDoDiaSeguinte, somarDias } from "@/lib/datas"
import { resolverAlertas } from "@/lib/alertas"
import { resumirParados, textoDeParados, DIAS_PARA_COBRAR } from "@/lib/parados"

// As versões manuais destes mesmos agentes declaram 120-180s; a versão cron, que
// roda para TODAS as organizações em série, não declarava nada e herdava o
// padrão da conta. É por isso que a rota precisa de uma varredura de execuções
// presas: a função morria no meio e deixava a linha em "executando" para sempre.
export const maxDuration = 300

// GET /api/cron/agentes — automação periódica de agentes IA
// Protegido por CRON_SECRET. Cada agente tem seu próprio schedule no vercel.json
// (alertas, prazos, vistoria, limpeza, cobranca, lembretes, briefing). Cada execução
// itera todas as organizações ativas (isolamento multiempresa) e uma falha numa org
// não interrompe as demais. Agentes NÃO se chamam entre si — sem execução dupla.
export async function GET(req: NextRequest) {
  // Verifica segredo do cron — falha FECHADA: sem CRON_SECRET configurado a rota
  // não roda (antes, a ausência da variável deixava o endpoint público e qualquer
  // um podia disparar agentes de IA para todas as organizações).
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 })
  }
  const authHeader = req.headers.get("authorization") ?? ""
  const esperado = `Bearer ${cronSecret}`
  const bufA = Buffer.from(authHeader)
  const bufB = Buffer.from(esperado)
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const agente = req.nextUrl.searchParams.get("agente") ?? "alertas"

  // Fecha execuções que ficaram presas em "executando" — a função serverless morre
  // no meio (timeout, deploy) e ninguém fecha a linha. Sem esta varredura elas se
  // acumulam para sempre e falseiam qualquer leitura de saúde dos agentes.
  await prisma.agenteExecucao.updateMany({
    where: { status: "executando", createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } },
    data: { status: "erro", erro: "Execução interrompida (função encerrada antes de concluir)", finishedAt: new Date() },
  }).catch((e) => console.error("[Cron] Falha ao limpar execuções presas:", e))

  // Roda o agente solicitado para CADA organização ativa (isolamento multiempresa).
  const orgs = await prisma.organizacao.findMany({ where: { ativo: true }, select: { id: true } })
  const resultados: Array<Record<string, unknown>> = []

  for (const org of orgs) {
    try {
      let r: Record<string, unknown>
      if (agente === "prazos") r = await rodarAgentePrazos(org.id)
      else if (agente === "vistoria") r = await rodarAgenteVistoria(org.id)
      else if (agente === "cobranca") r = await registrarExecucao("cobranca-cron", () => rodarAgenteCobranca(org.id))
      else if (agente === "lembretes") r = await registrarExecucao("lembretes-cron", () => rodarAgenteLembretes(org.id))
      else if (agente === "briefing") r = await registrarExecucao("briefing-cron", () => rodarAgenteBriefing(org.id))
      else if (agente === "limpeza") r = await registrarExecucao("limpeza-cron", () => rodarAgenteLimpeza(org.id))
      else r = await rodarAgenteAlertas(org.id)
      resultados.push({ organizacaoId: org.id, ...r })
    } catch (e) {
      console.error(`[Cron] Erro org ${org.id}:`, e)
      resultados.push({ organizacaoId: org.id, erro: String(e) })
    }
  }

  return NextResponse.json({ ok: true, agente, organizacoes: resultados.length, resultados })
}

/**
 * Roda um agente de IA registrando início, fim E FALHA.
 *
 * Antes, o `update` para "concluido" vinha depois da chamada à IA, sem try/catch:
 * se ela lançasse, a linha ficava "executando" para sempre. Foi o que criou a
 * necessidade da varredura de execuções presas e do script
 * prisma/limpar-execucoes-presas.mjs. A versão manual do mesmo agente
 * (api/ia/agentes/prazos) já gravava "erro" corretamente.
 */
async function rodarComRegistro(
  agente: string,
  executar: () => Promise<{ resposta: string; tokens: number; ferramentasUsadas: string[] }>
): Promise<{ resposta: string; tokens: number }> {
  const execucao = await prisma.agenteExecucao.create({
    data: { agente, status: "executando" },
  })

  try {
    const { resposta, tokens, ferramentasUsadas } = await executar()
    await prisma.agenteExecucao.update({
      where: { id: execucao.id },
      data: {
        status: "concluido",
        resultado: { analise: resposta },
        tokens,
        ferramentas: ferramentasUsadas,
        finishedAt: new Date(),
      },
    })
    return { resposta, tokens }
  } catch (e) {
    await prisma.agenteExecucao.update({
      where: { id: execucao.id },
      data: {
        status: "erro",
        erro: e instanceof Error ? e.message : String(e),
        finishedAt: new Date(),
      },
    }).catch((err) => console.error(`[Cron] Falha ao registrar erro de ${agente}:`, err))
    throw e
  }
}

/**
 * Registra a execução de um agente que não usa IA (cobrança, lembretes,
 * briefing, limpeza).
 *
 * Estes quatro só deixavam vestígio quando ACHAVAM trabalho: sem custo vencido,
 * a cobrança rodava e não gravava nada. O efeito colateral é que a pergunta
 * "esse cron chegou a ser registrado na Vercel?" não tinha resposta dentro do
 * sistema — em 16/08/2026 dava para provar que alertas, prazos, vistoria e
 * briefing rodavam, e era impossível dizer o mesmo dos outros. Agora toda
 * execução deixa linha, inclusive a que não fez nada, e a resposta mora aqui.
 */
async function registrarExecucao<T extends Record<string, unknown>>(
  agente: string,
  executar: () => Promise<T>
): Promise<T> {
  const execucao = await prisma.agenteExecucao.create({
    data: { agente, status: "executando" },
  })

  try {
    const resultado = await executar()
    await prisma.agenteExecucao.update({
      where: { id: execucao.id },
      // Prisma.InputJsonObject: o resultado é sempre um objeto raso de contadores.
      data: { status: "concluido", resultado: resultado as Prisma.InputJsonObject, finishedAt: new Date() },
    })
    return resultado
  } catch (e) {
    await prisma.agenteExecucao.update({
      where: { id: execucao.id },
      data: {
        status: "erro",
        erro: e instanceof Error ? e.message : String(e),
        finishedAt: new Date(),
      },
    }).catch((err) => console.error(`[Cron] Falha ao registrar erro de ${agente}:`, err))
    throw e
  }
}

async function rodarAgenteAlertas(organizacaoId: string) {
  // Limpar snoozes expirados antes de rodar
  await prisma.alertaIA.updateMany({
    where: { organizacaoId, status: "ativo", snoozeAte: { lt: new Date(), not: null } },
    data: { snoozeAte: null },
  })

  // Fechar o que deixou de ser verdade ANTES de a IA olhar a lista. Duas razões:
  // a IA recebe a instrução "crie apenas alertas que ainda não existam" e
  // precisa de uma lista limpa para isso funcionar, e é a rede de segurança para
  // qualquer mutação que não tenha passado pelo resolvedor em segundo plano.
  const fechados = await resolverAlertas(organizacaoId)
  if (fechados.pendencias || fechados.expirados) {
    console.log(`[Cron] Alertas fechados: ${fechados.pendencias} pendência(s), ${fechados.expirados} expirado(s) por idade`)
  }

  const prompt = `Você é o sistema de monitoramento automático do NuFlow. Execute uma varredura rápida e objetiva:

1. Use buscar_metricas para ver o estado geral
2. Use buscar_demandas com em_atraso=true — para cada uma, crie alerta crítico se não existir
3. Use buscar_demandas com paradas_ha_dias=3 — crie alertas de aviso
4. Se identificar sobrecarga de videomakers, crie alertas

Seja eficiente. Crie apenas alertas que ainda não existam. Retorne resumo das ações.`

  const { tokens } = await rodarComRegistro("gerar-alertas-cron", () =>
    executarAgenteComTools(prompt, (n, i) => executarFerramenta(n, i, organizacaoId), MODELO_RAPIDO, 8)
  )

  // NOTA: cobrança, briefing e lembretes têm crons dedicados próprios no vercel.json
  // (agente=cobranca/briefing/lembretes). Não rodar inline aqui — evita execução dupla
  // diária (e WhatsApp duplicado) que ocorria quando este piggyback existia.

  return { agente: "alertas", tokens }
}

async function rodarAgentePrazos(organizacaoId: string) {
  const prompt = `Agente de Prazos automático — execute as verificações de prazos e notifique via WhatsApp:

1. buscar_demandas com em_atraso=true — envie mensagem de cobrança para cada videomaker atrasado
2. Verifique demandas com prazo nas próximas 24h — envie lembrete
3. buscar_demandas com paradas_ha_dias=3 — envie motivação para videomakers
4. listar_gestores — envie resumo geral para cada gestor

Use a ferramenta enviar_whatsapp para cada notificação. Seja direto e profissional.`

  const { tokens } = await rodarComRegistro("prazos-cron", () =>
    executarAgenteComTools(prompt, (n, i) => executarFerramenta(n, i, organizacaoId), MODELO_POTENTE, 15)
  )

  return { agente: "prazos", tokens }
}

async function rodarAgenteVistoria(organizacaoId: string) {
  const prompt = `Vistoria semanal automática do NuFlow:

1. buscar_metricas — saúde geral
2. buscar_demandas — visão geral do pipeline
3. buscar_videomakers — performance da equipe
4. buscar_custos com dias=7 — financeiro da semana
5. listar_gestores — enviar relatório semanal via WhatsApp

Envie um resumo executivo completo para cada gestor usando enviar_whatsapp.
Inclua: demandas concluídas, em andamento, atrasadas, custo total, top videomakers.`

  const { resposta, tokens } = await rodarComRegistro("vistoria-cron", () =>
    executarAgenteComTools(prompt, (n, i) => executarFerramenta(n, i, organizacaoId), MODELO_POTENTE, 15)
  )

  // Salva como RelatorioIA
  try {
    await prisma.relatorioIA.create({
      data: {
        organizacaoId,
        tipo: "semanal",
        periodo: new Date().toLocaleDateString("pt-BR"),
        conteudo: { analise: resposta, auto: true },
        tokens,
        modelo: MODELO_POTENTE,
      },
    })
  } catch { /* ignora duplicata */ }

  return { agente: "vistoria", tokens }
}

// ── TDAH: Cobrança Automática com Escalada ────────────────────────────────
async function rodarAgenteCobranca(organizacaoId: string) {
  const agora = new Date()
  const inicioDia = new Date(agora)
  inicioDia.setHours(0, 0, 0, 0)

  const custos = await prisma.custoVideomaker.findMany({
    where: { organizacaoId, pago: false, dataVencimento: { not: null } },
    include: { videomaker: { select: { nome: true, telefone: true } } },
  })

  let enviados = 0

  for (const custo of custos) {
    if (!custo.dataVencimento) continue
    const vm = custo.videomaker
    const telefone = vm.telefone
    if (!telefone) continue

    const diffMs = agora.getTime() - custo.dataVencimento.getTime()
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    // Evitar duplo envio no mesmo dia
    if (custo.ultimaCobrancaEm) {
      const ultimaCobranca = new Date(custo.ultimaCobrancaEm)
      ultimaCobranca.setHours(0, 0, 0, 0)
      if (ultimaCobranca.getTime() === inicioDia.getTime()) continue
    }

    const valor = custo.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
    const descricao = custo.descricao ?? `Custo ${custo.tipo}`
    let mensagem: string | null = null

    if (diffDias <= -3 && diffDias >= -4) {
      // 3-4 dias antes: aviso antecipado
      const dataFmt = custo.dataVencimento.toLocaleDateString("pt-BR")
      mensagem = templates.cobrancaAntecipada(vm.nome, descricao, valor, dataFmt)
    } else if (diffDias === 0) {
      // No dia do vencimento
      mensagem = templates.cobrancaVencida(vm.nome, descricao, valor, 0)
    } else if (diffDias === 3) {
      // 3 dias de atraso
      mensagem = templates.cobrancaVencida(vm.nome, descricao, valor, 3)
    } else if (diffDias === 7) {
      // 7 dias: escalada (tom mais firme)
      mensagem = templates.cobrancaEscalada(vm.nome, descricao, valor, 7)
    }

    if (mensagem) {
      await sendWhatsappMessage(telefone, mensagem, custo.demandaId ?? undefined, organizacaoId)
      await prisma.custoVideomaker.update({
        where: { id: custo.id },
        data: {
          ultimaCobrancaEm: agora,
          qtdCobranças: { increment: 1 },
        },
      })
      enviados++
    }
  }

  return { agente: "cobranca", enviados }
}

// ── TDAH: Lembretes de Eventos via WhatsApp ───────────────────────────────
async function rodarAgenteLembretes(organizacaoId: string) {
  const agora = new Date()
  const em2h = new Date(agora.getTime() + 2 * 60 * 60 * 1000)

  const eventos = await prisma.evento.findMany({
    where: {
      organizacaoId,
      lembreteEnviado: false,
      inicio: { gte: agora, lte: em2h },
      status: { in: ["agendado", "confirmado"] },
    },
    include: {
      videomaker: { select: { nome: true, telefone: true } },
    },
  })

  let enviados = 0

  for (const evento of eventos) {
    const minutosParaInicio = Math.round((evento.inicio.getTime() - agora.getTime()) / 60000)
    const lembrete = evento.lembreteMinutos ?? 60

    // Janela de ±15 minutos ao redor do momento ideal
    if (Math.abs(minutosParaInicio - lembrete) > 15) continue

    const vm = evento.videomaker
    const telefone = vm?.telefone
    if (!telefone) {
      // Marca como enviado mesmo sem telefone para não repetir
      await prisma.evento.update({ where: { id: evento.id }, data: { lembreteEnviado: true } })
      continue
    }

    const mensagem = templates.lembreteEvento(evento.titulo, minutosParaInicio, evento.local ?? null)
    await sendWhatsappMessage(telefone, mensagem, evento.demandaId ?? undefined, organizacaoId)
    await prisma.evento.update({ where: { id: evento.id }, data: { lembreteEnviado: true } })
    enviados++
  }

  const captacoes = await lembrarCaptacoesDeAmanha(organizacaoId)
  return { agente: "lembretes", enviados, captacoes }
}

/**
 * Avisa quem vai captar amanhã.
 *
 * A tela de Configurações prometia "Captação agendada — lembrete 24h antes"
 * desde sempre, e o template `captacaoLembrete` existia em lib/whatsapp.ts —
 * mas nenhuma rota e nenhum cron o chamavam. A promessa estava na tela e o
 * videomaker nunca recebeu esse lembrete. O agente de lembretes só olhava o
 * model Evento (agenda), que é outra coisa e hoje está vazio.
 *
 * Roda uma vez por dia, então o recorte é "as captações de amanhã" — não uma
 * janela de 24h contadas na hora, que exigiria cron de hora em hora.
 */
async function lembrarCaptacoesDeAmanha(organizacaoId: string) {
  const FUSO = "America/Sao_Paulo"
  const agora = new Date()
  // Amanhã no fuso de São Paulo, não em UTC: depois das 21h de Brasília o dia
  // em UTC já virou e o lembrete sairia com um dia de erro. A conta mora em
  // lib/datas.ts, coberta por teste.
  const { inicio, fim } = janelaDoDiaSeguinte(agora)

  const demandas = await prisma.demanda.findMany({
    where: {
      organizacaoId,
      dataCaptacao: { gte: inicio, lte: fim },
      statusInterno: { notIn: ["encerrado", "expirado", "videomaker_recusou"] },
      videomakerId: { not: null },
    },
    select: {
      id: true, codigo: true, titulo: true, dataCaptacao: true,
      localGravacao: true, cidade: true,
      videomaker: { select: { telefone: true } },
    },
  })

  let enviados = 0
  for (const d of demandas) {
    const telefone = d.videomaker?.telefone
    if (!telefone || !d.dataCaptacao) continue

    // Sem campo "lembreteEnviado" na Demanda — e sem migration para isto. Se o
    // cron rodar duas vezes no mesmo dia, a mensagem já registrada segura a
    // segunda: mesma demanda, mesmo texto, últimas 20h.
    const jaAvisado = await prisma.mensagemWhatsapp.findFirst({
      where: {
        demandaId: d.id,
        direcao: "saida",
        conteudo: { startsWith: "⏰ Amanhã você tem captação" },
        createdAt: { gte: new Date(agora.getTime() - 20 * 60 * 60 * 1000) },
      },
      select: { id: true },
    }).catch(() => null)
    if (jaAvisado) continue

    const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(d.dataCaptacao)
    const local = d.localGravacao || d.cidade || "local a confirmar"
    await sendWhatsappMessage(
      telefone,
      templates.captacaoLembrete(d.codigo, d.titulo, `às ${hora}`, local),
      d.id,
      organizacaoId
    ).catch(() => null)
    enviados++
  }

  return enviados
}

// ── TDAH: Morning Briefing para Gestores ─────────────────────────────────
async function rodarAgenteBriefing(organizacaoId: string) {
  const agora = new Date()
  const inicioDia = new Date(agora)
  inicioDia.setHours(0, 0, 0, 0)
  const fimDia = new Date(agora)
  fimDia.setHours(23, 59, 59, 999)
  const hoje = hojeEmSaoPaulo(agora)

  // Quem recebe o briefing. Além de admin/gestor, entra o líder audiovisual:
  // triagem é trabalho dele também, e o briefing passou a cobrar justamente as
  // demandas paradas na triagem — cobrar sem avisar quem executa não faz sentido.
  const gestores = await prisma.usuario.findMany({
    where: {
      status: "ativo",
      telefone: { not: null },
      organizacoes: {
        some: {
          organizacaoId,
          OR: [{ papel: { in: ["admin", "gestor"] } }, { liderAudiovisual: true }],
        },
      },
    },
    select: { id: true, nome: true, telefone: true },
  })

  if (gestores.length === 0) return { agente: "briefing", enviados: 0 }

  const limiteParada = new Date(agora.getTime() - DIAS_PARA_COBRAR * 86_400_000)

  // Buscar dados em paralelo
  const [qtdEventos, qtdDemandas, qtdCobrancias, paradas, prazoVencido] = await Promise.all([
    prisma.evento.count({
      where: {
        organizacaoId,
        inicio: { gte: inicioDia, lte: fimDia },
        status: { in: ["agendado", "confirmado", "em_andamento"] },
      },
    }),
    prisma.demanda.count({
      where: {
        organizacaoId,
        // Prazo é gravado como meia-noite UTC — a janela "hoje e amanhã"
        // precisa ser por dia, não pelo relógio do servidor.
        dataLimite: { gte: inicioDoDia(hoje), lte: inicioDoDia(somarDias(hoje, 1)) },
        statusVisivel: { notIn: ["finalizado"] },
      },
    }),
    prisma.custoVideomaker.count({
      where: { organizacaoId, pago: false, dataVencimento: { not: null, lte: fimDia } },
    }),
    // Paradas: sem ninguém mexer há mais de uma semana e ainda não entregues.
    prisma.demanda.findMany({
      where: {
        organizacaoId,
        statusVisivel: { not: "finalizado" },
        updatedAt: { lt: limiteParada },
      },
      select: { codigo: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.demanda.count({
      where: {
        organizacaoId,
        statusVisivel: { not: "finalizado" },
        dataLimite: { lt: inicioDoDia(hoje) },
      },
    }),
  ])

  const resumoParados = resumirParados(
    paradas.map((d) => ({ codigo: d.codigo, atualizadaEm: d.updatedAt })),
    prazoVencido,
    agora
  )
  const blocoParados = textoDeParados(resumoParados)

  const diasSemana = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
  const diaSemana = diasSemana[agora.getDay()]
  const dataFormatada = `${diaSemana}, ${agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`

  let enviados = 0
  for (const gestor of gestores) {
    const telefone = gestor.telefone
    if (!telefone) continue
    const mensagem = templates.briefingDiario(
      gestor.nome.split(" ")[0],
      dataFormatada,
      qtdEventos,
      qtdDemandas,
      qtdCobrancias,
      blocoParados
    )
    await sendWhatsappMessage(telefone, mensagem, undefined, organizacaoId)
    enviados++
  }

  return { agente: "briefing", enviados, parados: resumoParados.total }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENTE LIMPEZA — 20 dias pós-finalização: avisa Luana + Giovani sobre brutos
// ─────────────────────────────────────────────────────────────────────────────
async function rodarAgenteLimpeza(organizacaoId: string) {
  const agora = new Date()
  const limite20dias = new Date(agora.getTime() - 20 * 24 * 60 * 60 * 1000)
  const limite5diasDepoisAviso = new Date(agora.getTime() - 5 * 24 * 60 * 60 * 1000)

  // Notifica os gestores/admins DA ORGANIZAÇÃO (antes era número fixo)
  const telefonesLimpeza = (await prisma.usuario.findMany({
    where: { tipo: { in: ["admin", "gestor"] }, status: "ativo", telefone: { not: null }, organizacoes: { some: { organizacaoId } } },
    select: { telefone: true },
  })).map(g => g.telefone).filter((t): t is string => !!t)

  // 1. Demandas finalizadas há 20+ dias, com pasta brutos, sem aviso enviado
  const paraAvisar = await prisma.demanda.findMany({
    where: {
      organizacaoId,
      statusVisivel: "finalizado",
      linkFolderBrutos: { not: null },
      limpezaNotificadaEm: null,
      finalizadaEm: { lte: limite20dias },
    },
    select: { id: true, codigo: true, titulo: true, linkFolderBrutos: true },
  })

  let avisados = 0
  for (const d of paraAvisar) {
    const msg = `⚠️ *NuFlow — Aviso de Limpeza de Brutos*\n\nA demanda *${d.codigo} — ${d.titulo}* foi finalizada há 20 dias.\n\n📂 A pasta *[Material Bruto]* será removida do sistema em *5 dias*.\nLink atual: ${d.linkFolderBrutos}\n\nSe precisar manter os arquivos, faça backup antes!`
    for (const tel of telefonesLimpeza) {
      await sendWhatsappMessage(tel, msg, d.id, organizacaoId).catch(() => null)
    }
    await prisma.demanda.update({ where: { id: d.id }, data: { limpezaNotificadaEm: agora } })
    avisados++
  }

  // 2. Demandas avisadas há 5+ dias → remover referência de brutos
  const paraLimpar = await prisma.demanda.findMany({
    where: {
      organizacaoId,
      statusVisivel: "finalizado",
      limpezaNotificadaEm: { lte: limite5diasDepoisAviso },
      limpezaExecutadaEm: null,
    },
    select: { id: true, codigo: true, titulo: true },
  })

  let limpos = 0
  for (const d of paraLimpar) {
    await prisma.demanda.update({
      where: { id: d.id },
      data: { linkFolderBrutos: null, limpezaExecutadaEm: agora },
    })
    const msg = `🗑️ *NuFlow — Brutos Removidos*\n\nO link da pasta *[Material Bruto]* da demanda *${d.codigo} — ${d.titulo}* foi removido do sistema conforme aviso enviado há 5 dias.`
    for (const tel of telefonesLimpeza) {
      await sendWhatsappMessage(tel, msg, d.id, organizacaoId).catch(() => null)
    }
    limpos++
  }

  return { agente: "limpeza", avisados, limpos }
}
