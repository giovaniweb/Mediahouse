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

  try {
    if (agente === "prazos") {
      return await rodarAgentePrazos()
    } else if (agente === "vistoria") {
      return await rodarAgenteVistoria()
    } else if (agente === "cobranca") {
      return await rodarAgenteCobranca()
    } else if (agente === "lembretes") {
      return await rodarAgenteLembretes()
    } else if (agente === "briefing") {
      return await rodarAgenteBriefing()
    } else {
      return await rodarAgenteAlertas()
    }
  } catch (e) {
    console.error("[Cron] Erro:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

async function rodarAgenteAlertas() {
  // Limpar snoozes expirados antes de rodar
  await prisma.alertaIA.updateMany({
    where: { status: "ativo", snoozeAte: { lt: new Date(), not: null } },
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
    prompt, executarFerramenta, MODELO_RAPIDO, 8
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

  // Rodar cobrança e briefing dentro do mesmo cron (economiza slots do Vercel)
  void rodarAgenteCobranca().catch(e => console.error("[alertas] cobrança inline:", e))
  void rodarAgenteBriefing().catch(e => console.error("[alertas] briefing inline:", e))

  // Segunda-feira: rodar vistoria semanal também
  const diaSemana = new Date().getDay() // 0=dom, 1=seg
  if (diaSemana === 1) {
    void rodarAgenteVistoria().catch(e => console.error("[alertas] vistoria inline:", e))
  }

  return NextResponse.json({ ok: true, agente: "alertas", tokens })
}

async function rodarAgentePrazos() {
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
    prompt, executarFerramenta, MODELO_POTENTE, 15
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

  return NextResponse.json({ ok: true, agente: "prazos", tokens })
}

async function rodarAgenteVistoria() {
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
    prompt, executarFerramenta, MODELO_POTENTE, 15
  )

  // Salva como RelatorioIA
  try {
    await prisma.relatorioIA.create({
      data: {
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

  return NextResponse.json({ ok: true, agente: "vistoria", tokens })
}

// ── TDAH: Cobrança Automática com Escalada ────────────────────────────────
async function rodarAgenteCobranca() {
  const agora = new Date()
  const inicioDia = new Date(agora)
  inicioDia.setHours(0, 0, 0, 0)

  const custos = await prisma.custoVideomaker.findMany({
    where: { pago: false, dataVencimento: { not: null } },
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
      await sendWhatsappMessage(telefone, mensagem, undefined)
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

  return NextResponse.json({ ok: true, agente: "cobranca", enviados })
}

// ── TDAH: Lembretes de Eventos via WhatsApp ───────────────────────────────
async function rodarAgenteLembretes() {
  const agora = new Date()
  const em2h = new Date(agora.getTime() + 2 * 60 * 60 * 1000)

  const eventos = await prisma.evento.findMany({
    where: {
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
    await sendWhatsappMessage(telefone, mensagem, evento.demandaId ?? undefined)
    await prisma.evento.update({ where: { id: evento.id }, data: { lembreteEnviado: true } })
    enviados++
  }

  return NextResponse.json({ ok: true, agente: "lembretes", enviados })
}

// ── TDAH: Morning Briefing para Gestores ─────────────────────────────────
async function rodarAgenteBriefing() {
  const agora = new Date()
  const inicioDia = new Date(agora)
  inicioDia.setHours(0, 0, 0, 0)
  const fimDia = new Date(agora)
  fimDia.setHours(23, 59, 59, 999)
  const fimAmanha = new Date(agora)
  fimAmanha.setDate(fimAmanha.getDate() + 1)
  fimAmanha.setHours(23, 59, 59, 999)

  // Buscar gestores com telefone
  const gestores = await prisma.usuario.findMany({
    where: {
      tipo: { in: ["admin", "gestor"] },
      status: "ativo",
      telefone: { not: null },
    },
    select: { id: true, nome: true, telefone: true },
  })

  if (gestores.length === 0) return NextResponse.json({ ok: true, agente: "briefing", enviados: 0 })

  // Buscar dados em paralelo
  const [qtdEventos, qtdDemandas, qtdCobrancias] = await Promise.all([
    prisma.evento.count({
      where: {
        inicio: { gte: inicioDia, lte: fimDia },
        status: { in: ["agendado", "confirmado", "em_andamento"] },
      },
    }),
    prisma.demanda.count({
      where: {
        dataLimite: { gte: inicioDia, lte: fimAmanha },
        statusVisivel: { notIn: ["finalizado"] },
      },
    }),
    prisma.custoVideomaker.count({
      where: { pago: false, dataVencimento: { not: null, lte: fimDia } },
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
    await sendWhatsappMessage(telefone, mensagem, undefined)
    enviados++
  }

  return NextResponse.json({ ok: true, agente: "briefing", enviados })
}
