import { NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
/** A recuperação exige simulação persistida e aplicação explícita de um lote. */
export async function POST() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  return NextResponse.json({ error: "Abra Biblioteca > Revisar acervo para simular e revisar um lote antes de aplicar.", destino: "/biblioteca/acervo" },{ status: 409 })
}
