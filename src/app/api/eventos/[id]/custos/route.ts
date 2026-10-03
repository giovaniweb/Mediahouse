import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"
import type { CategoriaCusto } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

// POST — lança custo
export async function POST(req: NextRequest, { params }: Params) {
  const acesso = await requireAcesso("verEventos")
  if (acesso instanceof NextResponse) return acesso
  if (!acesso.permissoes.verFinanceiroEvento) return NextResponse.json({ error: "Sem permissão financeira" }, { status: 403 })
  const { id } = await params
  return comOrg(acesso.organizacaoId, async () => {
  const guard = await prisma.eventoGestao.findFirst({ where: { id, organizacaoId: acesso.organizacaoId }, select: { id: true } })
  if (!guard) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
  const body = await req.json()
  for (const campo of ["valorPrevisto", "valorReal"]) {
    const valor = body[campo]
    if (valor != null && valor !== "" && (typeof valor !== "number" && typeof valor !== "string" || !Number.isFinite(Number(valor)) || Number(valor) < 0)) return NextResponse.json({ error: "Valor inválido" }, { status: 400 })
  }
  if (!body.descricao?.trim()) return NextResponse.json({ error: "Descrição obrigatória" }, { status: 400 })

  const custo = await prisma.custoEvento.create({
    data: {
      eventoId: id,
      descricao: body.descricao.trim(),
      categoria: (body.categoria ?? "extras") as CategoriaCusto,
      valorPrevisto: body.valorPrevisto ? parseFloat(body.valorPrevisto) : 0,
      valorReal: body.valorReal == null || body.valorReal === "" ? null : Number(body.valorReal),
      quantidade: body.quantidade ? parseFloat(body.quantidade) : null,
      fornecedorId: body.fornecedorId || null,
      produtoServicoId: body.produtoServicoId || null,
      dataVencimento: body.dataVencimento ? new Date(body.dataVencimento) : null,
    },
  })
  return NextResponse.json({ custo }, { status: 201 })
  })
}

// PATCH — atualiza pago/valorReal
export async function PATCH(req: NextRequest, { params }: Params) {
  const acesso = await requireAcesso("verEventos")
  if (acesso instanceof NextResponse) return acesso
  if (!acesso.permissoes.verFinanceiroEvento) return NextResponse.json({ error: "Sem permissão financeira" }, { status: 403 })
  const { id } = await params
  return comOrg(acesso.organizacaoId, async () => {
  const guard = await prisma.eventoGestao.findFirst({ where: { id, organizacaoId: acesso.organizacaoId }, select: { id: true } })
  if (!guard) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
  const body = await req.json()
  for (const campo of ["valorPrevisto", "valorReal"]) {
    const valor = body[campo]
    if (valor != null && valor !== "" && (typeof valor !== "number" && typeof valor !== "string" || !Number.isFinite(Number(valor)) || Number(valor) < 0)) return NextResponse.json({ error: "Valor inválido" }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  const r = await prisma.custoEvento.updateMany({
    where: { id: body.id, eventoId: id, evento: { organizacaoId: acesso.organizacaoId } },
    data: {
      ...(body.valorReal !== undefined ? { valorReal: body.valorReal == null || body.valorReal === "" ? null : Number(body.valorReal) } : {}),
      ...(body.pago !== undefined ? { pago: body.pago, dataPagamento: body.pago ? new Date() : null } : {}),
      ...(body.statusPagamento !== undefined ? { statusPagamento: body.statusPagamento } : {}),
    },
  })
  if (r.count === 0) return NextResponse.json({ error: "Custo não encontrado" }, { status: 404 })
  return NextResponse.json({ ok: true })
  })
}

// DELETE ?custoId=
export async function DELETE(req: NextRequest, { params }: Params) {
  const acesso = await requireAcesso("verEventos")
  if (acesso instanceof NextResponse) return acesso
  if (!acesso.permissoes.verFinanceiroEvento) return NextResponse.json({ error: "Sem permissão financeira" }, { status: 403 })
  const { id } = await params
  return comOrg(acesso.organizacaoId, async () => {
  const guard = await prisma.eventoGestao.findFirst({ where: { id, organizacaoId: acesso.organizacaoId }, select: { id: true } })
  if (!guard) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
  const custoId = req.nextUrl.searchParams.get("custoId")
  if (!custoId) return NextResponse.json({ error: "custoId obrigatório" }, { status: 400 })
  const r = await prisma.custoEvento.deleteMany({ where: { id: custoId, eventoId: id, evento: { organizacaoId: acesso.organizacaoId } } })
  if (r.count === 0) return NextResponse.json({ error: "Custo não encontrado" }, { status: 404 })
  return NextResponse.json({ ok: true })
  })
}
