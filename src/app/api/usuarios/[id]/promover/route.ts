import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { dimensoesParaTipo } from "@/lib/pessoas"
import type { TipoUsuario } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

// POST /api/usuarios/[id]/promover
// Body: { tipo }
// Promove um solicitante na ORGANIZAÇÃO ATIVA: atualiza Usuario.tipo (compat) e a
// membership (papel/categoria/funcaoProfissional/areas). Só promove pessoa da org.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const userTipo = (session.user as { tipo?: string }).tipo
  if (userTipo !== "admin" && userTipo !== "gestor") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  const body = await req.json()
  const { tipo } = body

  const tiposPermitidos = ["gestor", "operacao", "social", "admin", "designer", "analista_crm", "gestor_trafego", "auxiliar_admin", "gestor_eventos"]
  if (!tiposPermitidos.includes(tipo)) {
    return NextResponse.json({ error: `Tipo inválido. Use: ${tiposPermitidos.join(", ")}` }, { status: 400 })
  }

  // Só promove pessoa que pertence à organização ativa (membership)
  const membership = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId: id, organizacaoId } },
    select: { id: true, usuario: { select: { tipo: true } } },
  })
  if (!membership) return NextResponse.json({ error: "Pessoa não encontrada nesta organização" }, { status: 404 })

  const dim = dimensoesParaTipo(tipo)

  const [, atualizado] = await prisma.$transaction([
    // Membership da org ativa: papel + dimensões conforme o tipo escolhido
    prisma.usuarioOrganizacao.update({
      where: { id: membership.id },
      data: { papel: tipo as TipoUsuario, categoria: dim.categoria, funcaoProfissional: dim.funcaoProfissional, areas: dim.areas },
    }),
    // Usuario.tipo por compatibilidade legada
    prisma.usuario.update({ where: { id }, data: { tipo: tipo as TipoUsuario } }),
  ])

  return NextResponse.json({ ok: true, usuario: { id: atualizado.id, nome: atualizado.nome, tipo: atualizado.tipo } })
}
