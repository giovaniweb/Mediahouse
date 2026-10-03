import { requireAcesso } from "@/lib/acesso"
import { NextResponse } from "next/server"

/** Recurso retirado: clientes antigos não podem iniciar consumo nem alterar registros. */
export async function POST() {
  const acesso = await requireAcesso("verIA")
  if (acesso instanceof NextResponse) return acesso
  return NextResponse.json({ error: "A análise automática de aprovação foi retirada. Confira a demanda e os alertas antes de decidir.", codigo: "RECURSO_RETIRADO" }, { status: 410, headers: { "Cache-Control": "private, no-store" } })
}
