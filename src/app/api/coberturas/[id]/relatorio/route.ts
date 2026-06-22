import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { analisarComClaude, extrairJSON } from "@/lib/claude"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"

type Params = { params: Promise<{ id: string }> }

const TIPO_LABEL: Record<string, string> = {
  congresso: "Congresso",
  feira: "Feira",
  evento_corporativo: "Evento Corporativo",
  show: "Show",
  lancamento: "Lançamento",
  outro: "Outro",
}

// POST /api/coberturas/[id]/relatorio
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params

  const cobertura = await prisma.eventoCobertura.findUnique({
    where: { id },
    include: {
      equipe: {
        include: {
          _count: { select: { uploads: true } },
        },
      },
      checklist: true,
      uploads: { orderBy: [{ dia: "asc" }, { createdAt: "asc" }] },
    },
  })

  if (!cobertura || !pertenceAOrg(cobertura, organizacaoId)) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })

  // Calcular stats
  const totalUploads = cobertura.uploads.length
  const checklistConcluidos = cobertura.checklist.filter((c) => c.concluido).length
  const checklistTotal = cobertura.checklist.length
  const checklistPct = checklistTotal > 0 ? Math.round((checklistConcluidos / checklistTotal) * 100) : 0

  // Uploads por dia
  const uploadsPorDia: Record<number, number> = {}
  for (const u of cobertura.uploads) {
    uploadsPorDia[u.dia] = (uploadsPorDia[u.dia] ?? 0) + 1
  }

  const contexto = `
EVENTO: ${cobertura.titulo}
TIPO: ${TIPO_LABEL[cobertura.tipo] ?? cobertura.tipo}
LOCAL: ${cobertura.local ?? "N/A"}, ${cobertura.cidade ?? "N/A"}
PERÍODO: ${cobertura.dataInicio.toLocaleDateString("pt-BR")} a ${cobertura.dataFim.toLocaleDateString("pt-BR")} (${cobertura.totalDias} dias)
CLIENTE: ${cobertura.cliente ?? "Não informado"}
STATUS: ${cobertura.status}

EQUIPE (${cobertura.equipe.length} membros):
${cobertura.equipe.map((m) => `- ${m.nome} (${m.funcao}): ${m._count.uploads} uploads`).join("\n")}

UPLOADS TOTAIS: ${totalUploads}
UPLOADS POR DIA: ${Object.entries(uploadsPorDia).map(([d, n]) => `Dia ${d}: ${n} vídeos`).join(", ") || "Nenhum"}

CHECKLIST: ${checklistConcluidos}/${checklistTotal} (${checklistPct}% concluído)
`.trim()

  const prompt = `
Você é um analista de produção audiovisual. Analise este evento de cobertura e gere um relatório executivo.

Responda SOMENTE com JSON válido neste formato:
{
  "resumo_executivo": "parágrafo de 3-4 frases resumindo o evento, equipe e resultado geral",
  "performance_equipe": [
    {
      "nome": "Nome do membro",
      "funcao": "captacao/edicao/etc",
      "uploads_realizados": 5,
      "avaliacao": "texto curto (1 frase) sobre a performance",
      "pontos_fortes": "ponto forte específico observado nos dados"
    }
  ],
  "destaques_por_dia": [
    {
      "dia": 1,
      "destaque": "o que foi mais significativo neste dia",
      "volume": 3,
      "melhoria": "sugestão de melhoria específica para este tipo de dia"
    }
  ],
  "recomendacoes": [
    "recomendação concreta para próximas coberturas"
  ],
  "score_producao": 85,
  "pontos_atencao": ["ponto de atenção 1", "ponto de atenção 2"]
}
`

  try {
    const { texto, tokens } = await analisarComClaude(prompt, contexto)
    const conteudo = extrairJSON(texto) as Record<string, unknown> | null

    const relatorio = await prisma.relatorioIA.create({
      data: {
        organizacaoId,
        tipo: "semanal", // closest available enum value for event coverage reports
        periodo: `cobertura-${id}`,
        conteudo: (conteudo ?? { texto_bruto: texto }) as object,
        tokens,
        modelo: "claude-haiku-4-5",
      },
    })

    await prisma.eventoCoberturaLog
      .create({
        data: {
          coberturaId: id,
          usuarioId: session.user.id,
          acao: "relatorio",
          detalhe: `Relatório IA gerado (score: ${(conteudo?.score_producao as number) ?? "N/A"})`,
        },
      })
      .catch(() => null)

    return NextResponse.json({ relatorio, conteudo })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[Coberturas/Relatorio] Erro Claude:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
