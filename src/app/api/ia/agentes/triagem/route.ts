import { requireAcesso } from "@/lib/acesso"
import { NextResponse } from "next/server"

/** Compatibilidade com clientes antigos: não executar ferramentas nem chamar IA. */
export async function POST() {
  const acesso = await requireAcesso("verIA")
  if (acesso instanceof NextResponse) return acesso
  return NextResponse.json({ error: "A triagem autônoma foi retirada. A gestão da demanda continua no fluxo de aprovação.", codigo: "RECURSO_RETIRADO" }, { status: 410, headers: { "Cache-Control": "private, no-store" } })
}
