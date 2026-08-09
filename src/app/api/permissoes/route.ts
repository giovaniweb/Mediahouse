import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { PRESETS } from "@/lib/permissoes"
import { getPermissoes, setPermissoes } from "@/lib/permissoes-server"
import { getOrgId, semOrg } from "@/lib/org"

// GET /api/permissoes?usuarioId=xxx — buscar permissões de um usuário
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const usuarioId = req.nextUrl.searchParams.get("usuarioId") || session.user.id

  // Qualquer um pode buscar as próprias permissões; gestor/admin pode buscar de qualquer um
  if (usuarioId !== session.user.id && !ehGestor(session)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  // Só se lê/escreve permissão de quem é membro DESTA empresa — senão um gestor
  // conseguiria inspecionar (e depois alterar) os acessos de gente de outra.
  const membro = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
    select: { papel: true },
  })
  if (!membro) return NextResponse.json({ error: "Pessoa não encontrada nesta organização" }, { status: 404 })

  let permissoes = await getPermissoes(usuarioId, organizacaoId)

  // Se não existir, criar com preset do papel da pessoa nesta empresa
  if (!permissoes) {
    const preset = PRESETS[membro.papel] || PRESETS.solicitante
    permissoes = await setPermissoes(usuarioId, organizacaoId, preset)
  }

  return NextResponse.json(permissoes)
}

// PUT /api/permissoes — atualizar permissões (admin/gestor)
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  if (!ehGestor(session)) {
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

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const erro = await exigirMembro(usuarioId, organizacaoId)
  if (erro) return erro

  const permissoes = await setPermissoes(usuarioId, organizacaoId, data)

  return NextResponse.json(permissoes)
}

// Concede/revoga sempre dentro da empresa ativa — e só para quem é membro dela.
async function exigirMembro(usuarioId: string, organizacaoId: string): Promise<NextResponse | null> {
  const membro = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
    select: { id: true },
  })
  return membro ? null : NextResponse.json({ error: "Pessoa não encontrada nesta organização" }, { status: 404 })
}

// POST /api/permissoes/reset — resetar para preset do tipo
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  if (!ehGestor(session)) {
    return NextResponse.json({ error: "Somente admin/gestor" }, { status: 403 })
  }

  const { usuarioId } = await req.json()
  if (!usuarioId) {
    return NextResponse.json({ error: "usuarioId obrigatório" }, { status: 400 })
  }

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  // O preset vem do papel NESTA empresa, não do tipo global do usuário.
  const membro = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
    select: { papel: true },
  })
  if (!membro) return NextResponse.json({ error: "Pessoa não encontrada nesta organização" }, { status: 404 })

  const preset = PRESETS[membro.papel] || PRESETS.solicitante
  const permissoes = await setPermissoes(usuarioId, organizacaoId, preset)

  return NextResponse.json(permissoes)
}
