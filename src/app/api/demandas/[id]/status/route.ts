import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import type { StatusInterno } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { statusInterno, observacao, origem = "manual" } = body

  if (!statusInterno) {
    return NextResponse.json({ error: "statusInterno obrigatório" }, { status: 400 })
  }

  const demandaAtual = await prisma.demanda.findUnique({ where: { id } })
  if (!demandaAtual) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  // Validações de regras de negócio
  if (statusInterno === "brutos_enviados" && !demandaAtual.linkBrutos && !body.linkBrutos) {
    return NextResponse.json(
      { error: "Link dos brutos obrigatório para avançar." },
      { status: 400 }
    )
  }

  if (statusInterno === "edicao_finalizada" && !demandaAtual.linkFinal && !body.linkFinal) {
    return NextResponse.json(
      { error: "Link do vídeo final obrigatório." },
      { status: 400 }
    )
  }

  if (statusInterno === "impedimento" && !observacao && !demandaAtual.motivoImpedimento) {
    return NextResponse.json(
      { error: "Motivo do impedimento obrigatório." },
      { status: 400 }
    )
  }

  const novoStatusVisivel = STATUS_PARA_COLUNA[statusInterno as StatusInterno]

  const [demanda] = await prisma.$transaction([
    prisma.demanda.update({
      where: { id },
      data: {
        statusInterno: statusInterno as StatusInterno,
        statusVisivel: novoStatusVisivel,
        ...(body.linkBrutos && { linkBrutos: body.linkBrutos }),
        ...(body.linkFinal && { linkFinal: body.linkFinal }),
        ...(body.linkPostagem && { linkPostagem: body.linkPostagem }),
        ...(observacao && statusInterno === "impedimento" && {
          motivoImpedimento: observacao,
        }),
      },
    }),
    prisma.historicoStatus.create({
      data: {
        demandaId: id,
        statusAnterior: demandaAtual.statusInterno,
        statusNovo: statusInterno,
        usuarioId: session.user.id,
        origem,
        observacao,
      },
    }),
  ])

  return NextResponse.json(demanda)
}
