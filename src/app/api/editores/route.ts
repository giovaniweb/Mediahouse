import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { criarUsuarioParaProfissional } from "@/lib/user-helpers"
import { prismaAuth } from "@/lib/prisma-auth"
import { enviarEmailConvite, gerarTokenConvite, linkConvite } from "@/lib/convite-equipe"
import { getOrgId, semOrg } from "@/lib/org"
import { vinculosDaEmpresa } from "@/lib/editor-vinculo"
import { gravarDadosPrivadosEditor } from "@/lib/editor-dados"
import { semCapacidade } from "@/lib/acesso"

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
      // A tela de equipe diz "Sem avaliações registradas" quando a contagem é
      // zero; sem ela aqui, dizia isso de todo editor. Mesmo recorte de
      // /api/editores/[id]/avaliar: desta empresa e as antigas sem empresa.
      _count: { select: { avaliacoes: { where: { OR: [{ organizacaoId }, { organizacaoId: null }] } } } },
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
      _count: { demandas: e.demandas.length, avaliacoes: e._count.avaliacoes },
    }
  })

  return NextResponse.json({ editores: editoresComCarga })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  // Auditoria de 18/11/2026: qualquer pessoa logada cadastrava perfil e conta.
  const negado = await semCapacidade("verEquipe")
  if (negado) return negado
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json()
  // Ligar o perfil a uma conta que já existe só vale para quem é desta empresa:
  // antes qualquer id da plataforma servia.
  if (body.usuarioId !== undefined && body.usuarioId !== null) {
    const membro = typeof body.usuarioId === "string" && organizacaoId
      ? await prisma.usuarioOrganizacao.findUnique({ where: { usuarioId_organizacaoId: { usuarioId: body.usuarioId, organizacaoId } }, select: { id: true } })
      : null
    if (!membro) return NextResponse.json({ error: "Conta não encontrada nesta empresa" }, { status: 400 })
  }

  const isPrivileged = ehGestor(session)

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
  let acesso: "pendente" | "convite_enviado" | null = null
  try {
    const { usuario, jáExistia } = await criarUsuarioParaProfissional({
      nome: body.nome,
      email: body.email,
      telefone,
      tipo: "editor",
      referenciaId: editor.id,
      organizacaoId,
    })

    // A conta nasce sem senha (auditoria de 18/11/2026 — antes ia "nuflow" + 4
    // dígitos do telefone pelo WhatsApp). Com e-mail, vai o convite de criar a
    // senha, o mesmo de Pessoas & Acessos; sem e-mail, o convite sai de lá
    // quando a gestão puser um.
    if (!jáExistia) {
      acesso = "pendente"
      if (usuario.email) {
        const empresa = await prisma.organizacao.findUnique({ where: { id: organizacaoId }, select: { nome: true } })
        const token = await gerarTokenConvite(prismaAuth, usuario.email)
        const envio = await enviarEmailConvite({ para: usuario.email, nome: usuario.nome, empresa: empresa?.nome ?? "NuFlow", papel: "editor", link: linkConvite(token), convidadoPor: session.user.name ?? null })
        if (envio.ok) acesso = "convite_enviado"
      }
    }
  } catch (e) {
    console.error("[Editor] Erro ao criar conta de acesso:", e)
    // Não falhar a criação do editor por erro na conta
  }

  return NextResponse.json({ ...editor, acesso }, { status: 201 })
}
