import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const status = req.nextUrl.searchParams.get("status")
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 50)))
  const where = {
    organizacaoId,
    ...(status === "revisao"
      ? { status: { in: ["revisao", "pronto"] } }
      : status && status !== "todos"
        ? { status }
        : {}),
  }

  const [emails, total, revisao, criados, erros] = await Promise.all([
    prisma.emailEntrada.findMany({
      where,
      take: limit,
      orderBy: { recebidoEm: "desc" },
      include: { demanda: { select: { id: true, codigo: true, titulo: true } } },
    }),
    prisma.emailEntrada.count({ where: { organizacaoId } }),
    prisma.emailEntrada.count({ where: { organizacaoId, status: { in: ["revisao", "pronto"] } } }),
    prisma.emailEntrada.count({ where: { organizacaoId, status: "criado" } }),
    prisma.emailEntrada.count({ where: { organizacaoId, status: "erro" } }),
  ])

  return NextResponse.json({ emails, counts: { total, revisao, criados, erros } })
}
