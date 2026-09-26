import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"
import { analisarComClaude, extrairJSON } from "@/lib/claude"

export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("verIA")
  if (acesso instanceof NextResponse) return acesso

  const { demandaId } = await req.json()

  // Mesmo IDOR que a triagem tinha: buscava a demanda por id sem conferir dono,
  // então bastava trocar o id para analisar — e pagar a chamada de IA de —
  // demanda de outra empresa.
  const guard = await requireDemandaOrg({ user: { id: acesso.usuarioId, organizacaoId: acesso.organizacaoId } }, demandaId)
  if (guard instanceof NextResponse) return guard

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
    where: { organizacaoId: acesso.organizacaoId, departamento: demanda.departamento, tipoVideo: demanda.tipoVideo },
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
      sugestao: (json?.sugestao as string) ?? texto.slice(0, 300),
      analise: json,
      tokens,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[analisar-demanda] Erro Claude:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
