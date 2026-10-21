import { notFound } from "next/navigation"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireSuperAdmin } from "@/lib/org"
import { ListaContestacoes } from "@/components/admin/ListaContestacoes"

// Mesma porta de /admin/leads: para quem não é super-admin, a página não existe.
export default async function ContestacoesPage() {
  const guard = await requireSuperAdmin(await auth())
  if (guard instanceof NextResponse) notFound()
  return <ListaContestacoes />
}
