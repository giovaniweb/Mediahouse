import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { analisarComClaude, MODELO_POTENTE, MODELO_RAPIDO, extrairJSON } from "@/lib/claude"

// POST /api/relatorios/gerar — gera relatório IA para um tipo e período
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const { tipo, periodo } = body as { tipo: string; periodo: string }

  if (!tipo) return NextResponse.json({ error: "tipo é obrigatório" }, { status: 400 })

  const agora = new Date()
  const ha30dias = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ha7dias = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000)
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)

  try {
    let conteudo: unknown
    let tokens = 0
    const modelo = tipo === "realtime" ? MODELO_RAPIDO : MODELO_POTENTE

    // ─── Coletar dados base ────────────────────────────────────────────────
    const dataInicio = periodo === "semanal" ? ha7dias : tipo === "realtime" ? ha7dias : ha30dias

    const [demandas, custos, videomakers, alertas] = await Promise.all([
      prisma.demanda.findMany({
        where: { createdAt: { gte: dataInicio } },
        select: {
          id: true,
          codigo: true,
          titulo: true,
          tipoVideo: true,
          prioridade: true,
          statusInterno: true,
          statusVisivel: true,
          pesoDemanda: true,
          dataLimite: true,
          createdAt: true,
          updatedAt: true,
          videomaker: { select: { id: true, nome: true, valorDiaria: true } },
          editor: { select: { id: true, nome: true } },
        },
      }),
      prisma.custoVideomaker.findMany({
        where: { dataReferencia: { gte: dataInicio } },
        include: { videomaker: { select: { id: true, nome: true, valorDiaria: true } } },
      }),
      prisma.videomaker.findMany({
        where: { status: { in: ["ativo", "preferencial"] } },
        select: {
          id: true, nome: true, valorDiaria: true, avaliacao: true, areasAtuacao: true,
          demandas: {
            where: { createdAt: { gte: dataInicio } },
            select: { id: true, tipoVideo: true, statusInterno: true },
          },
        },
      }),
      prisma.alertaIA.findMany({
        where: { status: "ativo" },
        select: { tipoAlerta: true, mensagem: true, severidade: true, createdAt: true },
        take: 20,
      }),
    ])

    const historicosSemana = await prisma.historicoStatus.findMany({
      where: { createdAt: { gte: dataInicio } },
      select: { statusAnterior: true, statusNovo: true, origem: true, createdAt: true, demandaId: true },
      take: 200,
    })

    // Estatísticas rápidas para o contexto
    const concluidas = demandas.filter(d =>
      ["postado", "entregue_cliente", "encerrado"].includes(d.statusInterno)
    ).length
    const emAndamento = demandas.filter(d => !["postado", "entregue_cliente", "encerrado", "aguardando_aprovacao_interna"].includes(d.statusInterno)).length
    const totalCusto = custos.reduce((s, c) => s + c.valor, 0)
    const custoPorVideo = demandas.length > 0 ? totalCusto / demandas.length : 0

    // Tempo médio de conclusão
    const concluidas_data = demandas.filter(d => ["postado", "entregue_cliente"].includes(d.statusInterno))
    const tempoMedio = concluidas_data.length > 0
      ? concluidas_data.reduce((sum, d) => {
          const diff = (d.updatedAt.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          return sum + diff
        }, 0) / concluidas_data.length
      : 0

    // Por tipo de vídeo
    const porTipo: Record<string, number> = {}
    demandas.forEach(d => { porTipo[d.tipoVideo] = (porTipo[d.tipoVideo] || 0) + 1 })

    // Por status
    const porStatus: Record<string, number> = {}
    demandas.forEach(d => { porStatus[d.statusInterno] = (porStatus[d.statusInterno] || 0) + 1 })

    // Videomakers mais ativos
    const vmAtividade = videomakers
      .map(vm => ({
        nome: vm.nome,
        demandasPeriodo: vm.demandas.length,
        valorDiaria: vm.valorDiaria ?? 0,
        avaliacao: vm.avaliacao ?? 0,
        custoTotal: custos.filter(c => c.videomakerId === vm.id).reduce((s, c) => s + c.valor, 0),
      }))
      .sort((a, b) => b.demandasPeriodo - a.demandasPeriodo)

    // ─── Gerar relatório por tipo ──────────────────────────────────────────

    const periodoLabel = tipo === "semanal" ? "última semana" : tipo === "mensal" ? "último mês" : "tempo real"

    if (tipo === "produtividade_time") {
      const prompt = `Analise a produtividade da equipe de produção audiovisual com base nos dados abaixo e gere um relatório completo em JSON.

DADOS DO PERÍODO (${periodoLabel}):
- Demandas criadas: ${demandas.length}
- Demandas concluídas: ${concluidas}
- Em andamento: ${emAndamento}
- Tempo médio de conclusão: ${tempoMedio.toFixed(1)} dias
- Taxa de conclusão: ${demandas.length > 0 ? ((concluidas / demandas.length) * 100).toFixed(1) : 0}%
- Tipos de vídeo: ${JSON.stringify(porTipo)}
- Status atual: ${JSON.stringify(porStatus)}
- Alertas ativos: ${alertas.length}
- Mudanças de status no período: ${historicosSemana.length}
- Top videomakers: ${JSON.stringify(vmAtividade.slice(0, 5))}

RETORNE JSON com esta estrutura exata:
{
  "resumo_executivo": "string (2-3 parágrafos)",
  "score_produtividade": number (0-100),
  "pontos_fortes": ["string"],
  "gargalos": [{"problema": "string", "impacto": "string", "solucao": "string"}],
  "oportunidades_melhoria": [{"area": "string", "acao": "string", "ganho_estimado": "string"}],
  "previsao_proxima_semana": {"demandas_esperadas": number, "risco": "baixo|medio|alto", "recomendacao": "string"},
  "feedback_processo": "string (feedback específico e acionável)"
}`

      const { texto, tokens: t } = await analisarComClaude(prompt, "", MODELO_POTENTE)
      tokens = t
      conteudo = extrairJSON(texto) ?? { resumo: texto, tokens: t }

    } else if (tipo === "analise_custos") {
      const custosPorVm = vmAtividade.filter(v => v.custoTotal > 0)
      const prompt = `Analise os custos de contratação de videomakers e produza um relatório financeiro inteligente em JSON.

DADOS FINANCEIROS (${periodoLabel}):
- Total gasto: R$ ${totalCusto.toFixed(2)}
- Custo médio por vídeo: R$ ${custoPorVideo.toFixed(2)}
- Número de serviços: ${custos.length}
- Videomakers contratados: ${custosPorVm.length}
- Distribuição de custos por videomaker: ${JSON.stringify(custosPorVm)}
- Tipo de custo: ${JSON.stringify(custos.reduce((acc, c) => { acc[c.tipo] = (acc[c.tipo] || 0) + c.valor; return acc }, {} as Record<string, number>))}

RETORNE JSON com esta estrutura exata:
{
  "resumo_financeiro": "string",
  "total_periodo": number,
  "custo_medio_video": number,
  "avaliacao_roi": "string (análise do retorno sobre investimento)",
  "videomakers_eficientes": [{"nome": "string", "custo_beneficio": "string", "recomendacao": "manter|aumentar|reduzir"}],
  "otimizacoes_contratacao": [{"tipo": "string", "descricao": "string", "economia_potencial": "string"}],
  "alertas_financeiros": ["string"],
  "projecao_mes_seguinte": {"valor_estimado": number, "base_calculo": "string"},
  "recomendacoes_budget": "string"
}`

      const { texto, tokens: t } = await analisarComClaude(prompt, "", MODELO_POTENTE)
      tokens = t
      conteudo = extrairJSON(texto) ?? { resumo: texto }

    } else if (tipo === "performance_videomaker") {
      const vmDetalhes = videomakers.map(vm => {
        const custosVm = custos.filter(c => c.videomakerId === vm.id)
        const totalVm = custosVm.reduce((s, c) => s + c.valor, 0)
        return {
          nome: vm.nome,
          valorDiaria: vm.valorDiaria ?? 0,
          avaliacao: vm.avaliacao ?? 0,
          demandasPeriodo: vm.demandas.length,
          demandasConcluidas: vm.demandas.filter(d =>
            ["postado", "entregue_cliente"].includes(d.statusInterno)
          ).length,
          gastoTotal: totalVm,
          tiposVideo: [...new Set(vm.demandas.map(d => d.tipoVideo))],
          areas: vm.areasAtuacao,
        }
      })

      const prompt = `Analise a performance individual de cada videomaker e gere insights para otimização da equipe.

DADOS DOS VIDEOMAKERS (${periodoLabel}):
${JSON.stringify(vmDetalhes, null, 2)}

RETORNE JSON com esta estrutura:
{
  "ranking_performance": [
    {
      "posicao": number,
      "nome": "string",
      "score_performance": number,
      "pontos_fortes": ["string"],
      "areas_melhoria": ["string"],
      "recomendacao": "string"
    }
  ],
  "insights_equipe": "string",
  "sugestoes_alocacao": [{"situacao": "string", "acao": "string"}],
  "custo_oportunidade": "string",
  "proximo_passo": "string"
}`

      const { texto, tokens: t } = await analisarComClaude(prompt, "", MODELO_POTENTE)
      tokens = t
      conteudo = extrairJSON(texto) ?? { resumo: texto }

    } else if (tipo === "otimizacao_contratacao") {
      const prompt = `Com base nos dados de demandas e custos, sugira como otimizar o modelo de contratação de videomakers.

CONTEXTO ATUAL:
- Videomakers ativos: ${videomakers.length}
- Total de demandas no período: ${demandas.length}
- Média de demandas por videomaker: ${(demandas.length / Math.max(videomakers.length, 1)).toFixed(1)}
- Custo total do período: R$ ${totalCusto.toFixed(2)}
- Tipos de vídeo mais frequentes: ${JSON.stringify(Object.entries(porTipo).sort(([,a],[,b]) => b-a).slice(0, 5))}
- Distribuição de carga: ${JSON.stringify(vmAtividade.map(v => ({ nome: v.nome, demandas: v.demandasPeriodo, custo: v.custoTotal })))}

RETORNE JSON com esta estrutura:
{
  "diagnostico_atual": "string",
  "modelo_sugerido": "string (ex: fixo, freelance, híbrido)",
  "melhorias_imediatas": [{"acao": "string", "impacto": "string", "prazo": "string"}],
  "melhorias_medio_prazo": [{"acao": "string", "impacto": "string"}],
  "criterios_contratacao": ["string"],
  "indicadores_acompanhar": [{"kpi": "string", "meta": "string"}],
  "economia_potencial": "string",
  "riscos_atencao": ["string"]
}`

      const { texto, tokens: t } = await analisarComClaude(prompt, "", MODELO_POTENTE)
      tokens = t
      conteudo = extrairJSON(texto) ?? { resumo: texto }

    } else {
      // semanal, mensal, realtime — relatório geral
      const prompt = `Gere um relatório completo de ${tipo} (${periodoLabel}) para o sistema VideoOps de produção audiovisual.

DADOS CONSOLIDADOS:
- Demandas criadas: ${demandas.length}
- Demandas concluídas: ${concluidas}
- Taxa de conclusão: ${demandas.length > 0 ? ((concluidas / demandas.length) * 100).toFixed(1) : 0}%
- Tempo médio de conclusão: ${tempoMedio.toFixed(1)} dias
- Custo total do período: R$ ${totalCusto.toFixed(2)}
- Custo médio por vídeo: R$ ${custoPorVideo.toFixed(2)}
- Urgências: ${demandas.filter(d => d.prioridade === "urgente").length}
- Alertas ativos: ${alertas.length} (críticos: ${alertas.filter(a => a.severidade === "critico").length})
- Por tipo de vídeo: ${JSON.stringify(porTipo)}
- Top videomakers: ${JSON.stringify(vmAtividade.slice(0, 3))}
- Alertas recentes: ${JSON.stringify(alertas.slice(0, 5).map(a => a.mensagem))}

RETORNE JSON com esta estrutura:
{
  "titulo": "string",
  "periodo": "string",
  "resumo_executivo": "string",
  "kpis": [{"nome": "string", "valor": "string", "tendencia": "up|down|stable", "avaliacao": "bom|neutro|ruim"}],
  "destaques_positivos": ["string"],
  "pontos_atencao": ["string"],
  "acoes_recomendadas": [{"prioridade": "alta|media|baixa", "acao": "string", "responsavel": "string"}],
  "previsao_proximo_periodo": "string",
  "saude_geral_sistema": number
}`

      const { texto, tokens: t } = await analisarComClaude(prompt, "", modelo)
      tokens = t
      conteudo = extrairJSON(texto) ?? { resumo: texto }
    }

    // Salvar relatório no banco
    const periodoStr = periodo ?? (tipo === "semanal"
      ? `${agora.getFullYear()}-W${Math.ceil(agora.getDate() / 7)}`
      : tipo === "mensal"
        ? `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`
        : "realtime")

    const relatorio = await prisma.relatorioIA.create({
      data: {
        tipo: tipo as never,
        periodo: periodoStr,
        conteudo: conteudo as never,
        tokens,
        modelo,
      },
    })

    return NextResponse.json({ relatorio, conteudo, tokens })
  } catch (err) {
    console.error("Erro ao gerar relatório:", err)
    return NextResponse.json({ error: "Erro ao gerar relatório com IA" }, { status: 500 })
  }
}
