import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { escopoSocial, podeEditarLinha, semLinha } from "@/lib/social"
import { lerIdeiaSocial } from "@/lib/social-quadro"

// POST /api/social/ideias — "Salvar como ideia" no formulário de demanda.
// Entra no MESMO banco de ideias de /ideias (IdeiaVideo), já na linha dela e
// visível para a empresa: a ideia da social não é rascunho privado, o gestor
// acompanha o quadro.
export async function POST(req: NextRequest) {
  const session = await auth()
  const escopo = await escopoSocial(session)
  if (escopo instanceof NextResponse) return escopo

  const body = await req.json().catch(() => ({}))
  const lido = lerIdeiaSocial(body)
  if (!lido.ok) return NextResponse.json({ error: lido.motivo }, { status: 400 })
  const linhaProjetoId = typeof body.linhaProjetoId === "string" ? body.linhaProjetoId : ""
  if (!podeEditarLinha(escopo, linhaProjetoId)) return semLinha()

  const ideia = await prisma.ideiaVideo.create({
    data: {
      organizacaoId: escopo.organizacaoId,
      usuarioId: escopo.usuarioId,
      linhaProjetoId,
      origem: "manual",
      status: "nova",
      ...lido.dados,
      // Ideia nova ainda não tem anexo: o caminho do arquivo leva o id dela.
      formulario: lido.dados.formulario ? { ...lido.dados.formulario, anexosIdeia: [] } as Prisma.InputJsonValue : undefined,
    },
    select: { id: true },
  })
  return NextResponse.json(ideia, { status: 201 })
}
