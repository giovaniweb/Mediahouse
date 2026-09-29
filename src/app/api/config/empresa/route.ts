import { correlacaoAuditoria, registrarAuditoria } from "@/lib/auditoria"
import { comOrg } from "@/lib/org-contexto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { configEmpresaPatch, empresaAdministrativaSelect } from "@/lib/config-empresa"

export async function GET() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const empresa = await prisma.configEmpresa.findFirst({
    where: { organizacaoId: acesso.organizacaoId }, select: empresaAdministrativaSelect,
  })
  return NextResponse.json({ empresa })
}

export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const parsed = configEmpresaPatch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Configuração inválida" }, { status: 400 })
  const { organizacaoId } = acesso
  const correlationId = correlacaoAuditoria()
  const empresa = await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`config:${organizacaoId}`}, 0))`
    const existing = await tx.configEmpresa.findFirst({ where: { organizacaoId }, select: empresaAdministrativaSelect })
    const campos = Object.keys(parsed.data).filter(k => !existing || existing[k as keyof typeof existing] !== parsed.data[k as keyof typeof parsed.data])
    if (existing && !campos.length) return existing
    const atual = existing
      ? await tx.configEmpresa.update({ where: { id: existing.id }, data: parsed.data, select: empresaAdministrativaSelect })
      : await tx.configEmpresa.create({ data: { ...parsed.data, organizacaoId }, select: empresaAdministrativaSelect })
    await registrarAuditoria(tx, acesso, { acao: "configuracao.alterada", recurso: "config_empresa", recursoId: atual.id, correlationId, depois: { campos } })
    return atual
  }))
  return NextResponse.json({ empresa })
}
