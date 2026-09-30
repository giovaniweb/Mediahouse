import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"
import { requireEventoGestaoOrg } from "@/lib/org"

type Params = { params: Promise<{ id: string }> }

// GET /api/eventos/[id] — detalhe completo
export async function GET(_req: NextRequest, { params }: Params) {
  const acesso = await requireAcesso("verEventos")
  if (acesso instanceof NextResponse) return acesso
  const { id } = await params
  const organizacaoId = acesso.organizacaoId
  const podeFinanceiro = acesso.permissoes.verFinanceiroEvento
  try {
    const resultado = await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
      const evento = await tx.eventoGestao.findFirst({
        where: { id, organizacaoId },
        omit: { orcamentoPrevisto: !podeFinanceiro, orcamentoAprovado: !podeFinanceiro },
        include: {
          responsavel: { select: { id: true, nome: true } },
          cobertura: { select: { id: true, slug: true, titulo: true, status: true } },
          checklist: { orderBy: { createdAt: "asc" } },
          documentos: { orderBy: { createdAt: "desc" } },
          custos: podeFinanceiro ? { orderBy: { createdAt: "desc" }, include: { fornecedor: { select: { id: true, nome: true } }, produtoServico: { select: { id: true, nome: true } } } } : false,
          aprovacoes: { where: podeFinanceiro ? {} : { tipo: { notIn: ["orcamento", "contrato"] } }, orderBy: { createdAt: "desc" } },
          demandas: { where: { organizacaoId }, select: {
            id: true, codigo: true, titulo: true, tipoVideo: true, area: true, statusVisivel: true, statusInterno: true,
            videomaker: { select: { nome: true } }, designer: { select: { nome: true } },
          }, orderBy: { createdAt: "asc" } },
          logs: { orderBy: { createdAt: "desc" }, take: 30 },
        },
      })
      if (!evento) return null
      const total = evento.checklist.length + evento.demandas.length
      const concluidos = evento.checklist.filter(t => t.concluido).length + evento.demandas.filter(d => d.statusVisivel === "finalizado").length
      // Consulta não escreve no evento; dados do mesmo snapshot e da mesma empresa.
      const percentualConclusao = total ? Math.round(concluidos / total * 100) : 0
      let financeiro = null
      if (podeFinanceiro) {
        const custos = evento.custos ?? []
        const realizados = custos.filter(c => c.valorReal !== null)
        const av = acesso.permissoes.verCustos ? await tx.custoVideomaker.aggregate({ where: { organizacaoId, demanda: { organizacaoId, eventoGestaoId: id } }, _sum: { valor: true } }) : null
        financeiro = {
          custoEventoPrevisto: custos.length ? custos.reduce((a, c) => a + c.valorPrevisto, 0) : null,
          custoEventoReal: realizados.length ? realizados.reduce((a, c) => a + c.valorReal!, 0) : null,
          itensSemRealizado: custos.length - realizados.length,
          ...(av ? { custoAudiovisual: av._sum.valor } : {}),
        }
      }
      return { evento: { ...evento, percentualConclusao }, financeiro }
    }, { isolationLevel: "RepeatableRead" }))
    if (!resultado) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
    return NextResponse.json(resultado, { headers: { "Cache-Control": "private, no-store" } })
  } catch { return NextResponse.json({ error: "Não foi possível consultar o evento." }, { status: 503 }) }
}

// PUT /api/eventos/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  const acesso = await requireAcesso("verEventos")
  if (acesso instanceof NextResponse) return acesso

  const { id } = await params
  const body = await req.json()
  if (!acesso.permissoes.verFinanceiroEvento && (body.orcamentoPrevisto !== undefined || body.orcamentoAprovado !== undefined)) return NextResponse.json({ error: "Sem permissão financeira" }, { status: 403 })
  for (const chave of ["orcamentoPrevisto", "orcamentoAprovado"]) {
    const valor = body[chave]
    if (valor != null && valor !== "" && (typeof valor !== "number" && typeof valor !== "string" || !Number.isFinite(Number(valor)) || Number(valor) < 0)) return NextResponse.json({ error: "Orçamento inválido" }, { status: 400 })
  }
  return comOrg(acesso.organizacaoId, async () => {
  const guard = await prisma.eventoGestao.findFirst({ where: { id, organizacaoId: acesso.organizacaoId }, select: { id: true } })
  if (!guard) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })

  const evento = await prisma.eventoGestao.update({
    where: { id, organizacaoId: acesso.organizacaoId },
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
      orcamentoPrevisto: body.orcamentoPrevisto !== undefined ? (body.orcamentoPrevisto === null || body.orcamentoPrevisto === "" ? null : Number(body.orcamentoPrevisto)) : undefined,
      orcamentoAprovado: body.orcamentoAprovado !== undefined ? (body.orcamentoAprovado === null || body.orcamentoAprovado === "" ? null : Number(body.orcamentoAprovado)) : undefined,
    },
  })

  await prisma.eventoGestaoLog.create({
    data: { eventoId: id, usuarioId: acesso.usuarioId, acao: "atualizado", detalhe: "Evento atualizado" },
  }).catch(() => null)

  return NextResponse.json({ evento: { id: evento.id } })
  })
}

// DELETE /api/eventos/[id] — soft cancel se tem demandas; hard se vazio
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireEventoGestaoOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const count = await prisma.demanda.count({ where: { eventoGestaoId: id } })

  if (count > 0) {
    await prisma.eventoGestao.update({ where: { id }, data: { status: "cancelado" } })
    return NextResponse.json({ ok: true, softDelete: true })
  }
  await prisma.eventoGestao.delete({ where: { id } })
  return NextResponse.json({ ok: true, softDelete: false })
}
