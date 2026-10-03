import { notFound } from "next/navigation"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireSuperAdmin } from "@/lib/org"
import { ListaInteressados } from "@/components/admin/ListaInteressados"

// Mesma porta de /admin/organizacoes: a checagem acontece no servidor, antes de
// sair HTML. Antes a página era só cliente — a API negava, mas a casca da tela
// abria para qualquer pessoa logada. Para quem não é super-admin, não existe.
export default async function InteressadosPage() {
  const guard = await requireSuperAdmin(await auth())
  if (guard instanceof NextResponse) notFound()
  return <ListaInteressados />
}
