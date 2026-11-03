import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"
import { novaCredencial, novaValidade } from "@/lib/links-publicos"

// O link externo do Relatório Executivo (/relatorio-executivo?token=) e o
// acesso do MCP usam a mesma credencial da empresa. Até 07/10/2026 ela era
// colocada à mão no banco e valia para sempre. Agora quem administra a empresa
// vê a validade e gera outra (180 dias). Gerar outra desliga a anterior —
// inclusive no MCP, que precisa receber a nova.

// GET — o link atual e até quando vale (nada se não houver).
export async function GET() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const org = await comOrg(acesso.organizacaoId, () => prisma.organizacao.findUnique({
    where: { id: acesso.organizacaoId },
    select: { relatorioToken: true, relatorioTokenExpiraEm: true },
  }))
  if (!org?.relatorioToken) return NextResponse.json({ token: null, expiraEm: null }, { headers: { "Cache-Control": "private, no-store" } })
  return NextResponse.json({ token: org.relatorioToken, expiraEm: org.relatorioTokenExpiraEm }, { headers: { "Cache-Control": "private, no-store" } })
}

// POST — gera a credencial nova.
export async function POST() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const org = await comOrg(acesso.organizacaoId, () => prisma.organizacao.update({
    where: { id: acesso.organizacaoId },
    data: { relatorioToken: novaCredencial(), relatorioTokenExpiraEm: novaValidade("relatorio") },
    select: { relatorioToken: true, relatorioTokenExpiraEm: true },
  }))
  return NextResponse.json({ token: org.relatorioToken, expiraEm: org.relatorioTokenExpiraEm }, { headers: { "Cache-Control": "private, no-store" } })
}
