import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { executarAgenteComTools, MODELO_POTENTE, MODELO_RAPIDO } from "@/lib/claude"
import { executarFerramenta } from "@/lib/ia-tools-executor"

// GET /api/cron/agentes — automação periódica de agentes IA
// Protegido por CRON_SECRET. Configurado no vercel.json com 3 schedules:
// - alertas: cada 2h
// - prazos: todo dia 8h
// - vistoria: segunda 9h
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
    } else {
      return await rodarAgenteAlertas()
    }
  } catch (e) {
    console.error("[Cron] Erro:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

async function rodarAgenteAlertas() {
  const execucao = await prisma.agenteExecucao.create({
    data: { agente: "gerar-alertas-cron", status: "executando" },
  })

  const prompt = `Você é o sistema de monitoramento automático do VideoOps. Execute uma varredura rápida e objetiva:

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

  const prompt = `Vistoria semanal automática do VideoOps:

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
