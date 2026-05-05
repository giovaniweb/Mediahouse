import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

// POST /api/usuarios/[principalId]/mesclar
// Body: { secundarioId: string }
// Merge two user accounts: moves all demands, copies missing data, deactivates secondary
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão para mesclar usuários" }, { status: 403 })
  }

  const { id: principalId } = await params
  const body = await req.json()
  const { secundarioId } = body

  if (!secundarioId) {
    return NextResponse.json({ error: "secundarioId é obrigatório" }, { status: 400 })
  }

  if (principalId === secundarioId) {
    return NextResponse.json({ error: "Principal e secundário não podem ser o mesmo" }, { status: 400 })
  }

  // Busca ambos os usuários
  const [principal, secundario] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: principalId } }),
    prisma.usuario.findUnique({ where: { id: secundarioId } }),
  ])

  if (!principal) return NextResponse.json({ error: "Usuário principal não encontrado" }, { status: 404 })
  if (!secundario) return NextResponse.json({ error: "Usuário secundário não encontrado" }, { status: 404 })

  // Conta demandas do secundário (para feedback)
  const qtdDemandas = await prisma.demanda.count({ where: { solicitanteId: secundarioId } })

  // Executa mesclagem em transação atômica
  const [principalAtualizado] = await prisma.$transaction([
    // 1. Atualiza principal com dados faltantes do secundário
    prisma.usuario.update({
      where: { id: principalId },
      data: {
        email: principal.email ?? secundario.email,
        telefone: principal.telefone ?? secundario.telefone,
      },
      select: { id: true, nome: true, email: true, telefone: true, tipo: true, status: true },
    }),

    // 2. Move todas as demandas do secundário para o principal
    prisma.demanda.updateMany({
      where: { solicitanteId: secundarioId },
      data: { solicitanteId: principalId },
    }),

    // 3. Desativa secundário (soft delete — mantém histórico)
    prisma.usuario.update({
      where: { id: secundarioId },
      data: { status: "inativo" },
    }),
  ])

  return NextResponse.json({
    ok: true,
    principal: principalAtualizado,
    demandasMigradas: qtdDemandas,
    mensagem: `Cadastros mesclados! ${qtdDemandas} demanda(s) migrada(s) para ${principal.nome}.`,
  })
}
