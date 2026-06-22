import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess("gerenciarFornecedores")
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const { id } = await params
  const fornecedor = await prisma.fornecedor.findUnique({
    where: { id },
    include: {
      produtos: { orderBy: { nome: "asc" } },
      custos: {
        include: { evento: { select: { id: true, nome: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  })
  if (!fornecedor || !pertenceAOrg(fornecedor, organizacaoId)) return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 })
  return NextResponse.json({ fornecedor })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess("gerenciarFornecedores")
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const { id } = await params
  const body = await req.json()
  const alvo = await prisma.fornecedor.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!alvo || !pertenceAOrg(alvo, organizacaoId)) return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 })
  const fornecedor = await prisma.fornecedor.update({
    where: { id },
    data: {
      nome: body.nome,
      contato: body.contato,
      cnpj: body.cnpj,
      telefone: body.telefone,
      email: body.email,
      cidade: body.cidade,
      estado: body.estado,
      categoria: body.categoria,
      dadosBancarios: body.dadosBancarios,
      pixKey: body.pixKey,
      observacoes: body.observacoes,
      status: body.status,
      avaliacao: body.avaliacao,
    },
  })
  return NextResponse.json({ fornecedor })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess("gerenciarFornecedores")
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const { id } = await params
  const alvo = await prisma.fornecedor.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!alvo || !pertenceAOrg(alvo, organizacaoId)) return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 })
  const count = await prisma.custoEvento.count({ where: { fornecedorId: id } })
  if (count > 0) {
    await prisma.fornecedor.update({ where: { id }, data: { status: "inativo" } })
    return NextResponse.json({ ok: true, softDelete: true })
  }
  await prisma.fornecedor.delete({ where: { id } })
  return NextResponse.json({ ok: true, softDelete: false })
}
