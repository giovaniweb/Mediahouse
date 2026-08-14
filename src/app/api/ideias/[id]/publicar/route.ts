import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { erroDeCampo } from "@/lib/erros-api"

// POST /api/ideias/[id]/publicar — tira o rascunho da gaveta.
//
// Enquanto está em rascunho, a ideia só aparece para quem escreveu. Publicar é o
// momento em que ela entra no banco coletivo e passa a ser triada pelo time — é
// o "subir p cada responsável" que a equipe descreveu.
//
// Só o autor publica: é o rascunho dele, e ninguém mais deveria nem enxergá-lo.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params

  const ideia = await prisma.ideiaVideo.findFirst({
    where: { id, organizacaoId },
    select: { id: true, status: true, usuarioId: true },
  })
  if (!ideia) return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })

  if (ideia.status !== "rascunho") {
    return erroDeCampo("status", "Esta ideia já foi publicada.")
  }

  // 404 em vez de 403: quem não é o autor não deveria saber que o rascunho existe.
  if (ideia.usuarioId !== session.user.id) {
    return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })
  }

  const atualizada = await prisma.ideiaVideo.update({
    where: { id },
    data: { status: "nova" },
    select: { id: true, titulo: true, status: true },
  })

  return NextResponse.json({ ok: true, ideia: atualizada })
}
