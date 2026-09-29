import { correlacaoAuditoria, registrarAuditoria } from "@/lib/auditoria"
import { comOrg } from "@/lib/org-contexto"
import type { MapaPermissoes } from "@/lib/permissoes"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { PRESETS } from "@/lib/permissoes"
import { getPermissoes, setPermissoes } from "@/lib/permissoes-server"

// GET /api/permissoes?usuarioId=xxx — buscar permissões de um usuário
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso

  const { organizacaoId } = acesso

  const usuarioId = req.nextUrl.searchParams.get("usuarioId") || acesso.usuarioId

  // Qualquer um pode buscar as próprias permissões; gestor/admin pode buscar de qualquer um
  if (usuarioId !== acesso.usuarioId && !acesso.permissoes.gerenciarUsuarios) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  // Só se lê/escreve permissão de quem é membro DESTA empresa — senão um gestor
  // conseguiria inspecionar (e depois alterar) os acessos de gente de outra.
  const membro = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
    select: { papel: true },
  })
  if (!membro) return NextResponse.json({ error: "Pessoa não encontrada nesta organização" }, { status: 404 })

  const permissoes = await getPermissoes(usuarioId, organizacaoId)

  // Ausência legítima herda o papel, sem criar uma exceção persistente num GET.
  return NextResponse.json(permissoes ?? PRESETS[membro.papel] ?? PRESETS.solicitante)
}

// PUT /api/permissoes — atualizar permissões (admin/gestor)
export async function PUT(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarUsuarios")
  if (acesso instanceof NextResponse) return acesso


  const body = await req.json()
  const { usuarioId, ...perms } = body

  if (!usuarioId) {
    return NextResponse.json({ error: "usuarioId obrigatório" }, { status: 400 })
  }

  if (usuarioId === acesso.usuarioId) return NextResponse.json({ error: "Outra pessoa autorizada deve alterar suas permissões" }, { status: 403 })

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

  const { organizacaoId } = acesso
  const erro = await exigirMembro(usuarioId, organizacaoId)
  if (erro) return erro

  const permissoes = await alterarPermissoes(acesso, usuarioId, data)

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
  const acesso = await requireAcesso("gerenciarUsuarios")
  if (acesso instanceof NextResponse) return acesso


  const { usuarioId } = await req.json()
  if (!usuarioId) {
    return NextResponse.json({ error: "usuarioId obrigatório" }, { status: 400 })
  }

  const { organizacaoId } = acesso

  if (usuarioId === acesso.usuarioId) return NextResponse.json({ error: "Outra pessoa autorizada deve alterar suas permissões" }, { status: 403 })

  // O preset vem do papel NESTA empresa, não do tipo global do usuário.
  const membro = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
    select: { papel: true },
  })
  if (!membro) return NextResponse.json({ error: "Pessoa não encontrada nesta organização" }, { status: 404 })

  const preset = PRESETS[membro.papel] || PRESETS.solicitante
  const permissoes = await alterarPermissoes(acesso, usuarioId, preset)

  return NextResponse.json(permissoes)
}

async function alterarPermissoes(acesso: { organizacaoId: string; usuarioId: string }, usuarioId: string, valores: Partial<MapaPermissoes>) {
  const correlationId = correlacaoAuditoria()
  return comOrg(acesso.organizacaoId, () => prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`permissoes:${acesso.organizacaoId}:${usuarioId}`}, 0))`
    const membro = await tx.usuarioOrganizacao.findUniqueOrThrow({ where: { usuarioId_organizacaoId: { usuarioId, organizacaoId: acesso.organizacaoId } }, select: { papel: true } })
    const anterior = await tx.permissaoUsuario.findUnique({ where: { usuarioId_organizacaoId: { usuarioId, organizacaoId: acesso.organizacaoId } } })
    if (anterior && Object.entries(valores).every(([k,v]) => anterior[k as keyof typeof anterior] === v)) return anterior
    const atualizado = await setPermissoes(usuarioId, acesso.organizacaoId, valores, tx)
    await registrarAuditoria(tx, acesso, { acao: "permissoes.alteradas", recurso: "usuario", recursoId: usuarioId, correlationId,
      antes: anterior ?? PRESETS[membro.papel], depois: atualizado })
    return atualizado
  }))
}
