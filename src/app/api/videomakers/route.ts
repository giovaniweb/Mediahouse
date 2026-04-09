import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { criarUsuarioParaProfissional, notificarCredenciaisWhatsapp } from "@/lib/user-helpers"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get("status")
  const usuarioId = searchParams.get("usuarioId")

  const videomakers = await prisma.videomaker.findMany({
    where: {
      ...(status ? { status: status as "ativo" | "inativo" | "preferencial" } : {}),
      ...(usuarioId ? { usuarioId } : {}),
    },
    include: {
      _count: { select: { demandas: true } },
    },
    orderBy: [{ status: "asc" }, { nome: "asc" }],
  })

  return NextResponse.json({ videomakers })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()

  const videomaker = await prisma.videomaker.create({
    data: {
      nome: body.nome,
      cidade: body.cidade,
      estado: body.estado,
      telefone: body.telefone,
      email: body.email,
      cpfCnpj: body.cpfCnpj,
      valorDiaria: body.valorDiaria ? parseFloat(body.valorDiaria) : undefined,
      dadosBancarios: body.dadosBancarios,
      status: body.status ?? "ativo",
      observacoes: body.observacoes,
      areasAtuacao: body.areasAtuacao ?? [],
      portfolio: body.portfolio,
      podeEditar: body.podeEditar ?? false,
      ...(body.usuarioId ? { usuarioId: body.usuarioId } : {}),
    },
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
    })

    // Notificar via WhatsApp com credenciais
    if (!jáExistia && senha && body.telefone) {
      await notificarCredenciaisWhatsapp(
        body.telefone,
        body.nome,
        usuario.email,
        senha,
      )
    }
  } catch (e) {
    console.error("[Videomaker] Erro ao criar conta de acesso:", e)
    // Não falhar a criação do videomaker por erro na conta
  }

  return NextResponse.json(videomaker, { status: 201 })
}
