import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PRESETS } from "@/lib/permissoes"

// GET /api/permissoes?usuarioId=xxx — buscar permissões de um usuário
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const usuarioId = req.nextUrl.searchParams.get("usuarioId") || session.user.id

  // Qualquer um pode buscar as próprias permissões; gestor/admin pode buscar de qualquer um
  if (usuarioId !== session.user.id && !["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  let permissoes = await prisma.permissaoUsuario.findUnique({
    where: { usuarioId },
  })

  // Se não existir, criar com preset do tipo do usuário
  if (!permissoes) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { tipo: true },
    })
    if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

    const preset = PRESETS[usuario.tipo] || PRESETS.solicitante
    permissoes = await prisma.permissaoUsuario.create({
      data: { usuarioId, ...preset },
    })
  }

  return NextResponse.json(permissoes)
}

// PUT /api/permissoes — atualizar permissões (admin/gestor)
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Somente admin/gestor" }, { status: 403 })
  }

  const body = await req.json()
  const { usuarioId, ...perms } = body

  if (!usuarioId) {
    return NextResponse.json({ error: "usuarioId obrigatório" }, { status: 400 })
  }

  // Whitelist de campos permitidos
  const allowed = [
    "verDashboard", "verDemandas", "verAprovacoes", "verAgenda", "verProdutos",
    "verVideomakers", "verEquipe", "verCustos", "verIA", "verAlertas",
    "verRelatorios", "verUsuarios", "verConfiguracoes",
    "criarDemanda", "editarDemanda", "excluirDemanda", "moverKanban",
    "verTodasDemandas", "verKanban", "gerenciarUsuarios", "gerenciarConfig",
  ]

  const data: Record<string, boolean> = {}
  for (const key of allowed) {
    if (typeof perms[key] === "boolean") {
      data[key] = perms[key]
    }
  }

  const permissoes = await prisma.permissaoUsuario.upsert({
    where: { usuarioId },
    create: { usuarioId, ...data },
    update: data,
  })

  return NextResponse.json(permissoes)
}

// POST /api/permissoes/reset — resetar para preset do tipo
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Somente admin/gestor" }, { status: 403 })
  }

  const { usuarioId } = await req.json()
  if (!usuarioId) {
    return NextResponse.json({ error: "usuarioId obrigatório" }, { status: 400 })
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { tipo: true },
  })
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  const preset = PRESETS[usuario.tipo] || PRESETS.solicitante
  const permissoes = await prisma.permissaoUsuario.upsert({
    where: { usuarioId },
    create: { usuarioId, ...preset },
    update: preset,
  })

  return NextResponse.json(permissoes)
}
