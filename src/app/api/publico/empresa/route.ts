import { NextRequest, NextResponse } from "next/server"
import { empresaDoPortal, empresaPorId } from "@/lib/portal"
import { orgPublicaOuDaSessao } from "@/lib/org-da-requisicao"

// GET /api/publico/empresa?org=<slug> — quem recebe este formulário público.
//
// Os formulários mostram no topo para qual empresa o pedido vai. Sem `org`, não
// há empresa padrão: responde a de quem está logado (a galeria aberta do painel)
// ou 404, e o formulário avisa que o link está incompleto. Slug desconhecido ou
// empresa desligada, 404.
//
// Só nome, slug e logo: o que já aparece para qualquer visitante da área.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("org")
  if (slug?.trim()) {
    const empresa = await empresaDoPortal(slug)
    if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 })
    return NextResponse.json({ empresa }, { headers: { "Cache-Control": "public, max-age=300" } })
  }
  const { organizacaoId } = await orgPublicaOuDaSessao(null)
  const empresa = organizacaoId ? await empresaPorId(organizacaoId) : null
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 })
  // Depende do cookie de quem pediu: nada de cache compartilhado.
  return NextResponse.json({ empresa }, { headers: { "Cache-Control": "private, no-store" } })
}
