import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"

const moeda = (valor: number | null) => valor === null ? "Não informado" : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const data = (valor: Date) => valor.toLocaleDateString("pt-BR", { timeZone: "UTC" })
type Params = { params: Promise<{ id: string }> }

/** Resumo factual. Não avalia desempenho nem depende de provedor de IA. */
export async function POST(_req: NextRequest, { params }: Params) {
  const acesso = await requireAcesso("verEventos")
  if (acesso instanceof NextResponse) return acesso
  const { id } = await params
  const organizacaoId = acesso.organizacaoId
  try {
    const resultado = await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
      const evento = await tx.eventoGestao.findFirst({
        where: { id, organizacaoId },
        select: { nome: true, status: true, dataInicio: true, dataFim: true, local: true, cidade: true,
          responsavel: { select: { nome: true } },
          checklist: { select: { concluido: true } },
          _count: { select: { documentos: true } },
          demandas: { where: { organizacaoId }, select: { statusVisivel: true } },
        },
      })
      if (!evento) return null
      const concluidas = evento.checklist.filter(t => t.concluido).length
      const entregasConcluidas = evento.demandas.filter(d => d.statusVisivel === "finalizado").length
      const linhas = [
        `Resumo do evento: ${evento.nome}`,
        `Período: ${data(evento.dataInicio)} a ${data(evento.dataFim)}`,
        `Local: ${evento.local ?? "Não informado"} · ${evento.cidade ?? "Não informada"}`,
        `Responsável: ${evento.responsavel?.nome ?? "Não atribuído"}`,
        `Status registrado: ${evento.status}`,
        "", "Acompanhamento",
        `Checklist: ${concluidas} de ${evento.checklist.length} itens concluídos.`,
        `Pendências do checklist: ${evento.checklist.length - concluidas}.`,
        `Documentos cadastrados: ${evento._count.documentos}.`,
        `Demandas vinculadas: ${evento.demandas.length}; com status finalizado: ${entregasConcluidas}.`,
        "Status finalizado não confirma publicação nem aprovação de todos os arquivos.",
      ]
      if (acesso.permissoes.verCustos) {
        const financeiro = await tx.eventoGestao.findFirstOrThrow({ where: { id, organizacaoId }, select: { orcamentoPrevisto: true, custos: { select: { valorPrevisto: true, valorReal: true } } } })
        const realizados = financeiro.custos.filter(c => c.valorReal !== null)
        const av = await tx.custoVideomaker.aggregate({ where: { organizacaoId, demanda: { organizacaoId, eventoGestaoId: id } }, _sum: { valor: true }, _count: true })
        linhas.push("", "Financeiro — lançamentos registrados",
          `Orçamento previsto do evento: ${moeda(financeiro.orcamentoPrevisto)}.`,
          `Previsão dos itens de custo: ${financeiro.custos.length ? moeda(financeiro.custos.reduce((s, c) => s + c.valorPrevisto, 0)) : "Sem lançamentos"}.`,
          `Valor realizado informado: ${moeda(realizados.length ? realizados.reduce((s, c) => s + c.valorReal!, 0) : null)}.`,
          `Itens sem valor realizado informado: ${financeiro.custos.length - realizados.length}.`,
          `Custos audiovisuais vinculados: ${av._count ? moeda(av._sum.valor) : "Sem lançamentos"}.`,
          "Custos do evento e audiovisuais são apresentados separadamente: os registros podem se sobrepor. Valores previstos não substituem realizados; estes lançamentos não comprovam pagamento.")
      }
      linhas.push("", "Resumo calculado a partir dos registros atuais, sem IA. Não mede qualidade, alcance ou retorno do evento.")
      await tx.eventoGestaoLog.create({ data: { eventoId: id, usuarioId: acesso.usuarioId, acao: "relatorio_gerado", detalhe: "Resumo por regras, sem IA; financeiro conforme permissão." } })
      return { relatorio: linhas.join("\n"), origem: "regras-v1", tokens: 0 }
    }, { isolationLevel: "RepeatableRead" }))
    if (!resultado) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
    return NextResponse.json(resultado, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Não foi possível gerar o resumo do evento. Tente novamente." }, { status: 503 })
  }
}
