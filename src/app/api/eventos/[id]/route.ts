import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import { recalcularConclusao } from "@/lib/eventos-conclusao"

type Params = { params: Promise<{ id: string }> }

// GET /api/eventos/[id] — detalhe completo
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const evento = await prisma.eventoGestao.findUnique({
    where: { id },
    include: {
      responsavel: { select: { id: true, nome: true } },
      cobertura: { select: { id: true, slug: true, titulo: true, status: true } },
      checklist: { orderBy: { createdAt: "asc" } },
      documentos: { orderBy: { createdAt: "desc" } },
      custos: {
        orderBy: { createdAt: "desc" },
        include: {
          fornecedor: { select: { id: true, nome: true } },
          produtoServico: { select: { id: true, nome: true } },
        },
      },
      aprovacoes: { orderBy: { createdAt: "desc" } },
      demandas: {
        select: {
          id: true, codigo: true, titulo: true, tipoVideo: true,
          statusVisivel: true, statusInterno: true,
          videomaker: { select: { nome: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      logs: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  })

  if (!evento) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })

  // Recalcula % de conclusão sob demanda
  const percentualConclusao = await recalcularConclusao(id)

  // Roll-up financeiro: custos do evento + custos audiovisuais (CustoVideomaker das demandas)
  const demandaIds = evento.demandas.map((d) => d.id)
  const custoAudiovisual = demandaIds.length
    ? await prisma.custoVideomaker.aggregate({
        where: { demandaId: { in: demandaIds } },
        _sum: { valor: true },
      })
    : { _sum: { valor: 0 } }

  const custoEventoReal = evento.custos.reduce((acc, c) => acc + (c.valorReal ?? c.valorPrevisto), 0)
  const custoEventoPrevisto = evento.custos.reduce((acc, c) => acc + c.valorPrevisto, 0)

  return NextResponse.json({
    evento: { ...evento, percentualConclusao },
    financeiro: {
      custoEventoPrevisto,
      custoEventoReal,
      custoAudiovisual: custoAudiovisual._sum.valor ?? 0,
      custoTotal: custoEventoReal + (custoAudiovisual._sum.valor ?? 0),
    },
  })
}

// PUT /api/eventos/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const evento = await prisma.eventoGestao.update({
    where: { id },
    data: {
      nome: body.nome,
      tipo: body.tipo,
      status: body.status,
      descricao: body.descricao,
      objetivo: body.objetivo,
      publicoAlvo: body.publicoAlvo,
      observacoes: body.observacoes,
      cidade: body.cidade,
      estado: body.estado,
      local: body.local,
      dataInicio: body.dataInicio ? new Date(body.dataInicio) : undefined,
      dataFim: body.dataFim ? new Date(body.dataFim) : undefined,
      responsavelId: body.responsavelId,
      orcamentoPrevisto: body.orcamentoPrevisto !== undefined ? (body.orcamentoPrevisto ? parseFloat(body.orcamentoPrevisto) : null) : undefined,
      orcamentoAprovado: body.orcamentoAprovado !== undefined ? (body.orcamentoAprovado ? parseFloat(body.orcamentoAprovado) : null) : undefined,
    },
  })

  await prisma.eventoGestaoLog.create({
    data: { eventoId: id, usuarioId: session.user.id, acao: "atualizado", detalhe: "Evento atualizado" },
  }).catch(() => null)

  return NextResponse.json({ evento })
}

// DELETE /api/eventos/[id] — soft cancel se tem demandas; hard se vazio
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const count = await prisma.demanda.count({ where: { eventoGestaoId: id } })

  if (count > 0) {
    await prisma.eventoGestao.update({ where: { id }, data: { status: "cancelado" } })
    return NextResponse.json({ ok: true, softDelete: true })
  }
  await prisma.eventoGestao.delete({ where: { id } })
  return NextResponse.json({ ok: true, softDelete: false })
}
