import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { criarUsuarioParaProfissional, notificarCredenciaisWhatsapp } from "@/lib/user-helpers"
import { getOrgId, semOrg } from "@/lib/org"
import { gravarDadosPrivadosVideomaker } from "@/lib/videomaker-dados"
import { scoresDaRede } from "@/lib/rede"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { searchParams } = req.nextUrl
  const status = searchParams.get("status")
  const usuarioId = searchParams.get("usuarioId")

  // A lista é a DA EMPRESA: quem tem vínculo com ela. Até a Onda 2B esta rota
  // devolvia a rede inteira, com telefone e e-mail de quem nunca trabalhou com
  // a empresa — e os Termos do Profissional prometem que o contato só aparece
  // depois que ele aceita o convite. Quem é de fora a empresa encontra em
  // /videomakers/rede, com o score e sem o contato.
  //
  // O candidato pendente já nasce com vínculo com a empresa que o recebeu pelo
  // link de cadastro, então continua aparecendo só para ela.
  const vinculos = await prisma.videomakerOrganizacao.findMany({
    where: {
      organizacaoId,
      ...(status ? { status: status as "ativo" | "inativo" | "preferencial" | "pendente" } : {}),
      ...(usuarioId ? { videomaker: { usuarioId } } : {}),
    },
    select: {
      status: true, valorDiaria: true, emListaNegra: true, tipoContrato: true, podeEditar: true,
      videomaker: {
        include: { _count: { select: { demandas: { where: { organizacaoId } } } } },
      },
    },
  })
  const scores = await scoresDaRede("videomaker", vinculos.map(v => v.videomaker.id))
  const ordem = { preferencial: 0, ativo: 1, pendente: 2, inativo: 3 } as const
  const videomakers = vinculos
    .map(v => ({
      ...v.videomaker,
      // Situação e diária são do combinado desta empresa, não do perfil.
      status: v.status,
      valorDiaria: v.valorDiaria,
      emListaNegra: v.emListaNegra,
      // Contrato e edição também são do vínculo (o PUT grava ali).
      tipoContrato: v.tipoContrato,
      podeEditar: v.podeEditar,
      score: scores.get(v.videomaker.id),
    }))
    .sort((a, b) => ordem[a.status] - ordem[b.status] || a.nome.localeCompare(b.nome, "pt-BR"))

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
    // A conta nasce vinculada à empresa que cadastra; sem empresa ativa não há
    // a quem vincular — e sob RLS a pessoa sem vínculo nem poderia ser gravada.
    if (!organizacaoId) throw new Error("sem empresa ativa para vincular a conta")
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
