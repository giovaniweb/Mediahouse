import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { criarUsuarioParaProfissional, notificarCredenciaisWhatsapp } from "@/lib/user-helpers"
import { getOrgId, semOrg } from "@/lib/org"

// GET /api/designers — lista designers
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { searchParams } = req.nextUrl
  const status = searchParams.get("status")
  const usuarioId = searchParams.get("usuarioId")

  const designers = await prisma.designer.findMany({
    where: {
      organizacaoId,
      ...(status ? { status: status as "ativo" | "inativo" } : {}),
      ...(usuarioId ? { usuarioId } : {}),
    },
    include: { _count: { select: { demandas: true } } },
    orderBy: [{ status: "asc" }, { nome: "asc" }],
  })

  return NextResponse.json({ designers })
}

// POST /api/designers — cria designer (+ conta de acesso)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json()
  if (!body.nome?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  const designer = await prisma.designer.create({
    data: {
      organizacaoId,
      nome: body.nome.trim(),
      cidade: body.cidade,
      estado: body.estado,
      telefone: body.telefone,
      whatsapp: body.whatsapp,
      email: body.email,
      cpfCnpj: body.cpfCnpj,
      chavePix: body.chavePix,
      valorDiaria: body.valorDiaria ? parseFloat(body.valorDiaria) : undefined,
      salario: body.salario ? parseFloat(body.salario) : undefined,
      dadosBancarios: body.dadosBancarios,
      status: body.status ?? "ativo",
      observacoes: body.observacoes,
      especialidade: body.especialidade ?? [],
      habilidades: body.habilidades ?? [],
      portfolio: body.portfolio,
      tipoContrato: body.tipoContrato ?? "externo",
      ...(body.usuarioId ? { usuarioId: body.usuarioId } : {}),
    },
  })

  if (body.usuarioId) return NextResponse.json(designer, { status: 201 })

  // Auto-criar conta de acesso (tipo=designer)
  try {
    const { jáExistia, senha } = await criarUsuarioParaProfissional({
      nome: body.nome,
      email: body.email,
      telefone: body.telefone,
      tipo: "designer",
      referenciaId: designer.id,
      organizacaoId,
    })
    if (!jáExistia && senha && body.telefone) {
      await notificarCredenciaisWhatsapp(body.telefone, body.nome, body.email ?? null, senha, organizacaoId)
    }
  } catch (e) {
    console.error("[Designer] Erro ao criar conta de acesso:", e)
  }

  return NextResponse.json(designer, { status: 201 })
}
