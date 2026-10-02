import { NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { empresaFaturamentoSelect } from "@/lib/config-empresa"

// Dados para emissão de NF apenas quando há obrigação da empresa com este ator.
export async function GET() {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  const custo = await prisma.custoVideomaker.findFirst({
    where: { organizacaoId: acesso.organizacaoId, videomaker: { usuarioId: acesso.usuarioId } },
    select: { id: true },
  })
  if (!custo) return NextResponse.json({ empresa: null }, { status: 404 })
  const empresa = await prisma.configEmpresa.findFirst({
    where: { organizacaoId: acesso.organizacaoId }, select: empresaFaturamentoSelect,
  })
  return NextResponse.json({ empresa })
}
