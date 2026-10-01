import { NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"

/** Compatibilidade para clientes antigos: a função foi retirada, inclusive no servidor. */
export async function POST() {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  return NextResponse.json({ error: "A importação de demandas por planilha foi desativada. Use Nova demanda.", codigo: "importacao_desativada" }, { status: 410, headers: { "Cache-Control": "no-store" } })
}
