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
    description: "Busca a agenda de um videomaker (externo) ou editor (videomaker interno). Mostra eventos + captações agendadas. Funciona com videomaker_id OU editor_id.",
    input_schema: {
      type: "object" as const,
      properties: {
        videomaker_id: { type: "string", description: "ID do videomaker externo" },
        editor_id: { type: "string", description: "ID do editor (videomaker interno)" },
        nome: { type: "string", description: "Nome para buscar" },
        telefone: { type: "string", description: "Telefone para buscar" },
        inicio: { type: "string", description: "Data de início ISO (padrão: hoje)" },
        dias_futuros: { type: "number", description: "Quantos dias à frente (padrão 7)" },
      },
    },
  },
  {
    name: "criar_evento_agenda",
    description: "Cria evento na agenda com VERIFICAÇÃO DE CONFLITOS. Se houver conflito, NÃO cria e retorna o evento conflitante + sugestões de horários livres. Passe editor_id para videomaker interno, videomaker_id para externo.",
    input_schema: {
      type: "object" as const,
      properties: {
        videomaker_id: { type: "string", description: "ID do videomaker externo" },
        editor_id: { type: "string", description: "ID do editor (videomaker interno)" },
        usuario_id: { type: "string", description: "ID do gestor/admin" },
        titulo: { type: "string", description: "Título do evento" },
        descricao: { type: "string", description: "Descrição opcional" },
        inicio: { type: "string", description: "Data/hora de início ISO (ex: 2026-03-16T15:00:00)" },
        fim: { type: "string", description: "Data/hora de fim ISO (padrão +2h)" },
        local: { type: "string", description: "Local do evento" },
        tipo: { type: "string", enum: ["captacao", "reuniao", "outro"], description: "Tipo do evento" },
        dia_todo: { type: "boolean", description: "Se é evento de dia todo" },
        demanda_id: { type: "string", description: "ID da demanda relacionada" },
        forcar: { type: "boolean", description: "Se true, cria mesmo com conflito (use só se o usuário confirmar)" },
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
    description: "Cria rascunho de demanda recebida via WhatsApp ou linguagem natural. A demanda fica em aguardando_aprovacao_interna. SEMPRE passe telefone_solicitante quando souber o telefone de quem pediu.",
    input_schema: {
      type: "object" as const,
      properties: {
        titulo: { type: "string", description: "Título curto da demanda" },
        descricao: { type: "string", description: "Descrição detalhada" },
        departamento: { type: "string", description: "Departamento solicitante" },
        tipo_video: { type: "string", description: "Tipo de vídeo (ex: institucional, social_media, treinamento)" },
        prioridade: { type: "string", enum: ["normal", "alta", "urgente"] },
        cidade: { type: "string", description: "Cidade da captação" },
        telefone_solicitante: { type: "string", description: "Telefone de quem pediu (OBRIGATÓRIO se veio via WhatsApp)" },
      },
      required: ["titulo"],
    },
  },
  {
    name: "estruturar_demanda",
    description: "Recebe uma descrição solta/vaga e estrutura em campos organizados para demanda. Use quando o texto é informal ou de áudio transcrito. Retorna a demanda estruturada para apresentar ao solicitante antes de criar.",
    input_schema: {
      type: "object" as const,
      properties: {
        texto_original: { type: "string", description: "Texto bruto do solicitante (pode ser informal ou transcrição de áudio)" },
        nome_solicitante: { type: "string", description: "Nome de quem está pedindo" },
        telefone_solicitante: { type: "string", description: "Telefone de quem está pedindo" },
      },
      required: ["texto_original"],
    },
  },
  {
    name: "solicitar_dados_demanda",
    description: "Envia mensagem WhatsApp ao solicitante ORIGINAL de uma demanda para pedir dados faltantes. Usa o telefoneSolicitante salvo na demanda.",
    input_schema: {
      type: "object" as const,
      properties: {
        demanda_id: { type: "string", description: "ID da demanda" },
        codigo_demanda: { type: "string", description: "Código da demanda (ex: VID-0023) — alternativa ao demanda_id" },
        mensagem: { type: "string", description: "Mensagem pedindo os dados faltantes" },
        dados_faltantes: { type: "string", description: "Descrição dos dados que faltam (ex: 'local da gravação e horário')" },
      },
      required: ["mensagem"],
    },
  },
  {
    name: "vincular_arquivo_demanda",
    description: "Vincula um arquivo (imagem, vídeo, documento) recebido via WhatsApp a uma demanda existente.",
    input_schema: {
      type: "object" as const,
      properties: {
        demanda_id: { type: "string", description: "ID da demanda" },
        codigo_demanda: { type: "string", description: "Código da demanda (alternativa ao demanda_id)" },
        url_arquivo: { type: "string", description: "URL do arquivo no storage" },
        nome_arquivo: { type: "string", description: "Nome do arquivo" },
        tipo: { type: "string", enum: ["referencia", "bruto", "cliente"], description: "Tipo do arquivo" },
      },
      required: ["url_arquivo", "nome_arquivo"],
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
  {
    name: "salvar_ideia_video",
    description: "Salva uma ideia de vídeo no Banco de Ideias. Use quando o usuário confirmar que um link, mídia ou descrição é uma ideia de vídeo.",
    input_schema: {
      type: "object" as const,
      properties: {
        titulo: { type: "string", description: "Título curto da ideia" },
        descricao: { type: "string", description: "Descrição ou contexto da ideia" },
        link_referencia: { type: "string", description: "URL de referência (Instagram, TikTok, YouTube)" },
        media_url: { type: "string", description: "URL do arquivo no storage (se mídia)" },
        produto_nome: { type: "string", description: "Nome do produto sugerido (se mencionado)" },
        classificacao: { type: "string", enum: ["b2c", "b2b"], description: "Classificação B2C ou B2B" },
        telefone_origem: { type: "string", description: "Telefone de quem enviou a ideia" },
        nome_origem: { type: "string", description: "Nome de quem enviou" },
      },
      required: ["titulo", "telefone_origem"],
    },
  },
  {
    name: "buscar_ideias",
    description: "Busca ideias de vídeo no Banco de Ideias. Use para consultar ideias por status, produto, score IA, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["nova", "em_analise", "aprovada", "em_producao", "realizada", "descartada"], description: "Filtrar por status" },
        produto_nome: { type: "string", description: "Filtrar por nome do produto (busca parcial)" },
        limite: { type: "number", description: "Número máximo de resultados (padrão 10)" },
      },
    },
  },
]

// ─── Subset de tools para WhatsApp (menos tools = modelo mais focado) ─────────

const TOOLS_WHATSAPP_NAMES = [
  "buscar_demanda_por_codigo",
  "criar_demanda_rascunho",
  "estruturar_demanda",
  "solicitar_dados_demanda",
  "vincular_arquivo_demanda",
  "buscar_agenda_videomaker",
  "criar_evento_agenda",
  "enviar_whatsapp",
  "buscar_metricas",
  "listar_gestores",
  "salvar_ideia_video",
  "buscar_ideias",
]

export const TOOLS_WHATSAPP: Anthropic.Tool[] = TOOLS_VIDEOOPS.filter(t =>
  TOOLS_WHATSAPP_NAMES.includes(t.name)
)

// ─── Executor de ferramentas (chamado pelo agente) ────────────────────────────

// Esta função é importada pelo chat route e pelos agentes
export type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<string>

// ─── Agente com tool-use (loop completo, sem streaming) ───────────────────────

// System prompt dedicado para WhatsApp — sem confirmação prévia, respostas curtas
export const SYSTEM_WHATSAPP = `Você é a Secretária IA NuFlow respondendo via WhatsApp.

REGRAS CRÍTICAS:
1. Execute ações DIRETAMENTE sem pedir confirmação. Crie eventos, demandas e envie mensagens imediatamente.
2. Respostas CURTAS — máximo 5 linhas. Vá direto ao ponto.
3. Colete dados UMA COISA DE CADA VEZ quando necessário.
4. Use o HISTÓRICO DA CONVERSA para entender o contexto. Se o usuário respondeu algo, é continuação da conversa anterior.
5. Nunca diga "Posso fazer X?" — simplesmente FAÇA X.
6. Use *negrito* para destaques no WhatsApp.
7. Tom INFORMAL e amigável. Trate a pessoa pelo primeiro nome.

CRIAÇÃO DE DEMANDAS (IMPORTANTÍSSIMO):
8. QUALQUER PESSOA pode solicitar uma demanda via WhatsApp — NÃO precisa ser cadastrada no sistema.
9. Quando alguém pedir vídeo, conteúdo, cobertura, anúncio, etc. → estruture e CRIE a demanda.
10. A demanda cai automaticamente em APROVAÇÃO para o gestor analisar.
11. SEMPRE passe telefone_solicitante ao criar. Se a pessoa é desconhecida, tudo bem — o telefone vincula.
12. Se a descrição é clara (tipo de vídeo, equipamento, objetivo), crie direto.
13. Se faltam dados essenciais, pergunte UMA coisa de cada vez.
14. Se receber áudio transcrito, trate como mensagem normal.

REGRAS DE AGENDA:
15. Somente videomakers internos (editor) e videomakers externos têm agenda.
16. Cada pessoa tem sua própria agenda individual. Use o editor_id ou videomaker_id correto.
17. A ferramenta criar_evento_agenda verifica conflitos automaticamente.
18. Se houver CONFLITO, repasse as sugestões de horários livres ao usuário.

BANCO DE IDEIAS DE VÍDEO:
19. Se o usuário enviar um link de Instagram, TikTok, YouTube, X/Twitter ou mídia (imagem/vídeo) SEM contexto de demanda, pergunte: "💡 Isso é uma *ideia de vídeo*? Posso salvar no Banco de Ideias!"
20. Se confirmar (sim, é sim, salva, etc.), use salvar_ideia_video para salvar. Crie um título descritivo baseado no contexto.
21. Se enviar link COM pedido de demanda ("faz um vídeo assim", "preciso de algo parecido"), trate como demanda normal.
22. Ao salvar ideia, tente identificar para qual produto é e pergunte se não souber.
23. Se pedirem para listar ideias ou ver o banco de ideias, use buscar_ideias.

Responda sempre em português brasileiro.`

export async function executarAgenteComTools(
  prompt: string,
  executor: ToolExecutor,
  modelo: string = MODELO_POTENTE,
  maxIteracoes = 8,
  tools: Anthropic.Tool[] = TOOLS_VIDEOOPS,
  systemPrompt?: string
): Promise<{ resposta: string; tokens: number; ferramentasUsadas: string[] }> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt }
  ]
  const system = systemPrompt ?? SYSTEM_VIDEOOPS

  let tokens = 0
  const ferramentasUsadas: string[] = []
  let resposta = ""

  for (let i = 0; i < maxIteracoes; i++) {
    const response = await claude.messages.create({
      model: modelo,
      max_tokens: 2048,
      temperature: modelo === MODELO_POTENTE ? undefined : 0.2,
      ...(modelo === MODELO_POTENTE ? { thinking: { type: "adaptive" } } : {}),
      system,
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
