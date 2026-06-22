import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params

  const editor = await prisma.editor.findUnique({
    where: { id },
    include: {
      demandas: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, codigo: true, titulo: true, statusVisivel: true,
          prioridade: true, createdAt: true,
        },
      },
    },
  })

  if (!editor || !pertenceAOrg(editor, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const userTipo = (session.user as { tipo?: string }).tipo
  const isPrivileged = userTipo === "admin" || userTipo === "gestor"

  if (!isPrivileged) {
    const { salario, ...editorSemSalario } = editor
    return NextResponse.json({ editor: editorSemSalario })
  }

  return NextResponse.json({ editor })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  const body = await req.json()

  const alvo = await prisma.editor.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!alvo || !pertenceAOrg(alvo, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const userTipo = (session.user as { tipo?: string }).tipo
  const isPrivileged = userTipo === "admin" || userTipo === "gestor"

  const editor = await prisma.editor.update({
    where: { id },
    data: {
      nome: body.nome,
      telefone: body.telefone,
      whatsapp: body.whatsapp,
      email: body.email,
      avatarUrl: body.avatarUrl,
      especialidade: body.especialidade,
      habilidades: body.habilidades,
      cargaLimite: body.cargaLimite,
      status: body.status,
      cidade: body.cidade,
      estado: body.estado,
      cpfCnpj: body.cpfCnpj,
      razaoSocial: body.razaoSocial,
      nomeFantasia: body.nomeFantasia,
      representante: body.representante,
      endereco: body.endereco,
      chavePix: body.chavePix,
      redesSociais: body.redesSociais,
      dadosBancarios: body.dadosBancarios,
      observacoes: body.observacoes,
      areasAtuacao: body.areasAtuacao,
      equipamentos: body.equipamentos,
      portfolio: body.portfolio,
      fazCaptacao: body.fazCaptacao,
      tipoContrato: body.tipoContrato,
      ...(isPrivileged && body.salario !== undefined ? { salario: body.salario } : {}),
    },
  })

  return NextResponse.json(editor)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  const r = await prisma.editor.deleteMany({ where: { id, organizacaoId } })
  if (r.count === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  return NextResponse.json({ ok: true })
}
