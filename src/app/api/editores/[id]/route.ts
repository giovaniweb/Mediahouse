import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { vinculoDaEmpresa, fiscaisDaEmpresa } from "@/lib/editor-vinculo"
import { gravarDadosPrivadosEditor } from "@/lib/editor-dados"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params

  // Sem vínculo com esta empresa, não encontra — o where resolve posse e escopo
  // de uma vez, no lugar do pertenceAOrg que lia a coluna que vai sumir.
  const perfil = await prisma.editor.findFirst({
    where: { id, vinculos: { some: { organizacaoId } } },
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

  if (!perfil) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const userTipo = (session.user as { tipo?: string }).tipo
  const isPrivileged = userTipo === "admin" || userTipo === "gestor"

  // Comercial e fiscais são desta empresa. Só admin/gestor recebe salário e
  // dados fiscais — a mesma regra de antes, agora sobre a tabela certa. Quem não
  // é privilegiado nem chega a ler os fiscais do banco.
  const vinculo = await vinculoDaEmpresa(id, organizacaoId)
  const fiscais = isPrivileged ? await fiscaisDaEmpresa(id, organizacaoId) : null

  const editor = {
    ...perfil,
    cargaLimite: vinculo?.cargaLimite ?? null,
    status: vinculo?.status ?? null,
    observacoes: vinculo?.observacoes ?? null,
    emListaNegra: vinculo?.emListaNegra ?? false,
    listaNegraMotivo: vinculo?.listaNegraMotivo ?? null,
    tipoContrato: perfil.tipoContrato,
    ...(isPrivileged ? { salario: vinculo?.salario ?? null, ...fiscais } : {}),
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

  const alvo = await prisma.editor.findFirst({
    where: { id, vinculos: { some: { organizacaoId } } },
    select: { id: true },
  })
  if (!alvo) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const userTipo = (session.user as { tipo?: string }).tipo
  const isPrivileged = userTipo === "admin" || userTipo === "gestor"

  // Perfil recebe só o que é da REDE; o resto vai para o vínculo desta empresa.
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
      cidade: body.cidade,
      estado: body.estado,
      redesSociais: body.redesSociais,
      areasAtuacao: body.areasAtuacao,
      equipamentos: body.equipamentos,
      portfolio: body.portfolio,
      fazCaptacao: body.fazCaptacao,
      tipoContrato: body.tipoContrato,
    },
  })

  await gravarDadosPrivadosEditor({
    editorId: id,
    organizacaoId,
    comercial: {
      cargaLimite: body.cargaLimite,
      status: body.status,
      observacoes: body.observacoes,
      emListaNegra: body.emListaNegra,
      listaNegraMotivo: body.listaNegraMotivo,
      tipoContrato: body.tipoContrato,
      ...(isPrivileged && body.salario !== undefined ? { salario: body.salario } : {}),
    },
    fiscal: {
      cpfCnpj: body.cpfCnpj,
      razaoSocial: body.razaoSocial,
      nomeFantasia: body.nomeFantasia,
      representante: body.representante,
      endereco: body.endereco,
      chavePix: body.chavePix,
      dadosBancarios: body.dadosBancarios,
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

  // O perfil é da REDE: apagá-lo tira a pessoa de todas as empresas. Excluir
  // aqui passa a significar "desligar desta empresa" — some o vínculo e os
  // fiscais. O perfil só é apagado quando era o último vínculo, ou ele ficaria
  // órfão, sem ninguém que o enxergue.
  const vinculo = await prisma.editorOrganizacao.findUnique({
    where: { organizacaoId_editorId: { organizacaoId, editorId: id } },
    select: { id: true },
  })
  if (!vinculo) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    await tx.editorDadosFiscais.deleteMany({ where: { editorId: id, organizacaoId } })
    await tx.editorOrganizacao.delete({ where: { id: vinculo.id } })
    const restantes = await tx.editorOrganizacao.count({ where: { editorId: id } })
    if (restantes === 0) await tx.editor.delete({ where: { id } })
  })

  return NextResponse.json({ ok: true })
}
