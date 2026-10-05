import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"

// GET /api/growth/designers — designers externos DESTA empresa: os que se
// cadastraram pela área pública e aguardam a equipe (pendente) e os aprovados.
// Recusado vira inativo e sai da lista. WhatsApp e portfólio de candidato são
// dado pessoal: só quem gerencia a equipe criativa vê.
export async function GET() {
  const acesso = await requireAcesso("gerenciarDesigners")
  if (acesso instanceof NextResponse) return acesso

  const vinculos = await prisma.designerOrganizacao.findMany({
    where: { organizacaoId: acesso.organizacaoId, status: { in: ["pendente", "ativo"] }, emListaNegra: false },
    select: {
      status: true, createdAt: true,
      designer: { select: { id: true, nome: true, whatsapp: true, email: true, cidade: true, estado: true, portfolio: true, especialidade: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const designers = vinculos.map(({ status, createdAt, designer }) => ({ ...designer, status, cadastradoEm: createdAt }))

  return NextResponse.json({ designers })
}
