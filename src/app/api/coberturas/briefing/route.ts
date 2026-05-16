import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import Anthropic from "@anthropic-ai/sdk"
import { extrairJSON } from "@/lib/claude"

// Aumenta o timeout para 60s (Claude + PDF pode levar 15-30s)
export const maxDuration = 60

const PROMPT_EXTRACAO = `Você é um assistente especializado em extrair dados de briefings de eventos audiovisuais.

Analise o PDF e retorne APENAS um JSON válido (sem markdown, sem texto antes ou depois) com esta estrutura exata:

{
  "titulo": "Nome completo do evento",
  "tipo": "congresso|feira|evento_corporativo|show|lancamento|outro",
  "cliente": "Nome do cliente ou organizadora do evento",
  "local": "Nome do venue/espaço/hotel onde o evento ocorre",
  "cidade": "Cidade / UF",
  "dataInicio": "2026-06-15",
  "dataFim": "2026-06-17",
  "descricao": "Descrição objetiva do evento em 2-3 frases",
  "programacaoPorDia": [
    {
      "dia": 1,
      "data": "2026-06-15",
      "titulo": "Nome resumido do dia (ex: Abertura e Credenciamento)",
      "momentos": [
        "08h00 - Credenciamento",
        "10h00 - Cerimônia de Abertura",
        "14h00 - Painéis temáticos"
      ]
    }
  ],
  "checklistEspecifico": [
    { "texto": "Item específico relevante para este evento", "categoria": "logistica" },
    { "texto": "Cobertura do painel principal — horário", "categoria": "conteudo" }
  ],
  "logistica": {
    "hotel": "Nome do hotel se mencionado no briefing",
    "transporte": "Informações de transporte/acesso se mencionadas"
  }
}

REGRAS:
- "tipo": escolha o mais adequado entre as opções disponíveis
- "dataInicio" e "dataFim": formato ISO YYYY-MM-DD obrigatório
- "programacaoPorDia": um objeto por dia do evento com os momentos mais importantes
- "checklistEspecifico": itens ESPECÍFICOS deste evento (não os padrões como "celular carregado"). Exemplos: credenciamento especial, acesso restrito, cobertura de sessão específica, entrevista agendada
- "checklistEspecifico.categoria": use apenas "equipamento", "logistica", "conteudo" ou "entrega"
- Se algum dado não estiver no PDF, use null para o campo
- Retorne APENAS o JSON, sem nenhum texto adicional`

export interface ExtratoEvento {
  titulo: string
  tipo: string
  cliente: string | null
  local: string | null
  cidade: string | null
  dataInicio: string
  dataFim: string
  descricao: string | null
  programacaoPorDia: Array<{
    dia: number
    data: string
    titulo: string
    momentos: string[]
  }>
  checklistEspecifico: Array<{
    texto: string
    categoria: string
  }>
  logistica: {
    hotel: string | null
    transporte: string | null
  } | null
}

// POST /api/coberturas/briefing
// Recebe PDF via multipart/form-data, extrai dados com Claude, retorna JSON estruturado
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  try {
    const form = await req.formData()
    const file = form.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 })
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "O arquivo deve ser um PDF" }, { status: 400 })
    }

    const maxSize = 20 * 1024 * 1024 // 20MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "PDF muito grande (máximo 20MB)" }, { status: 400 })
    }

    // Converter PDF para base64
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")

    // Chamar Claude com document content block (suporte nativo a PDF no SDK ^0.78.0)
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            } as Anthropic.DocumentBlockParam,
            {
              type: "text",
              text: PROMPT_EXTRACAO,
            },
          ],
        },
      ],
    })

    const texto = msg.content.find((c) => c.type === "text")?.text ?? ""
    const dados = extrairJSON(texto) as ExtratoEvento | null

    if (!dados || !dados.titulo || !dados.dataInicio || !dados.dataFim) {
      console.error("[Briefing] Claude retornou JSON inválido:", texto.slice(0, 500))
      return NextResponse.json(
        { error: "Não foi possível extrair os dados do briefing. Verifique se o PDF contém informações de evento." },
        { status: 422 }
      )
    }

    // Garantir arrays existem
    if (!Array.isArray(dados.programacaoPorDia)) dados.programacaoPorDia = []
    if (!Array.isArray(dados.checklistEspecifico)) dados.checklistEspecifico = []

    return NextResponse.json({ dados })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[Briefing] Erro ao processar PDF:", msg)
    // Retorna o erro real para facilitar debug em produção
    return NextResponse.json({ error: `Erro ao processar o briefing: ${msg}` }, { status: 500 })
  }
}
