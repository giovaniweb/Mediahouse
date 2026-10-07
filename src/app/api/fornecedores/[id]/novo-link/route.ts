import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"
import { novaCredencial, novaValidade } from "@/lib/links-publicos"
import { comOrg } from "@/lib/org-contexto"

type Params = { params: Promise<{ id: string }> }

// POST /api/fornecedores/[id]/novo-link — troca o link do portal do fornecedor.
// O antigo para de abrir na hora; o novo vale 90 dias (lib/links-publicos).
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess("gerenciarFornecedores")
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const { id } = await params
  return comOrg(organizacaoId, async () => {
    const alvo = await prisma.fornecedor.findUnique({ where: { id }, select: { organizacaoId: true } })
    if (!alvo || !pertenceAOrg(alvo, organizacaoId)) return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 })
    const fornecedor = await prisma.fornecedor.update({
      where: { id },
      data: { portalToken: novaCredencial(), portalTokenExpiraEm: novaValidade("fornecedor") },
      select: { portalToken: true, portalTokenExpiraEm: true },
    })
    return NextResponse.json(fornecedor)
  })
}
