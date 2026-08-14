import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"
import { lerValorMonetario } from "@/lib/numeros"
import { erroDeCampo } from "@/lib/erros-api"

// PATCH /api/custos-videomaker/[id] — atualizar custo (ex: marcar como pago)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  const body = await req.json()

  const custo = await prisma.custoVideomaker.findUnique({ where: { id } })
  if (!custo || !pertenceAOrg(custo, organizacaoId)) return NextResponse.json({ error: "Custo não encontrado" }, { status: 404 })

  // Antes: `body.valor ? parseFloat(body.valor) : custo.valor` — um zero é falsy
  // e mantinha o valor anterior sem avisar; texto não numérico virava NaN gravado.
  const valorLido = lerValorMonetario(body.valor)
  if (!valorLido.ok) {
    return erroDeCampo("valor", "Informe um valor numérico maior ou igual a zero.")
  }

  const updated = await prisma.custoVideomaker.update({
    where: { id },
    data: {
      pago: body.pago ?? custo.pago,
      dataPagamento: body.dataPagamento ? new Date(body.dataPagamento) : custo.dataPagamento,
      comprovante: body.comprovante ?? custo.comprovante,
      valor: valorLido.presente && valorLido.valor !== null ? valorLido.valor : custo.valor,
      descricao: body.descricao ?? custo.descricao,
      tipo: body.tipo ?? custo.tipo,
    },
    include: {
      videomaker: { select: { id: true, nome: true } },
      demanda: { select: { id: true, codigo: true, titulo: true } },
    },
  })

  return NextResponse.json({ custo: updated })
}

// DELETE /api/custos-videomaker/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  const r = await prisma.custoVideomaker.deleteMany({ where: { id, organizacaoId } })
  if (r.count === 0) return NextResponse.json({ error: "Custo não encontrado" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
