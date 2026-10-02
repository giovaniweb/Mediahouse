import { requireAcesso } from "@/lib/acesso"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { executarAgenteComTools, MODELO_POTENTE } from "@/lib/claude"
import { contextoUsuario } from "@/lib/ia-tool-contexto"
import { executarFerramenta } from "@/lib/ia-tools-executor"

export const maxDuration = 120

// POST /api/ia/agentes/monitor
// Agente Monitor de Fluxo: analisa toda a pipeline de produção e detecta gargalos
export async function POST() {
  const acesso = await requireAcesso("verIA")
  if (acesso instanceof NextResponse) return acesso
  const { organizacaoId } = acesso
  const contexto = contextoUsuario(organizacaoId, acesso.usuarioId)

  const execucao = await prisma.agenteExecucao.create({
    data: { agente: "monitor", organizacaoId, status: "executando", criadoPor: acesso.usuarioId },
  })

  try {
    const prompt = `Você é o Agente Monitor de Fluxo do NuFlow. Faça uma análise completa do pipeline de produção e identifique todos os gargalos, riscos e oportunidades de melhoria.

ANÁLISES OBRIGATÓRIAS:

1. **Visão geral**: Use buscar_metricas para obter o panorama atual

2. **Gargalos no pipeline**: Use buscar_demandas para cada etapa crítica:
   - demandas em 'editando' paradas há mais de 2 dias (paradas_ha_dias=2)
   - demandas em 'videomaker_notificado' sem resposta (paradas_ha_dias=1)
   - demandas 'aguardando_aprovacao_interna' há mais de 3 dias

3. **Distribuição de carga**: Use buscar_videomakers para ver carga por profissional

4. **Análise financeira rápida**: Use buscar_custos com dias=7

Com base nos dados coletados, forneça:
- **Diagnóstico do fluxo**: análise clara dos gargalos
- **Top 3 problemas críticos**: os mais urgentes a resolver
- **Distribuição de carga**: quem está sobrecarregado vs subutilizado
- **Recomendações imediatas**: ações para as próximas 24h
- **Otimizações de médio prazo**: melhorias para a próxima semana

Para cada problema grave, use criar_alerta para registrar no sistema.

Seja específico com dados reais (nomes de demandas, videomakers, valores).`

    const { resposta, tokens, ferramentasUsadas } = await executarAgenteComTools(
      prompt,
      (n, i) => executarFerramenta(n, i, contexto),
      MODELO_POTENTE,
      10
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
    return NextResponse.json({ error: "Erro no agente monitor" }, { status: 500 })
  }
}
