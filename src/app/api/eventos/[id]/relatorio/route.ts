import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import { analisarComClaude, MODELO_POTENTE } from "@/lib/claude"

type Params = { params: Promise<{ id: string }> }

// POST /api/eventos/[id]/relatorio — gera relatório final do evento com IA
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const evento = await prisma.eventoGestao.findUnique({
    where: { id },
    include: {
      checklist: true,
      documentos: true,
      custos: { include: { fornecedor: { select: { nome: true } } } },
      demandas: { select: { titulo: true, tipoVideo: true, statusVisivel: true } },
      responsavel: { select: { nome: true } },
    },
  })
  if (!evento) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })

  const demandaIds = (await prisma.demanda.findMany({ where: { eventoGestaoId: id }, select: { id: true } })).map((d) => d.id)
  const custoAv = demandaIds.length
    ? await prisma.custoVideomaker.aggregate({ where: { demandaId: { in: demandaIds } }, _sum: { valor: true } })
    : { _sum: { valor: 0 } }

  const tarefasOk = evento.checklist.filter((t) => t.concluido).length
  const custoEvento = evento.custos.reduce((a, c) => a + (c.valorReal ?? c.valorPrevisto), 0)
  const custoTotal = custoEvento + (custoAv._sum.valor ?? 0)

  const contexto = `
EVENTO: ${evento.nome} (${evento.tipo})
Período: ${evento.dataInicio.toLocaleDateString("pt-BR")} a ${evento.dataFim.toLocaleDateString("pt-BR")}
Local: ${evento.local ?? "—"} · ${evento.cidade ?? "—"}/${evento.estado ?? "—"}
Responsável: ${evento.responsavel?.nome ?? "—"}
Status: ${evento.status} · Conclusão: ${evento.percentualConclusao}%
Objetivo: ${evento.objetivo ?? "—"}

CHECKLIST: ${tarefasOk}/${evento.checklist.length} tarefas concluídas
DOCUMENTOS: ${evento.documentos.length} (${evento.documentos.map((d) => d.nome).join(", ") || "nenhum"})
PEÇAS AUDIOVISUAIS (demandas): ${evento.demandas.map((d) => `${d.titulo} [${d.statusVisivel}]`).join("; ") || "nenhuma"}

FINANCEIRO:
Orçamento previsto: R$ ${evento.orcamentoPrevisto ?? 0}
Custo fornecedores: R$ ${custoEvento.toFixed(2)}
Custo audiovisual: R$ ${(custoAv._sum.valor ?? 0).toFixed(2)}
Custo total: R$ ${custoTotal.toFixed(2)}
Custos por categoria: ${evento.custos.map((c) => `${c.categoria}: R$${(c.valorReal ?? c.valorPrevisto).toFixed(2)}`).join(", ") || "—"}
`.trim()

  const prompt = `Você é um analista de produção de eventos. Com base nos dados acima, gere um RELATÓRIO FINAL DO EVENTO em markdown, conciso e executivo, com as seções:
## Resumo do Evento
## Entregas Audiovisuais
## Financeiro (previsto x real, destaques)
## Pendências e Pontos de Atenção
## Aprendizados para Próximos Eventos
Use linguagem objetiva em português do Brasil.`

  try {
    const { texto } = await analisarComClaude(prompt, contexto, MODELO_POTENTE)
    await prisma.eventoGestaoLog.create({
      data: { eventoId: id, usuarioId: session.user.id, acao: "relatorio_gerado", detalhe: "Relatório final gerado por IA" },
    }).catch(() => null)
    return NextResponse.json({ relatorio: texto })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const credits = msg.includes("credit balance") || msg.includes("insufficient")
    return NextResponse.json(
      { error: credits ? "Saldo insuficiente na API Anthropic. Adicione créditos para gerar o relatório." : `Erro ao gerar relatório: ${msg}` },
      { status: 500 }
    )
  }
}
