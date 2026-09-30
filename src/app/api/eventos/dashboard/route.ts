import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"
import type { StatusEventoGestao } from "@prisma/client"

export async function GET() {
  const acesso = await requireAcesso("verEventos")
  if (acesso instanceof NextResponse) return acesso
  const organizacaoId = acesso.organizacaoId
  try {
    const resultado = await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
      const agora = new Date(), ativos = { notIn: ["finalizado", "cancelado"] as StatusEventoGestao[] }
      const proximos = await tx.eventoGestao.count({ where: { organizacaoId, status: ativos, dataInicio: { gte: agora } } })
      const emProducao = await tx.eventoGestao.count({ where: { organizacaoId, status: { in: ["producao", "execucao"] } } })
      const atrasados = await tx.eventoGestao.count({ where: { organizacaoId, status: ativos, dataFim: { lt: agora } } })
      const finalizados = await tx.eventoGestao.count({ where: { organizacaoId, status: "finalizado" } })
      const docsPendentes = await tx.eventoGestaoDocumento.count({ where: { evento: { organizacaoId }, status: "pendente", ...(acesso.permissoes.verFinanceiroEvento ? {} : { categoria: { not: "contratos" as const } }) } })
      let financeiro = null
      if (acesso.permissoes.verFinanceiroEvento) {
        const orcamentos = await tx.eventoGestao.aggregate({ where: { organizacaoId }, _sum: { orcamentoPrevisto: true } })
        const custos = await tx.custoEvento.aggregate({ where: { evento: { organizacaoId } }, _sum: { valorPrevisto: true, valorReal: true } })
        const itensSemRealizado = await tx.custoEvento.count({ where: { evento: { organizacaoId }, valorReal: null } })
        const pagamentosPendentes = await tx.custoEvento.count({ where: { evento: { organizacaoId }, pago: false } })
        financeiro = { totalPrevisto: orcamentos._sum.orcamentoPrevisto, custosPrevistos: custos._sum.valorPrevisto, realizadoInformado: custos._sum.valorReal, itensSemRealizado, pagamentosPendentes }
      }
      return { proximos, emProducao, atrasados, finalizados, docsPendentes, financeiro }
    }, { isolationLevel: "RepeatableRead" }))
    return NextResponse.json(resultado, { headers: { "Cache-Control": "private, no-store" } })
  } catch { return NextResponse.json({ error: "Não foi possível consultar os indicadores de eventos." }, { status: 503 }) }
}
