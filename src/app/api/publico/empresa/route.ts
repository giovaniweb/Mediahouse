import { NextRequest, NextResponse } from "next/server"
import { empresaDestino } from "@/lib/portal"

// GET /api/publico/empresa?org=<slug> — quem recebe este formulário público.
//
// Os formulários mostram no topo para qual empresa o pedido vai. Antes não
// mostravam nada, e um link sem slug mandava tudo para a empresa padrão sem que
// ninguém percebesse. Sem `org`, responde a padrão (é para onde o link antigo
// envia de fato); slug desconhecido ou empresa desligada, 404.
//
// Só nome, slug e logo: o que já aparece para qualquer visitante da área.
export async function GET(req: NextRequest) {
  const empresa = await empresaDestino(req.nextUrl.searchParams.get("org"))
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 })
  return NextResponse.json({ empresa }, { headers: { "Cache-Control": "public, max-age=300" } })
}
