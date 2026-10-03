import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireSuperAdmin } from "@/lib/org"
import { prismaAdmin } from "@/lib/prisma-admin"

// GET /api/admin/leads — os 100 contatos mais recentes da landing.
// Só o superadmin: a leitura usa a conexão administrativa, porque o role da
// aplicação só insere em leads_comerciais. O hash do IP não sai daqui.
export async function GET() {
  const guard = await requireSuperAdmin(await auth())
  if (guard instanceof NextResponse) return guard
  const leads = await prismaAdmin.leadComercial.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, nome: true, email: true, telefone: true, empresa: true, mensagem: true, origem: true, campanha: true, createdAt: true },
  })
  return NextResponse.json({ leads })
}
