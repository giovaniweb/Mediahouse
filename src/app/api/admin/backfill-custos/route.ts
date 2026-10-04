import { NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
export async function POST() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  if (acesso.papel !== "admin" || !acesso.permissoes.verCustos) return NextResponse.json({ error: "Sem permissão para manutenção" }, { status: 403 })
  return NextResponse.json({ error: "Geração automática desativada: diária atual não comprova custo histórico. Confira as pendências e registre os valores com fonte e competência.", destino: "/custos" }, { status: 409, headers: { "Cache-Control": "no-store" } })
}
