import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"
import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { aprovacaoCriar, aprovacaoDecidir, podeDecidirEvento, tipoFinanceiro } from "@/lib/eventos-documentos"

type Params = { params: Promise<{ id: string }> }
const resposta = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
async function executar(req: NextRequest, { params }: Params, decidir: boolean) {
  const acesso = await requireAcesso("verEventos")
  if (acesso instanceof NextResponse) return acesso
  if (decidir && !podeDecidirEvento(acesso.papel)) return resposta({ error: "A decisão exige gestão de eventos." }, 403)
  let body: unknown
  try { body = await req.json() } catch { return resposta({ error: "Dados inválidos" }, 400) }
  const criacao = decidir ? null : aprovacaoCriar.safeParse(body)
  const decisao = decidir ? aprovacaoDecidir.safeParse(body) : null
  if (criacao?.success === false || decisao?.success === false) return resposta({ error: "Tipo ou decisão inválidos" }, 400)
  if (criacao?.success && tipoFinanceiro(criacao.data.tipo) && !acesso.permissoes.verFinanceiroEvento) return resposta({ error: "Sem permissão financeira" }, 403)
  const { id } = await params
  try {
    return await comOrg(acesso.organizacaoId, () => prisma.$transaction(async tx => {
      const eventos = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM eventos_gestao WHERE id=${id} AND "organizacaoId"=${acesso.organizacaoId} FOR UPDATE`
      if (!eventos.length) return resposta({ error: "Evento não encontrado" }, 404)
      const ator = { organizacaoId: acesso.organizacaoId, usuarioId: acesso.usuarioId }
      if (criacao?.success) {
        const aprovacao = await tx.eventoGestaoAprovacao.create({ data: { ...criacao.data, eventoId: id, status: "pendente" } })
        await registrarAuditoria(tx, ator, { acao: "evento.aprovacao", recurso: "aprovacao_evento", recursoId: aprovacao.id, correlationId: correlacaoAuditoria(), depois: { operacao: "criar", decisao: "pendente" } })
        return resposta({ aprovacao }, 201)
      }
      if (!decisao?.success) return resposta({ error: "Decisão inválida" }, 400)
      const atual = await tx.eventoGestaoAprovacao.findFirst({ where: { id: decisao.data.id, eventoId: id, ...(acesso.permissoes.verFinanceiroEvento ? {} : { tipo: { notIn: ["orcamento", "contrato"] } }) } })
      if (!atual) return resposta({ error: "Aprovação não encontrada" }, 404)
      if (atual.status !== "pendente") {
        if (atual.status === decisao.data.status && atual.aprovadoPor === acesso.usuarioId && (decisao.data.observacao === undefined || decisao.data.observacao === atual.observacao)) return resposta({ ok: true })
        return resposta({ error: "Esta solicitação já foi decidida. Atualize a lista." }, 409)
      }
      await tx.eventoGestaoAprovacao.update({ where: { id: atual.id }, data: { status: decisao.data.status, aprovadoPor: acesso.usuarioId, ...(decisao.data.observacao !== undefined ? { observacao: decisao.data.observacao } : {}) } })
      await registrarAuditoria(tx, ator, { acao: "evento.aprovacao", recurso: "aprovacao_evento", recursoId: atual.id, correlationId: correlacaoAuditoria(), antes: { decisao: atual.status }, depois: { decisao: decisao.data.status } })
      return resposta({ ok: true })
    }))
  } catch { return resposta({ error: "Não foi possível confirmar a aprovação." }, 503) }
}
export const POST = (req: NextRequest, params: Params) => executar(req, params, false)
export const PATCH = (req: NextRequest, params: Params) => executar(req, params, true)
