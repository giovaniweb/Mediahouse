import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"

type Params = { params: Promise<{ id: string }> }

/** Contagens não são notas de desempenho. Mantém o relatório salvo sem chamar IA. */
export async function POST(_req: NextRequest, { params }: Params) {
  const acesso = await requireAcesso("verCoberturas")
  if (acesso instanceof NextResponse) return acesso
  const { id } = await params
  const organizacaoId = acesso.organizacaoId
  try {
    const resultado = await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
      const cobertura = await tx.eventoCobertura.findFirst({ where: { id, organizacaoId }, select: {
        titulo: true, status: true, equipe: { select: { id: true, nome: true, funcao: true }, orderBy: { id: "asc" } },
        checklist: { select: { concluido: true } },
      } })
      if (!cobertura) return null
      const grupos = await tx.eventoCoberturaUpload.groupBy({ by: ["dia", "membroId"], where: { coberturaId: id, cobertura: { organizacaoId } }, _count: true, orderBy: { dia: "asc" } })
      const total = grupos.reduce((s, g) => s + g._count, 0)
      const concluidos = cobertura.checklist.filter(c => c.concluido).length
      const porDia: Record<number, number> = {}
      for (const g of grupos) porDia[g.dia] = (porDia[g.dia] ?? 0) + g._count
      const equipeIds = new Set(cobertura.equipe.map(m => m.id))
      const semMembro = grupos.filter(g => !g.membroId || !equipeIds.has(g.membroId)).reduce((s, g) => s + g._count, 0)
      const conteudo = {
        resumo_executivo: `${cobertura.titulo}. Status registrado: ${cobertura.status}. ${total} arquivos enviados; checklist com ${concluidos} de ${cobertura.checklist.length} itens concluídos. Contagem de arquivos não mede qualidade nem confirma entrega ou publicação.`,
        equipe: cobertura.equipe.map(m => ({ nome: m.nome, funcao: m.funcao, arquivos: grupos.filter(g => g.membroId === m.id).reduce((s, g) => s + g._count, 0) })),
        arquivos_por_dia: Object.entries(porDia).map(([dia, arquivos]) => ({ dia: Number(dia), arquivos })),
        pontos_atencao: [
          ...(cobertura.checklist.length ? [`${cobertura.checklist.length - concluidos} itens de checklist pendentes.`] : ["Checklist não cadastrado; conclusão não pode ser medida."]),
          ...(total ? [] : ["Nenhum arquivo registrado."]),
          ...(semMembro ? [`Arquivos sem integrante correspondente nesta cobertura: ${semMembro}.`] : []),
        ],
      }
      // Conserva a categoria legada do histórico; o período identifica a cobertura.
      const relatorio = await tx.relatorioIA.create({ data: { organizacaoId, tipo: "semanal", periodo: `cobertura-${id}`, conteudo, tokens: 0, modelo: "regras-v1" } })
      await tx.eventoCoberturaLog.create({ data: { coberturaId: id, usuarioId: acesso.usuarioId, acao: "relatorio", detalhe: "Resumo de arquivos e checklist por regras, sem IA e sem nota de desempenho." } })
      return { relatorio, conteudo, origem: "regras-v1" }
    }, { isolationLevel: "RepeatableRead" }))
    if (!resultado) return NextResponse.json({ error: "Cobertura não encontrada" }, { status: 404 })
    return NextResponse.json(resultado, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Não foi possível gerar o resumo da cobertura. Tente novamente." }, { status: 503 })
  }
}
