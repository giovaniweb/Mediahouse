import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

type Params = { params: Promise<{ id: string }> }

// POST /api/usuarios/[principalId]/mesclar
// Body: { secundarioId }
// Mescla duas contas NA ORGANIZAÇÃO ATIVA: move demandas da org, copia dados faltantes e
// desativa o secundário (global só se ele pertencer apenas a esta org; senão remove só a
// membership desta org — não afeta outras empresas).
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão para mesclar usuários" }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id: principalId } = await params
  const body = await req.json()
  const { secundarioId } = body

  if (!secundarioId) return NextResponse.json({ error: "secundarioId é obrigatório" }, { status: 400 })
  if (principalId === secundarioId) {
    return NextResponse.json({ error: "Principal e secundário não podem ser o mesmo" }, { status: 400 })
  }

  // Ambos precisam pertencer à organização ativa (membership)
  const [memPrincipal, memSecundario] = await Promise.all([
    prisma.usuarioOrganizacao.findUnique({ where: { usuarioId_organizacaoId: { usuarioId: principalId, organizacaoId } }, select: { id: true } }),
    prisma.usuarioOrganizacao.findUnique({ where: { usuarioId_organizacaoId: { usuarioId: secundarioId, organizacaoId } }, select: { id: true } }),
  ])
  if (!memPrincipal) return NextResponse.json({ error: "Usuário principal não encontrado nesta organização" }, { status: 404 })
  if (!memSecundario) return NextResponse.json({ error: "Usuário secundário não encontrado nesta organização" }, { status: 404 })

  const [principal, secundario] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: principalId } }),
    prisma.usuario.findUnique({ where: { id: secundarioId } }),
  ])
  if (!principal || !secundario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  // Demandas a migrar: SOMENTE da organização ativa
  const qtdDemandas = await prisma.demanda.count({ where: { organizacaoId, solicitanteId: secundarioId } })
  // Em quantas orgs o secundário está? Define se inativa global ou só remove o vínculo daqui.
  const orgsDoSecundario = await prisma.usuarioOrganizacao.count({ where: { usuarioId: secundarioId } })
  const soNestaOrg = orgsDoSecundario <= 1

  const ops = [
    // 1. Copia dados faltantes para o principal
    prisma.usuario.update({
      where: { id: principalId },
      data: { email: principal.email ?? secundario.email, telefone: principal.telefone ?? secundario.telefone },
      select: { id: true, nome: true, email: true, telefone: true, tipo: true, status: true },
    }),
    // 2. Move APENAS as demandas desta organização
    prisma.demanda.updateMany({
      where: { organizacaoId, solicitanteId: secundarioId },
      data: { solicitanteId: principalId },
    }),
    // 3. Desativa o secundário com segurança multiempresa
    soNestaOrg
      ? prisma.usuario.update({ where: { id: secundarioId }, data: { status: "inativo" } })
      : prisma.usuarioOrganizacao.delete({ where: { id: memSecundario.id } }),
  ] as const

  const [principalAtualizado] = await prisma.$transaction([...ops])

  return NextResponse.json({
    ok: true,
    principal: principalAtualizado,
    demandasMigradas: qtdDemandas,
    secundarioInativadoGlobal: soNestaOrg,
    mensagem: `Cadastros mesclados! ${qtdDemandas} demanda(s) desta organização migrada(s) para ${principal.nome}.`,
  })
}
