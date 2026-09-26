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
  const existing = await prisma.configEmpresa.findFirst({ where: { organizacaoId }, select: { id: true } })
  const empresa = existing
    ? await prisma.configEmpresa.update({ where: { id: existing.id }, data: parsed.data, select: empresaAdministrativaSelect })
    : await prisma.configEmpresa.create({ data: { ...parsed.data, organizacaoId }, select: empresaAdministrativaSelect })
  return NextResponse.json({ empresa })
}
