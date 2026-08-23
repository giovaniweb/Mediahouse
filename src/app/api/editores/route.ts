import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { criarUsuarioParaProfissional, notificarCredenciaisWhatsapp } from "@/lib/user-helpers"
import { getOrgId, semOrg } from "@/lib/org"
import { vinculosDaEmpresa } from "@/lib/editor-vinculo"
import { gravarDadosPrivadosEditor } from "@/lib/editor-dados"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { searchParams } = req.nextUrl
  const status = searchParams.get("status")
  const usuarioId = searchParams.get("usuarioId")

  // O perfil é da REDE. Quem pertence a ESTA empresa é quem tem vínculo — e é o
  // vínculo que diz status e carga aqui, não o perfil. Filtrar o status pelo
  // vínculo (e não pelo perfil) é o que faz "inativo aqui, ativo lá" funcionar.
  const where = {
    vinculos: {
      some: {
        organizacaoId,
        ...(status ? { status: status as "ativo" | "inativo" } : {}),
      },
    },
    ...(usuarioId ? { usuarioId } : {}),
  }

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

  // Carga e status vêm do vínculo desta empresa, numa consulta só — a lista
  // aparece na tela de equipe e uma consulta por linha viraria N+1. A forma do
  // JSON é preservada (`editor.cargaLimite`, `editor.status`) para as telas não
  // mudarem junto. Salário continua fora da listagem: só no detalhe individual.
  const vinculos = await vinculosDaEmpresa(editores.map((e) => e.id), organizacaoId)
  const editoresComCarga = editores.map((e) => {
    const v = vinculos.get(e.id)
    return {
      ...e,
      // Sem fallback para o perfil: as colunas não existem mais lá. Sem vínculo
      // o editor nem apareceria nesta lista, então o padrão é só defesa.
      cargaLimite: v?.cargaLimite ?? 5,
      status: (v?.status as "ativo" | "inativo") ?? e.status,
      _count: { demandas: e.demandas.length },
    }
  })

  return NextResponse.json({ editores: editoresComCarga })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json()

  const userTipo = (session.user as { tipo?: string }).tipo
  const isPrivileged = userTipo === "admin" || userTipo === "gestor"

  // Perfil recebe só o que é da REDE. Salário, carga, observação interna e
  // fiscais são de quem contratou e vão para o vínculo — inclusive o PIX, que
  // no perfil ficava em texto puro.
  const editor = await prisma.editor.create({
    data: {
      nome: body.nome,
      telefone: body.telefone,
      whatsapp: body.whatsapp,
      email: body.email,
      avatarUrl: body.avatarUrl,
      especialidade: body.especialidade ?? [],
      habilidades: body.habilidades ?? [],
      cidade: body.cidade,
      estado: body.estado,
      redesSociais: body.redesSociais ?? [],
      areasAtuacao: body.areasAtuacao ?? [],
      equipamentos: body.equipamentos ?? [],
      portfolio: body.portfolio,
      fazCaptacao: body.fazCaptacao ?? false,
      ...(body.tipoContrato ? { tipoContrato: body.tipoContrato } : {}),
      ...(body.usuarioId ? { usuarioId: body.usuarioId } : {}),
    },
  })

  await gravarDadosPrivadosEditor({
    editorId: editor.id,
    organizacaoId,
    tipoContrato: body.tipoContrato,
    comercial: {
      cargaLimite: body.cargaLimite ?? 5,
      status: body.status ?? "ativo",
      observacoes: body.observacoes,
      // Salário só entra por admin/gestor — mesma regra de antes, agora aplicada
      // na tabela onde o dado passou a viver.
      ...(isPrivileged && body.salario != null ? { salario: body.salario } : {}),
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

  // Se usuarioId já foi fornecido, o usuário já existe — apenas vincula o Editor ao usuário
  if (body.usuarioId) {
    return NextResponse.json(editor, { status: 201 })
  }

  // Auto-criar conta de acesso (Usuario) para o editor (videomaker interno)
  const telefone = body.whatsapp || body.telefone
  try {
    const { usuario, jáExistia, senha } = await criarUsuarioParaProfissional({
      nome: body.nome,
      email: body.email,
      telefone,
      tipo: "editor",
      referenciaId: editor.id,
      organizacaoId,
    })

    // Notificar via WhatsApp com credenciais
    if (!jáExistia && senha && telefone) {
      await notificarCredenciaisWhatsapp(
        telefone,
        body.nome,
        usuario.email,
        senha,
        organizacaoId,
      )
    }
  } catch (e) {
    console.error("[Editor] Erro ao criar conta de acesso:", e)
    // Não falhar a criação do editor por erro na conta
  }

  return NextResponse.json(editor, { status: 201 })
}
