import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { executarAgenteComTools, MODELO_POTENTE, MODELO_RAPIDO } from "@/lib/claude"
import { executarFerramenta } from "@/lib/ia-tools-executor"
import { sendWhatsappMessage, templates } from "@/lib/whatsapp"

// GET /api/cron/agentes — automação periódica de agentes IA
// Protegido por CRON_SECRET. Configurado no vercel.json com 3 schedules:
// - alertas: diário 12h UTC (tb roda cobranca + briefing + vistoria toda segunda)
// - prazos: seg/qua/sex 12h UTC
// - lembretes: a cada 30 min
export async function GET(req: NextRequest) {
  // Verifica segredo do cron
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const agente = req.nextUrl.searchParams.get("agente") ?? "alertas"

  // Roda o agente solicitado para CADA organização ativa (isolamento multiempresa).
  const orgs = await prisma.organizacao.findMany({ where: { ativo: true }, select: { id: true } })
  const resultados: Array<Record<string, unknown>> = []

  for (const org of orgs) {
    try {
      let r: Record<string, unknown>
      if (agente === "prazos") r = await rodarAgentePrazos(org.id)
      else if (agente === "vistoria") r = await rodarAgenteVistoria(org.id)
      else if (agente === "cobranca") r = await rodarAgenteCobranca(org.id)
      else if (agente === "lembretes") r = await rodarAgenteLembretes(org.id)
      else if (agente === "briefing") r = await rodarAgenteBriefing(org.id)
      else if (agente === "limpeza") r = await rodarAgenteLimpeza(org.id)
      else r = await rodarAgenteAlertas(org.id)
      resultados.push({ organizacaoId: org.id, ...r })
    } catch (e) {
      console.error(`[Cron] Erro org ${org.id}:`, e)
      resultados.push({ organizacaoId: org.id, erro: String(e) })
    }
  }

  return NextResponse.json({ ok: true, agente, organizacoes: resultados.length, resultados })
}

async function rodarAgenteAlertas(organizacaoId: string) {
  // Limpar snoozes expirados antes de rodar
  await prisma.alertaIA.updateMany({
    where: { organizacaoId, status: "ativo", snoozeAte: { lt: new Date(), not: null } },
    data: { snoozeAte: null },
  })

  const execucao = await prisma.agenteExecucao.create({
    data: { agente: "gerar-alertas-cron", status: "executando" },
  })

  const prompt = `Você é o sistema de monitoramento automático do NuFlow. Execute uma varredura rápida e objetiva:

1. Use buscar_metricas para ver o estado geral
2. Use buscar_demandas com em_atraso=true — para cada uma, crie alerta crítico se não existir
3. Use buscar_demandas com paradas_ha_dias=3 — crie alertas de aviso
4. Se identificar sobrecarga de videomakers, crie alertas

Seja eficiente. Crie apenas alertas que ainda não existam. Retorne resumo das ações.`

  const { resposta, tokens, ferramentasUsadas } = await executarAgenteComTools(
    prompt, (n, i) => executarFerramenta(n, i, organizacaoId), MODELO_RAPIDO, 8
  )

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

  // Rodar cobrança, briefing e lembretes no mesmo cron (economiza slots do Vercel) — por org
  void rodarAgenteCobranca(organizacaoId).catch(e => console.error("[alertas] cobrança inline:", e))
  void rodarAgenteBriefing(organizacaoId).catch(e => console.error("[alertas] briefing inline:", e))
  void rodarAgenteLembretes(organizacaoId).catch(e => console.error("[alertas] lembretes inline:", e))

  return { agente: "alertas", tokens }
}

async function rodarAgentePrazos(organizacaoId: string) {
  const execucao = await prisma.agenteExecucao.create({
    data: { agente: "prazos-cron", status: "executando" },
  })

  const prompt = `Agente de Prazos automático — execute as verificações de prazos e notifique via WhatsApp:

1. buscar_demandas com em_atraso=true — envie mensagem de cobrança para cada videomaker atrasado
2. Verifique demandas com prazo nas próximas 24h — envie lembrete
3. buscar_demandas com paradas_ha_dias=3 — envie motivação para videomakers
4. listar_gestores — envie resumo geral para cada gestor

Use a ferramenta enviar_whatsapp para cada notificação. Seja direto e profissional.`

  const { resposta, tokens, ferramentasUsadas } = await executarAgenteComTools(
    prompt, (n, i) => executarFerramenta(n, i, organizacaoId), MODELO_POTENTE, 15
  )

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

  return { agente: "prazos", tokens }
}

async function rodarAgenteVistoria(organizacaoId: string) {
  const execucao = await prisma.agenteExecucao.create({
    data: { agente: "vistoria-cron", status: "executando" },
  })

  const prompt = `Vistoria semanal automática do NuFlow:

1. buscar_metricas — saúde geral
2. buscar_demandas — visão geral do pipeline
3. buscar_videomakers — performance da equipe
4. buscar_custos com dias=7 — financeiro da semana
5. listar_gestores — enviar relatório semanal via WhatsApp

Envie um resumo executivo completo para cada gestor usando enviar_whatsapp.
Inclua: demandas concluídas, em andamento, atrasadas, custo total, top videomakers.`

  const { resposta, tokens, ferramentasUsadas } = await executarAgenteComTools(
    prompt, (n, i) => executarFerramenta(n, i, organizacaoId), MODELO_POTENTE, 15
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

  return { agente: "lembretes", enviados }
}

// ── TDAH: Morning Briefing para Gestores ─────────────────────────────────
async function rodarAgenteBriefing(organizacaoId: string) {
  const agora = new Date()
  const inicioDia = new Date(agora)
  inicioDia.setHours(0, 0, 0, 0)
  const fimDia = new Date(agora)
  fimDia.setHours(23, 59, 59, 999)
  const fimAmanha = new Date(agora)
  fimAmanha.setDate(fimAmanha.getDate() + 1)
  fimAmanha.setHours(23, 59, 59, 999)

  // Buscar gestores com telefone (membros desta organização)
  const gestores = await prisma.usuario.findMany({
    where: {
      tipo: { in: ["admin", "gestor"] },
      status: "ativo",
      telefone: { not: null },
      organizacoes: { some: { organizacaoId } },
    },
    select: { id: true, nome: true, telefone: true },
  })

  if (gestores.length === 0) return { agente: "briefing", enviados: 0 }

  // Buscar dados em paralelo
  const [qtdEventos, qtdDemandas, qtdCobrancias] = await Promise.all([
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
        dataLimite: { gte: inicioDia, lte: fimAmanha },
        statusVisivel: { notIn: ["finalizado"] },
      },
    }),
    prisma.custoVideomaker.count({
      where: { organizacaoId, pago: false, dataVencimento: { not: null, lte: fimDia } },
    }),
  ])

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
      qtdCobrancias
    )
    await sendWhatsappMessage(telefone, mensagem, undefined, organizacaoId)
    enviados++
  }

  return { agente: "briefing", enviados }
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
