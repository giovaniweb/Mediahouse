import { NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { criarOrcamentoIA } from "@/lib/ia-orcamento"

export async function GET() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  try {
    const resumo = await criarOrcamentoIA(prisma).resumo(acesso.organizacaoId)
    return NextResponse.json({ ...resumo, cobertura: "relatorios.gerar" }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar o consumo de IA." }, { status: 503 })
  }
}
