import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { executarAgenteComTools, MODELO_POTENTE } from "@/lib/claude"
import { executarFerramenta } from "@/lib/ia-tools-executor"

export const maxDuration = 120

/**
 * POST /api/ia/agentes/prazos
 * Agente de Prazos: monitora deadlines nas próximas 24h, cobra atrasados
 * e motiva videomakers com projetos parados
 */
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const execucao = await prisma.agenteExecucao.create({
    data: { agente: "prazos", status: "executando", criadoPor: session.user?.id },
  })

  try {
    const prompt = `Você é o Agente de Prazos e Produtividade do VideoOps. Sua missão é garantir que os projetos avancem no tempo certo.

Execute as seguintes verificações OBRIGATÓRIAS em ordem:

## 1. DEMANDAS COM PRAZO NAS PRÓXIMAS 24H
Use buscar_demandas com em_atraso=false e depois filtre mentalmente, ou use buscar_demandas.
Sua tarefa: verificar quem tem dataLimite nas próximas 24 horas.
Para cada demanda encontrada:
- Se o videomaker tiver telefone, use enviar_whatsapp para avisá-lo:
  "⏰ *VideoOps — Lembrete de Prazo*\n\n📋 *{codigo}* — {titulo}\n\nSeu prazo vence em menos de 24 horas! Certifique-se de que está no caminho certo. 🎬\n\nQualquer problema, entre em contato."
- Crie um alerta no sistema com criar_alerta (severidade: aviso)

## 2. DEMANDAS ATRASADAS (prazo já venceu)
Use buscar_demandas com em_atraso=true.
Para cada demanda atrasada com videomaker cadastrado:
- Verifique quantos dias de atraso
- Se 1-2 dias: mensagem de cobrança gentil
- Se 3-5 dias: mensagem mais firme com pedido de posicionamento
- Se 6+ dias: mensagem urgente e crie alerta CRÍTICO
- Exemplos de mensagem:
  1-2 dias: "⚠️ *VideoOps — Prazo Vencido*\n\n📋 *{codigo}* — {titulo}\n\nO prazo desta demanda venceu ontem. Qual é o status atual? Por favor, atualize o sistema. 🙏"
  3-5 dias: "🔴 *VideoOps — Demanda Atrasada*\n\n📋 *{codigo}* — {titulo}\n\nEsta demanda está {N} dias atrasada. Precisamos de um posicionamento urgente. Entre em contato com o gestor imediatamente."
  6+ dias: "🚨 *VideoOps — URGENTE*\n\n📋 *{codigo}* — {titulo}\n\nDemanda com {N} dias de atraso! Por favor, entre em contato AGORA para resolver esta situação."

## 3. PROJETOS PARADOS (sem atualização há 3+ dias)
Use buscar_demandas com paradas_ha_dias=3.
Para videomakers com projetos parados:
- Mensagem motivacional e de suporte:
  "💪 *VideoOps — Projeto em Andamento*\n\n📋 *{codigo}* — {titulo}\n\nPercebemos que este projeto não teve atualizações nos últimos {N} dias. Está tudo bem? Precisa de algum suporte? Atualize o status no sistema quando puder."
- Crie alerta de aviso se parado há 5+ dias

## 4. NOTIFICAÇÃO AOS GESTORES
Após todas as verificações, use listar_gestores e envie um resumo para cada gestor com telefone:
"📊 *VideoOps — Resumo de Prazos*\n\n{resumo com: X vencendo hoje, Y atrasadas, Z paradas}"

## 5. RELATÓRIO FINAL
Retorne um resumo estruturado com:
- Quantas notificações foram enviadas
- Quantos alertas criados
- Lista de ações tomadas
- Recomendações de processo`

    const { resposta, tokens, ferramentasUsadas } = await executarAgenteComTools(
      prompt,
      executarFerramenta,
      MODELO_POTENTE,
      15
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

    return NextResponse.json({ sucesso: true, analise: resposta, tokens })
  } catch (err) {
    await prisma.agenteExecucao.update({
      where: { id: execucao.id },
      data: { status: "erro", erro: String(err), finishedAt: new Date() },
    })
    return NextResponse.json({ error: "Erro no agente de prazos" }, { status: 500 })
  }
}
