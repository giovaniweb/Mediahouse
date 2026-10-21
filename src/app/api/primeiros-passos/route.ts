import { NextRequest, NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { primeirosPassos, registrarPrimeiroPasso } from "@/lib/primeiros-passos"

// Primeiros passos do painel: só o admin da empresa vê e mexe.
async function admin() {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  if (acesso.papel !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  return acesso
}

// GET /api/primeiros-passos — o que falta fazer.
export async function GET() {
  const acesso = await admin()
  if (acesso instanceof NextResponse) return acesso
  return NextResponse.json(await primeirosPassos(acesso.organizacaoId))
}

// POST /api/primeiros-passos — { acao: "dispensar" | "link-copiado" }
export async function POST(req: NextRequest) {
  const acesso = await admin()
  if (acesso instanceof NextResponse) return acesso
  const { acao } = await req.json().catch(() => ({}))
  if (acao !== "dispensar" && acao !== "link-copiado") return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  await registrarPrimeiroPasso(acesso.organizacaoId, acao)
  return NextResponse.json(await primeirosPassos(acesso.organizacaoId))
}
