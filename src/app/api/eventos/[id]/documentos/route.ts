import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"
import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { documentoCriar, documentoEditar, podeDecidirEvento } from "@/lib/eventos-documentos"

type Params = { params: Promise<{ id: string }> }
const resposta = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
async function executar(req: NextRequest, { params }: Params, modo: "criar" | "editar" | "excluir") {
  const acesso = await requireAcesso("verEventos")
  if (acesso instanceof NextResponse) return acesso
  const { id } = await params
  let entrada: unknown
  try { entrada = modo === "excluir" ? null : await req.json() } catch { return resposta({ error: "Dados inválidos" }, 400) }
  const criar = modo === "criar" ? documentoCriar.safeParse(entrada) : null
  const editar = modo === "editar" ? documentoEditar.safeParse(entrada) : null
  const docId = modo === "excluir" ? req.nextUrl.searchParams.get("docId") : editar?.success ? editar.data.id : null
  if (criar?.success === false || editar?.success === false || modo === "excluir" && (!docId || docId.length > 128)) return resposta({ error: "Confira os campos e use links HTTP ou HTTPS válidos." }, 400)
  if (criar?.success && criar.data.categoria === "contratos" && !acesso.permissoes.verFinanceiroEvento) return resposta({ error: "Sem permissão financeira" }, 403)
  if (editar?.success && editar.data.status && ["aprovado", "reprovado", "finalizado"].includes(editar.data.status) && !podeDecidirEvento(acesso.papel)) return resposta({ error: "A decisão exige gestão de eventos." }, 403)
  try {
    return await comOrg(acesso.organizacaoId, () => prisma.$transaction(async tx => {
      const eventos = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM eventos_gestao WHERE id=${id} AND "organizacaoId"=${acesso.organizacaoId} FOR UPDATE`
      if (!eventos.length) return resposta({ error: "Evento não encontrado" }, 404)
      const ator = { organizacaoId: acesso.organizacaoId, usuarioId: acesso.usuarioId }
      if (criar?.success) {
        const { prazo, ...campos } = criar.data
        const documento = await tx.eventoGestaoDocumento.create({ data: { ...campos, eventoId: id, prazo: prazo ? new Date(`${prazo}T00:00:00Z`) : null, status: campos.url || campos.linkExterno ? "enviado" : "pendente" } })
        await registrarAuditoria(tx, ator, { acao: "evento.documento", recurso: "documento_evento", recursoId: documento.id, correlationId: correlacaoAuditoria(), depois: { operacao: "criar", decisao: documento.status } })
        return resposta({ documento }, 201)
      }
      const atual = await tx.eventoGestaoDocumento.findFirst({ where: { id: docId!, eventoId: id, ...(acesso.permissoes.verFinanceiroEvento ? {} : { categoria: { not: "contratos" } }) } })
      if (!atual) return resposta({ error: "Documento não encontrado" }, 404)
      // Documento já decidido não pode ser reaberto ou substituído por um leitor.
      if (["aprovado", "reprovado", "finalizado"].includes(atual.status) && !podeDecidirEvento(acesso.papel)) return resposta({ error: "Alterar documento decidido exige gestão de eventos." }, 403)
      if (modo === "excluir") {
        await tx.eventoGestaoDocumento.delete({ where: { id: atual.id } })
        await registrarAuditoria(tx, ator, { acao: "evento.documento", recurso: "documento_evento", recursoId: atual.id, correlationId: correlacaoAuditoria(), antes: { decisao: atual.status }, depois: { operacao: "excluir" } })
      } else if (editar?.success) {
        const { id: _id, ...campos } = editar.data
        const mudou = Object.entries(campos).some(([k, v]) => atual[k as keyof typeof atual] !== v)
        if (!mudou) return resposta({ ok: true })
        await tx.eventoGestaoDocumento.update({ where: { id: atual.id }, data: campos })
        await registrarAuditoria(tx, ator, { acao: "evento.documento", recurso: "documento_evento", recursoId: atual.id, correlationId: correlacaoAuditoria(), antes: { decisao: atual.status }, depois: { operacao: "editar", decisao: campos.status ?? atual.status, campos: Object.keys(campos) } })
      }
      return resposta({ ok: true })
    }))
  } catch { return resposta({ error: "Não foi possível confirmar a alteração do documento." }, 503) }
}
export const POST = (req: NextRequest, params: Params) => executar(req, params, "criar")
export const PATCH = (req: NextRequest, params: Params) => executar(req, params, "editar")
export const DELETE = (req: NextRequest, params: Params) => executar(req, params, "excluir")
