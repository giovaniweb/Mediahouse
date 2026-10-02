import { requireAcesso } from "@/lib/acesso"
import { NextResponse } from "next/server"

/** Recurso retirado: clientes antigos não podem iniciar consumo nem alterar registros. */
export async function POST() {
  const acesso = await requireAcesso("verIdeias")
  if (acesso instanceof NextResponse) return acesso
  return NextResponse.json({ error: "A pontuação automática de ideias foi retirada. Os registros anteriores permanecem disponíveis.", codigo: "RECURSO_RETIRADO" }, { status: 410, headers: { "Cache-Control": "private, no-store" } })
}
