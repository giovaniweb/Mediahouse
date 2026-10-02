import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { comOrg } from "@/lib/org-contexto"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pertenceAOrg } from "@/lib/org"

// Garante que o parâmetro pertence à org da sessão (404 se não).
async function assertParamOrg(organizacaoId: string, id: string): Promise<NextResponse | null> {
  const p = await prisma.configParametro.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!pertenceAOrg(p, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  return null
}

// PATCH /api/configuracoes/parametros/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso

  const { id } = await params
  const guard = await assertParamOrg(acesso.organizacaoId, id)
  if (guard) return guard
  const body = await req.json()

  const p = await comOrg(acesso.organizacaoId, () => prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`parametro:${id}`}, 0))`
    const antes = await tx.configParametro.findFirstOrThrow({ where: { id, organizacaoId: acesso.organizacaoId } })
    const data = { ...(body.label !== undefined && { label: body.label }), ...(body.ordem !== undefined && { ordem: body.ordem }), ...(body.ativo !== undefined && { ativo: body.ativo }) }
    const campos = Object.keys(data).filter(k => antes[k as keyof typeof antes] !== data[k as keyof typeof data])
    if (!campos.length) return antes
    const atual = await tx.configParametro.update({ where: { id }, data })
    await registrarAuditoria(tx, acesso, { acao: "configuracao.alterada", recurso: "config_parametro", recursoId: id, correlationId: correlacaoAuditoria(), antes: { ativo: antes.ativo }, depois: { ativo: atual.ativo, campos } })
    return atual
  }))
  return NextResponse.json({ parametro: p })
}

// DELETE /api/configuracoes/parametros/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso

  const papel = acesso.papel
  if (papel !== "admin") return NextResponse.json({ error: "Apenas admin pode excluir parâmetros" }, { status: 403 })

  const { id } = await params
  const guard = await assertParamOrg(acesso.organizacaoId, id)
  if (guard) return guard
  await comOrg(acesso.organizacaoId, () => prisma.$transaction(async tx => {
    await tx.configParametro.delete({ where: { id } })
    await registrarAuditoria(tx, acesso, { acao: "configuracao.alterada", recurso: "config_parametro", recursoId: id, correlationId: correlacaoAuditoria(), depois: { ativo: false } })
  }))
  return NextResponse.json({ ok: true })
}
