import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
// Busca de pessoa do painel da plataforma: atravessa as empresas por definição
// — quem vira admin de uma empresa nova costuma vir de outra (o Gabriel,
// videomaker da Contourline, virou admin da GH Produção). /api/usuarios não
// serve: enxerga só a empresa ativa. Conexão de dono atrás de
// `requireSuperAdmin`, como o resto de /api/admin. Ver src/lib/prisma-admin.ts.
import { prismaAdmin as prisma } from "@/lib/prisma-admin"
import { requireSuperAdmin } from "@/lib/org"

// GET /api/admin/usuarios?busca=gab — até 8 pessoas ativas por nome ou e-mail,
// com as empresas e o papel em cada uma (para não vincular a pessoa errada).
export async function GET(req: NextRequest) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const busca = req.nextUrl.searchParams.get("busca")?.trim().slice(0, 80) ?? ""
  if (busca.length < 2) return NextResponse.json({ usuarios: [] })

  const achados = await prisma.usuario.findMany({
    where: {
      status: "ativo",
      OR: [
        { nome: { contains: busca, mode: "insensitive" } },
        { email: { contains: busca, mode: "insensitive" } },
      ],
    },
    select: {
      id: true, nome: true, email: true,
      organizacoes: {
        orderBy: { createdAt: "asc" },
        select: { papel: true, organizacao: { select: { nome: true } } },
      },
    },
    orderBy: { nome: "asc" },
    take: 8,
  })

  return NextResponse.json({
    usuarios: achados.map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      empresas: u.organizacoes.map((o) => ({ nome: o.organizacao.nome, papel: o.papel })),
    })),
  })
}
