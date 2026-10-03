import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { criarUsuarioParaProfissional, notificarCredenciaisWhatsapp } from "@/lib/user-helpers"
import { getOrgId, semOrg } from "@/lib/org"
import { gravarDadosPrivadosVideomaker } from "@/lib/videomaker-dados"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { searchParams } = req.nextUrl
  const status = searchParams.get("status")
  const usuarioId = searchParams.get("usuarioId")

  // O `omit` que existia aqui virou desnecessário: as colunas sensíveis não
  // moram mais no perfil global. Elas vivem em videomaker_dados_fiscais e
  // videomaker_organizacao, por empresa, e são lidas só onde há vínculo.
  //
  // O perfil é da rede, mas o CANDIDATO pendente é da empresa que o recebeu pelo
  // link de cadastro: nome, telefone e e-mail de quem se candidatou à empresa B
  // não aparecem para a empresa A. Fora do pendente, a rede segue visível.
  const videomakers = await prisma.videomaker.findMany({
    where: {
      ...(status ? { status: status as "ativo" | "inativo" | "preferencial" | "pendente" } : {}),
      ...(usuarioId ? { usuarioId } : {}),
      OR: [{ status: { not: "pendente" } }, { vinculos: { some: { organizacaoId } } }],
    },
    include: {
      // As estrelas do cartão só aparecem com avaliação registrada; sem a
      // contagem, não apareciam nunca. Mesmo recorte do detalhe de avaliações.
      _count: { select: { demandas: true, avaliacoes: { where: { OR: [{ organizacaoId }, { organizacaoId: null }] } } } },
    },
    orderBy: [{ status: "asc" }, { nome: "asc" }],
  })

  return NextResponse.json({ videomakers })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  // Videomaker é GLOBAL (sem organizacaoId). A org só identifica quem está cadastrando,
  // usada para enviar as credenciais pelo WhatsApp da empresa responsável.
  const organizacaoId = await getOrgId(session)

  const body = await req.json()

  // O perfil global só recebe o que é público (a rede inteira enxerga). Diária,
  // observação, CPF e banco são da empresa que cadastrou e vão para o vínculo.
  const videomaker = await prisma.videomaker.create({
    data: {
      nome: body.nome,
      cidade: body.cidade,
      estado: body.estado,
      telefone: body.telefone,
      email: body.email,
      status: body.status ?? "ativo",
      areasAtuacao: body.areasAtuacao ?? [],
      portfolio: body.portfolio,
      podeEditar: body.podeEditar ?? false,
      ...(body.tipoContrato ? { tipoContrato: body.tipoContrato } : {}),
      ...(body.usuarioId ? { usuarioId: body.usuarioId } : {}),
    },
  })

  await gravarDadosPrivadosVideomaker({
    videomakerId: videomaker.id,
    organizacaoId,
    tipoContrato: body.tipoContrato,
    comercial: {
      valorDiaria: body.valorDiaria ? parseFloat(body.valorDiaria) : undefined,
      observacoes: body.observacoes,
      status: body.status ?? "ativo",
      podeEditar: body.podeEditar ?? false,
    },
    fiscal: { cpfCnpj: body.cpfCnpj, dadosBancarios: body.dadosBancarios },
  })

  // Se usuarioId já foi fornecido, o usuário já existe — apenas vincula o Videomaker ao usuário
  if (body.usuarioId) {
    return NextResponse.json(videomaker, { status: 201 })
  }

  // Auto-criar conta de acesso (Usuario) para o videomaker
  try {
    const { usuario, jáExistia, senha } = await criarUsuarioParaProfissional({
      nome: body.nome,
      email: body.email,
      telefone: body.telefone,
      tipo: "videomaker",
      referenciaId: videomaker.id,
      organizacaoId,
    })

    // Notificar via WhatsApp com credenciais
    if (!jáExistia && senha && body.telefone) {
      await notificarCredenciaisWhatsapp(
        body.telefone,
        body.nome,
        usuario.email,
        senha,
        organizacaoId,
      )
    }
  } catch (e) {
    console.error("[Videomaker] Erro ao criar conta de acesso:", e)
    // Não falhar a criação do videomaker por erro na conta
  }

  return NextResponse.json(videomaker, { status: 201 })
}
