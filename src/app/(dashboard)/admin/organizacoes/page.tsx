import { notFound } from "next/navigation"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireSuperAdmin } from "@/lib/org"
import { PainelOrganizacoes } from "@/components/admin/PainelOrganizacoes"

// Painel da plataforma — acima das empresas.
//
// Server component de propósito: a checagem acontece ANTES de qualquer HTML
// sair. Se fosse client-side, a casca da página renderizaria para todo mundo e
// só a chamada de API seria negada — dado nenhum vaza, mas a existência da tela
// vaza, e uma tela chamada "organizações da plataforma" já é informação.
//
// `notFound()` e não "sem permissão": para quem não é super-admin, esta rota
// simplesmente não existe.
export default async function AdminOrganizacoesPage() {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) notFound()

  return <PainelOrganizacoes />
}
