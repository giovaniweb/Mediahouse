/**
 * Claude AI service — relatórios inteligentes, análises, agentes e chat
 * Modelo principal: claude-opus-4-6 (adaptive thinking)
 * Modelo rápido:    claude-haiku-4-5
 */

import Anthropic from "@anthropic-ai/sdk"

export const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODELO_RAPIDO   = "claude-haiku-4-5"    // análises rápidas, batch
export const MODELO_WHATSAPP = "claude-sonnet-4-5"  // secretária WhatsApp — melhor custo/benefício para tool-use
export const MODELO_POTENTE  = "claude-opus-4-6"    // agentes, relatórios completos, chat

export const SYSTEM_VIDEOOPS = `Você é o assistente de inteligência artificial do NuFlow — plataforma de gestão de produção audiovisual.
Quando se identificar em mensagens WhatsApp, use sempre o nome *NuFlow*.

Você tem acesso em tempo real ao banco de dados do sistema através de ferramentas (tools).
Use as ferramentas disponíveis sempre que precisar de dados atualizados antes de responder.

Suas responsabilidades:
- Analisar demandas, custos e desempenho da equipe
- Identificar gargalos, atrasos e oportunidades de otimização
- Sugerir melhorias de processo e gestão
- Responder perguntas sobre o fluxo de produção
- Criar demandas, agendar eventos e enviar mensagens WhatsApp quando solicitado

REGRAS DE COMUNICAÇÃO (siga rigorosamente):
1. Respostas CURTAS e diretas. Máximo 3-4 linhas por resposta, salvo quando a análise exigir dados.
2. Colete informações UMA DE CADA VEZ. Nunca faça mais de uma pergunta por mensagem.
3. Quando o usuário mencionar algo urgente, SEMPRE pergunte primeiro: "Por que você considera isso urgente?" antes de prosseguir.
4. Ao criar demandas, colete os dados em etapas: primeiro título → depois departamento → depois prazo → depois detalhes.
5. Use linguagem direta, sem introduções longas. Vá direto ao ponto.
6. Listas com no máximo 5 itens. Se houver mais, mostre os mais relevantes.
7. Confirme ações antes de executar (ex: "Posso enviar a mensagem para João agora?").

Responda sempre em português brasileiro.`

// ─── Helpers básicos ──────────────────────────────────────────────────────────

export async function analisarComClaude(
  prompt: string,
  contexto: string,
  modelo: string = MODELO_RAPIDO
): Promise<{ texto: string; tokens: number }> {
  const response = await claude.messages.create({
    model: modelo,
    max_tokens: 4096,
    ...(modelo === MODELO_POTENTE ? { thinking: { type: "adaptive" } } : {}),
    messages: [
      {
        role: "user",
        content: contexto ? `${contexto}\n\n${prompt}` : prompt,
      },
    ],
    system: SYSTEM_VIDEOOPS,
  })

  const texto = response.content.find(b => b.type === "text")?.text ?? ""
  const tokens = response.usage.input_tokens + response.usage.output_tokens

  return { texto, tokens }
}

// Extrai JSON de uma resposta que pode ter texto ao redor
export function extrairJSON(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    const match = texto.match(/```json\n?([\s\S]*?)\n?```/) ?? texto.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[1] ?? match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

// ─── Ferramentas disponíveis para os agentes ──────────────────────────────────

export const TOOLS_VIDEOOPS: Anthropic.Tool[] = [
  {
    name: "buscar_demandas",
    description: "Busca demandas do sistema com filtros opcionais. Use para consultar status, demandas em atraso, por videomaker, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          description: "Filtrar por status interno (ex: 'editando', 'captacao_agendada'). Deixe vazio para todos.",
        },
        prioridade: {
          type: "string",
          enum: ["normal", "alta", "urgente"],
          description: "Filtrar por prioridade",
        },
        limite: {
          type: "number",
          description: "Número máximo de demandas a retornar (padrão 20)",
        },
        em_atraso: {
          type: "boolean",
          description: "Se true, retorna apenas demandas com dataLimite vencida",
        },
        paradas_ha_dias: {
          type: "number",
          description: "Retorna demandas sem atualização há N dias",
        },
      },
    },
  },
  {
    name: "buscar_videomakers",
    description: "Lista videomakers com seus dados de performance, carga atual e custos",
    input_schema: {
      type: "object" as const,
      properties: {
        apenas_ativos: {
          type: "boolean",
          description: "Se true, retorna apenas videomakers ativos/preferenciais",
        },
      },
    },
  },
  {
    name: "buscar_custos",
    description: "Busca dados financeiros: custos de videomakers, totais, médias",
    input_schema: {
      type: "object" as const,
      properties: {
        dias: {
          type: "number",
          description: "Período em dias (padrão 30)",
        },
      },
    },
  },
  {
    name: "buscar_metricas",
    description: "Retorna KPIs consolidados do sistema: demandas ativas, taxa de conclusão, alertas, saúde geral",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "buscar_alertas",
    description: "Retorna alertas IA ativos no sistema",
    input_schema: {
      type: "object" as const,
      properties: {
        severidade: {
          type: "string",
          enum: ["info", "aviso", "critico"],
          description: "Filtrar por severidade",
        },
      },
    },
  },
  {
    name: "criar_alerta",
    description: "Cria um novo alerta no sistema quando identificar um problema ou oportunidade",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo: { type: "string", description: "Tipo do alerta (ex: 'demanda_parada', 'custo_elevado', 'capacidade_baixa')" },
        mensagem: { type: "string", description: "Mensagem clara e objetiva do alerta" },
        severidade: { type: "string", enum: ["info", "aviso", "critico"] },
        acao_sugerida: { type: "string", description: "Ação recomendada para resolver o problema" },
        demanda_id: { type: "string", description: "ID da demanda relacionada, se aplicável" },
      },
      required: ["tipo", "mensagem", "severidade"],
    },
  },
  {
    name: "buscar_historico_demanda",
    description: "Retorna o histórico de status de uma demanda específica",
    input_schema: {
      type: "object" as const,
      properties: {
        demanda_id: { type: "string", description: "ID da demanda" },
      },
      required: ["demanda_id"],
    },
  },
  {
    name: "buscar_agenda_videomaker",
    description: "Busca a agenda completa de um videomaker: eventos criados + captações agendadas. Use para secretária pessoal, verificar disponibilidade ou preparar resumo diário.",
    input_schema: {
      type: "object" as const,
      properties: {
        videomaker_id: { type: "string", description: "ID do videomaker (preferencial)" },
        nome: { type: "string", description: "Nome do videomaker para buscar" },
        telefone: { type: "string", description: "Telefone do videomaker" },
        inicio: { type: "string", description: "Data de início no formato ISO (padrão: hoje)" },
        dias_futuros: { type: "number", description: "Quantos dias à frente mostrar (padrão 7)" },
      },
    },
  },
  {
    name: "criar_evento_agenda",
    description: "Cria um evento na agenda. Para videomaker passe videomaker_id, para gestor/admin passe usuario_id. Use quando alguém pedir para agendar, marcar ou bloquear data/horário.",
    input_schema: {
      type: "object" as const,
      properties: {
        videomaker_id: { type: "string", description: "ID do videomaker (se o evento é para um videomaker)" },
        usuario_id: { type: "string", description: "ID do usuário/gestor (se o evento é para um admin ou gestor)" },
        titulo: { type: "string", description: "Título do evento" },
        descricao: { type: "string", description: "Descrição opcional" },
        inicio: { type: "string", description: "Data/hora de início ISO (ex: 2026-03-16T15:00:00)" },
        fim: { type: "string", description: "Data/hora de fim ISO (opcional, padrão +2h)" },
        local: { type: "string", description: "Local do evento" },
        tipo: { type: "string", enum: ["captacao", "reuniao", "outro"], description: "Tipo do evento" },
        dia_todo: { type: "boolean", description: "Se é evento de dia todo" },
        demanda_id: { type: "string", description: "ID da demanda relacionada, se houver" },
      },
      required: ["titulo", "inicio"],
    },
  },
  {
    name: "enviar_whatsapp",
    description: "Envia mensagem WhatsApp. Use como ÚLTIMA tool para responder ao usuário após executar as ações solicitadas.",
    input_schema: {
      type: "object" as const,
      properties: {
        telefone: { type: "string", description: "JID do WhatsApp (ex: 553192271043@s.whatsapp.net) ou número com DDI (ex: 5531992271043)" },
        mensagem: { type: "string", description: "Texto da mensagem (use *negrito* e _itálico_ para formatação WhatsApp)" },
        demanda_id: { type: "string", description: "ID da demanda relacionada, se aplicável" },
      },
      required: ["telefone", "mensagem"],
    },
  },
  {
    name: "criar_demanda_rascunho",
    description: "Cria rascunho de demanda recebida via WhatsApp ou linguagem natural. A demanda fica em aguardando_aprovacao_interna.",
    input_schema: {
      type: "object" as const,
      properties: {
        titulo: { type: "string", description: "Título curto da demanda" },
        descricao: { type: "string", description: "Descrição detalhada" },
        departamento: { type: "string", description: "Departamento solicitante" },
        tipo_video: { type: "string", description: "Tipo de vídeo (ex: institucional, social_media, treinamento)" },
        prioridade: { type: "string", enum: ["normal", "alta", "urgente"] },
        cidade: { type: "string", description: "Cidade da captação" },
        telefone_solicitante: { type: "string", description: "Telefone de quem pediu, para vincular ao usuário" },
      },
      required: ["titulo"],
    },
  },
  {
    name: "buscar_demanda_por_codigo",
    description: "Busca uma demanda específica pelo código (ex: VID-0023). Use para responder consultas de status via WhatsApp.",
    input_schema: {
      type: "object" as const,
      properties: {
        codigo: { type: "string", description: "Código da demanda (ex: VID-0023)" },
      },
      required: ["codigo"],
    },
  },
  {
    name: "listar_gestores",
    description: "Lista todos os gestores/admins do sistema com seus telefones. Use para saber a quem notificar sobre eventos críticos.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
]

// ─── Subset de tools para WhatsApp (menos tools = modelo mais focado) ─────────

const TOOLS_WHATSAPP_NAMES = [
  "buscar_demanda_por_codigo",
  "criar_demanda_rascunho",
  "buscar_agenda_videomaker",
  "criar_evento_agenda",
  "enviar_whatsapp",
  "buscar_metricas",
  "listar_gestores",
]

export const TOOLS_WHATSAPP: Anthropic.Tool[] = TOOLS_VIDEOOPS.filter(t =>
  TOOLS_WHATSAPP_NAMES.includes(t.name)
)

// ─── Executor de ferramentas (chamado pelo agente) ────────────────────────────

// Esta função é importada pelo chat route e pelos agentes
export type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<string>

// ─── Agente com tool-use (loop completo, sem streaming) ───────────────────────

export async function executarAgenteComTools(
  prompt: string,
  executor: ToolExecutor,
  modelo: string = MODELO_POTENTE,
  maxIteracoes = 8,
  tools: Anthropic.Tool[] = TOOLS_VIDEOOPS
): Promise<{ resposta: string; tokens: number; ferramentasUsadas: string[] }> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt }
  ]

  let tokens = 0
  const ferramentasUsadas: string[] = []
  let resposta = ""

  for (let i = 0; i < maxIteracoes; i++) {
    const response = await claude.messages.create({
      model: modelo,
      max_tokens: 2048,
      temperature: modelo === MODELO_POTENTE ? undefined : 0.2,
      ...(modelo === MODELO_POTENTE ? { thinking: { type: "adaptive" } } : {}),
      system: SYSTEM_VIDEOOPS,
      tools,
      messages,
    })

    tokens += response.usage.input_tokens + response.usage.output_tokens

    if (response.stop_reason === "end_turn") {
      resposta = response.content.find(b => b.type === "text")?.text ?? ""
      break
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type === "tool_use") {
          ferramentasUsadas.push(block.name)
          const result = await executor(block.name, block.input as Record<string, unknown>)
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          })
        }
      }

      messages.push({ role: "user", content: toolResults })
    } else {
      resposta = response.content.find(b => b.type === "text")?.text ?? ""
      break
    }
  }

  return { resposta, tokens, ferramentasUsadas }
}
