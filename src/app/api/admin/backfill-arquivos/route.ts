import { NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { backfillAuditado } from "@/lib/backfill-auditado"
export async function POST() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  if (acesso.papel !== "admin" || !acesso.permissoes.editarDemanda) return NextResponse.json({ error: "Sem permissão para manutenção" }, { status: 403 })
  return NextResponse.json(await backfillAuditado("arquivos", acesso), { headers: { "Cache-Control": "no-store" } })
}
