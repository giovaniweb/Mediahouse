import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const demanda = await prisma.demanda.findUnique({
    where: { id },
    include: {
      solicitante: { select: { id: true, nome: true, email: true } },
      gestor: { select: { id: true, nome: true } },
      videomaker: { select: { id: true, nome: true, cidade: true, telefone: true } },
      editor: { select: { id: true, nome: true, especialidade: true } },
      arquivos: { orderBy: { createdAt: "desc" } },
      historicos: {
        include: { usuario: { select: { id: true, nome: true } } },
        orderBy: { createdAt: "desc" },
      },
      comentarios: {
        include: { usuario: { select: { id: true, nome: true } } },
        orderBy: { createdAt: "desc" },
      },
      alertas: {
        where: { status: "ativo" },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!demanda) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  return NextResponse.json({ demanda })
}

const STATUS_VISIVEL_TO_INTERNO: Record<string, string> = {
  entrada: "aguardando_triagem",
  producao: "planejamento",
  edicao: "fila_edicao",
  aprovacao: "revisao_pendente",
  para_postar: "aprovado",
  finalizado: "encerrado",
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  if (body.statusVisivel) {
    const novoStatusInterno = STATUS_VISIVEL_TO_INTERNO[body.statusVisivel]
    const demandaAtual = await prisma.demanda.findUnique({ where: { id }, select: { statusInterno: true } })

    const [demanda] = await prisma.$transaction([
      prisma.demanda.update({
        where: { id },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          statusVisivel: body.statusVisivel as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          statusInterno: novoStatusInterno as any,
        },
      }),
      prisma.historicoStatus.create({
        data: {
          demandaId: id,
          statusAnterior: demandaAtual?.statusInterno ?? null,
          statusNovo: novoStatusInterno,
          origem: "manual",
          usuarioId: session.user.id,
          observacao: `Movido via Kanban para coluna "${body.statusVisivel}"`,
        },
      }),
    ])

    return NextResponse.json(demanda)
  }

  const demanda = await prisma.demanda.update({
    where: { id },
    data: {
      titulo: body.titulo,
      descricao: body.descricao,
      cidade: body.cidade,
      dataLimite: body.dataLimite ? new Date(body.dataLimite) : undefined,
      dataCaptacao: body.dataCaptacao ? new Date(body.dataCaptacao) : undefined,
      videomakerId: body.videomakerId,
      editorId: body.editorId,
      socialId: body.socialId,
      gestorId: body.gestorId,
      linkBrutos: body.linkBrutos,
      linkFinal: body.linkFinal,
      linkPostagem: body.linkPostagem,
      linkCliente: body.linkCliente,
      localGravacao: body.localGravacao,
      motivoImpedimento: body.motivoImpedimento,
    },
  })

  return NextResponse.json(demanda)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  await prisma.demanda.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
