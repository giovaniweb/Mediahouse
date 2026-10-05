import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"

// PATCH /api/growth/designers/[id] — aprovar ou recusar o cadastro de um
// designer que chegou pela área pública. Só mexe na candidatura DESTA empresa
// e só enquanto ela está pendente: dois cliques não decidem duas vezes, e uma
// empresa não decide pelo candidato da outra.
const schema = z.object({ acao: z.enum(["aprovar", "recusar"]) })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireAcesso("gerenciarDesigners")
  if (acesso instanceof NextResponse) return acesso

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  const { id } = await params
  const aprovar = parsed.data.acao === "aprovar"

  const { count } = await prisma.designerOrganizacao.updateMany({
    where: { organizacaoId: acesso.organizacaoId, designerId: id, status: "pendente" },
    data: { status: aprovar ? "ativo" : "inativo" },
  })
  if (count === 0) return NextResponse.json({ error: "Cadastro pendente não encontrado nesta empresa" }, { status: 404 })

  // O perfil da rede deixa de ser "pendente" quando alguma empresa aprova.
  // Recusa não mexe nele: outra empresa pode aprovar o mesmo designer.
  if (aprovar) {
    await prisma.designer.updateMany({ where: { id, status: "pendente" }, data: { status: "ativo" } })
  }

  return NextResponse.json({ ok: true, status: aprovar ? "ativo" : "inativo" })
}
