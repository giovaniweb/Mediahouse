import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get("status")

  const where = status ? { status: status as "ativo" | "inativo" } : {}

  const editores = await prisma.editor.findMany({
    where,
    include: {
      demandas: {
        where: { statusVisivel: { notIn: ["finalizado"] } },
        select: { id: true, pesoDemanda: true, titulo: true, prioridade: true, statusVisivel: true },
      },
    },
    orderBy: { nome: "asc" },
  })

  // Adicionar _count de demandas ativas para facilitar no frontend
  // Excluir salario da listagem (só visível no detalhe individual)
  const editoresComCarga = editores.map(({ salario, ...e }) => ({
    ...e,
    _count: { demandas: e.demandas.length },
  }))

  return NextResponse.json({ editores: editoresComCarga })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()

  const userTipo = (session.user as { tipo?: string }).tipo
  const isPrivileged = userTipo === "admin" || userTipo === "gestor"

  const editor = await prisma.editor.create({
    data: {
      nome: body.nome,
      telefone: body.telefone,
      whatsapp: body.whatsapp,
      email: body.email,
      avatarUrl: body.avatarUrl,
      especialidade: body.especialidade ?? [],
      habilidades: body.habilidades ?? [],
      cargaLimite: body.cargaLimite ?? 5,
      status: body.status ?? "ativo",
      cidade: body.cidade,
      estado: body.estado,
      cpfCnpj: body.cpfCnpj,
      razaoSocial: body.razaoSocial,
      nomeFantasia: body.nomeFantasia,
      representante: body.representante,
      endereco: body.endereco,
      chavePix: body.chavePix,
      redesSociais: body.redesSociais ?? [],
      dadosBancarios: body.dadosBancarios,
      observacoes: body.observacoes,
      areasAtuacao: body.areasAtuacao ?? [],
      equipamentos: body.equipamentos ?? [],
      portfolio: body.portfolio,
      ...(isPrivileged && body.salario != null ? { salario: body.salario } : {}),
    },
  })

  return NextResponse.json(editor, { status: 201 })
}
