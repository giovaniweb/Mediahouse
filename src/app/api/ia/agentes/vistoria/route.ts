import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { executarAgenteComTools, MODELO_POTENTE } from "@/lib/claude"
import { executarFerramenta } from "@/lib/ia-tools-executor"

export const maxDuration = 180

/**
 * POST /api/ia/agentes/vistoria
 * Agente de Vistoria: auditoria completa do sistema, identifica oportunidades
 * de melhoria de gestão, custo e produtividade — envia relatório ao gestor
 */
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const execucao = await prisma.agenteExecucao.create({
    data: { agente: "vistoria", status: "executando", criadoPor: session.user?.id },
  })

  try {
    const prompt = `Você é o Agente de Vistoria do Flow — um consultor de gestão e produtividade audiovisual. Faça uma auditoria COMPLETA e PROFUNDA do sistema.

## COLETA DE DADOS (execute todas estas buscas)

1. **Métricas gerais**: buscar_metricas — visão geral do sistema
2. **Pipeline completo**: buscar_demandas (sem filtros, limite=50) — estado atual
3. **Demandas em atraso**: buscar_demandas com em_atraso=true
4. **Projetos parados (3 dias)**: buscar_demandas com paradas_ha_dias=3
5. **Projetos parados (7 dias)**: buscar_demandas com paradas_ha_dias=7
6. **Performance da equipe**: buscar_videomakers — carga e custos
7. **Análise financeira 30 dias**: buscar_custos com dias=30
8. **Análise financeira 7 dias**: buscar_custos com dias=7
9. **Alertas ativos**: buscar_alertas
10. **Gestores**: listar_gestores — para enviar relatório

## ANÁLISES OBRIGATÓRIAS

### A) SAÚDE DO PIPELINE
- Taxa de demandas em atraso vs total ativo
- Status mais frequente onde as demandas ficam travadas
- Videomakers com maior carga vs disponibilidade
- Identificar gargalos sistêmicos (etapas que mais demoram)

### B) ANÁLISE DE CUSTOS
- Custo médio por tipo de vídeo
- Videomakers com melhor custo-benefício (custo vs avaliação)
- Tendência: últimos 7 dias vs média mensal
- Oportunidade de economia identificável

### C) PRODUTIVIDADE DA EQUIPE
- Quem está sobrecarregado (3+ demandas ativas)
- Quem está subutilizado (0-1 demandas)
- Videomakers sem atividade há 7+ dias
- Comparativo de ritmo de entrega

### D) OPORTUNIDADES DE MELHORIA (TOP 5)
Para cada oportunidade, seja específico:
- Problema identificado (com dados reais)
- Impacto estimado (% de melhoria)
- Ação recomendada (passos concretos)
- Prazo sugerido (imediato / esta semana / este mês)

### E) ALERTAS PARA CRIAR
Para cada problema crítico encontrado, use criar_alerta para registrar no sistema.

## ENVIO DE RELATÓRIO AO GESTOR

Após a análise completa, use listar_gestores para obter os telefones dos gestores.
Para cada gestor COM telefone, envie via enviar_whatsapp uma mensagem assim:

"🔍 *Flow — Vistoria do Sistema*

Realizei uma auditoria completa. Aqui está o resumo:

📊 *STATUS GERAL*
• {N} demandas ativas | {X} em atraso
• Saúde do sistema: {score}/100

⚠️ *PONTOS DE ATENÇÃO*
{top 3 problemas encontrados, 1 linha cada}

💡 *OPORTUNIDADES*
{top 2 melhorias sugeridas, 1 linha cada}

💰 *FINANCEIRO (30 dias)*
• Total: R$ {valor}
• Custo médio/vídeo: R$ {valor}

Relatório completo disponível no sistema. 📱"

## RETORNO FINAL

Retorne um relatório completo e detalhado com TODOS os dados coletados e análises feitas.
Seja específico, use números reais, nomes de demandas e videomakers.
Estruture em seções claras com emojis para facilitar leitura.
Inclua um "Score de Saúde Geral" de 0-100 com justificativa.`

    const { resposta, tokens, ferramentasUsadas } = await executarAgenteComTools(
      prompt,
      executarFerramenta,
      MODELO_POTENTE,
      20
    )

    // Salva também como RelatorioIA
    try {
      await prisma.relatorioIA.create({
        data: {
          tipo: "semanal",
          periodo: new Date().toLocaleDateString("pt-BR"),
          conteudo: { analise: resposta, ferramentas: ferramentasUsadas },
          tokens,
          modelo: MODELO_POTENTE,
        },
      })
    } catch { /* ignora se já existir */ }

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
    return NextResponse.json({ error: "Erro no agente de vistoria" }, { status: 500 })
  }
}
