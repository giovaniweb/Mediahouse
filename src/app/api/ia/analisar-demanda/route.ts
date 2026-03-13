import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { analisarComClaude, extrairJSON } from "@/lib/claude"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { demandaId } = await req.json()

  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    include: {
      solicitante: { select: { nome: true, tipo: true } },
      historicos: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  })

  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  // Busca demandas similares para contexto
  const similares = await prisma.demanda.count({
    where: { departamento: demanda.departamento, tipoVideo: demanda.tipoVideo },
  })

  const contexto = `
Dados da demanda a ser analisada:
- Código: ${demanda.codigo}
- Título: ${demanda.titulo}
- Descrição: ${demanda.descricao}
- Departamento: ${demanda.departamento}
- Tipo de vídeo: ${demanda.tipoVideo}
- Prioridade: ${demanda.prioridade}
- Cidade: ${demanda.cidade}
- Motivo de urgência: ${demanda.motivoUrgencia ?? "N/A"}
- Solicitante: ${demanda.solicitante.nome} (${demanda.solicitante.tipo})
- Histórico de status: ${demanda.historicos.map(h => h.statusNovo).join(" → ")}
- Demandas similares no sistema: ${similares}
  `.trim()

  const prompt = `
Analise esta demanda que aguarda aprovação e responda em JSON com este formato exato:
{
  "sugestao": "texto curto e direto (máx 2 frases) com recomendação: aprovar, pedir mais info, ou recusar e por quê",
  "prioridade_real": "alta | media | baixa",
  "riscos": ["risco1", "risco2"],
  "recursos_estimados": "estimativa rápida de dias/recursos necessários",
  "score_viabilidade": 85
}
`

  try {
    const { texto, tokens } = await analisarComClaude(prompt, contexto)
    const json = extrairJSON(texto) as Record<string, unknown> | null

    return NextResponse.json({
      sugestao: (json?.sugestao as string) ?? texto.slice(0, 200),
      analise: json,
      tokens,
    })
  } catch (e) {
    return NextResponse.json({ error: "Erro ao analisar com IA" }, { status: 500 })
  }
}
