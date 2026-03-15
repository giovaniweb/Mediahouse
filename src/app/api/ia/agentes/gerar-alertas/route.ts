import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { executarAgenteComTools, MODELO_POTENTE } from "@/lib/claude"
import { executarFerramenta } from "@/lib/ia-tools-executor"

export const maxDuration = 120

// POST /api/ia/agentes/gerar-alertas
// Agente autônomo que varre o sistema e gera AlertaIA para problemas encontrados
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  // Registra execução
  const execucao = await prisma.agenteExecucao.create({
    data: { agente: "gerar_alertas", status: "executando", criadoPor: session.user?.id },
  })

  try {
    const prompt = `Você é o Agente de Vigilância do Flow. Sua missão é analisar o estado atual do sistema e gerar alertas para TODOS os problemas que encontrar.

EXECUTE as seguintes análises usando as ferramentas disponíveis:

1. **Demandas paradas**: Use buscar_demandas com paradas_ha_dias=3 para encontrar demandas sem atualização há 3+ dias. Para cada uma que não seja status final, crie um alerta.

2. **Demandas em atraso**: Use buscar_demandas com em_atraso=true. Para cada uma crie um alerta crítico.

3. **Urgências sem ação**: Use buscar_demandas com prioridade=urgente. Verifique se há urgências paradas.

4. **Capacidade da equipe**: Use buscar_videomakers para verificar se algum videomaker está sobrecarregado (3+ demandas ativas).

5. **Custos anômalos**: Use buscar_custos para identificar gastos acima do normal.

6. **Saúde geral**: Use buscar_metricas para avaliar o estado geral e criar alerta se saúde < 70.

Para CADA problema encontrado, use a ferramenta criar_alerta com:
- tipo: categoria clara do problema
- mensagem: descrição específica com dados (ex: "Demanda VID-042 parada há 5 dias em 'editando'")
- severidade: info/aviso/critico baseado no impacto
- acao_sugerida: o que fazer para resolver

Seja sistemático e crie alertas para TODOS os problemas encontrados. No final, forneça um resumo de quantos alertas foram criados e os principais problemas identificados.`

    const { resposta, tokens, ferramentasUsadas } = await executarAgenteComTools(
      prompt,
      executarFerramenta,
      MODELO_POTENTE,
      12
    )

    // Conta alertas gerados nesta execução (últimos 2 min)
    const doisminsAtras = new Date(Date.now() - 2 * 60000)
    const alertasGerados = await prisma.alertaIA.count({
      where: { createdAt: { gte: doisminsAtras } },
    })

    await prisma.agenteExecucao.update({
      where: { id: execucao.id },
      data: {
        status: "concluido",
        resultado: { resumo: resposta },
        tokens,
        alertasGerados,
        ferramentas: ferramentasUsadas,
        finishedAt: new Date(),
      },
    })

    return NextResponse.json({
      sucesso: true,
      alertasGerados,
      resumo: resposta,
      tokens,
    })
  } catch (err) {
    await prisma.agenteExecucao.update({
      where: { id: execucao.id },
      data: { status: "erro", erro: String(err), finishedAt: new Date() },
    })
    return NextResponse.json({ error: "Erro ao executar agente" }, { status: 500 })
  }
}
