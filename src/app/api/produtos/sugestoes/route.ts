import { NextRequest, NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { sugerirConteudoProduto } from "@/lib/produtos-sugestoes"

/** Consulta determinística: abrir/atualizar esta tela nunca chama um provedor de IA. */
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso("verProdutos")
  if (acesso instanceof NextResponse) return acesso
  const produtoId = req.nextUrl.searchParams.get("produtoId")
  if (produtoId !== null && (!produtoId.trim() || produtoId.length > 200)) {
    return NextResponse.json({ error: "Produto inválido" }, { status: 400 })
  }
  try {
    const produtos = await comOrg(acesso.organizacaoId, () => prisma.produto.findMany({
      where: { ativo: true, organizacaoId: acesso.organizacaoId, ...(produtoId ? { id: produtoId } : {}) },
      select: { id: true, nome: true, categoria: true, ultimoConteudo: true, createdAt: true, peso: true, alertaDias: true, totalConteudos: true },
    }))
    if (produtoId && !produtos.length) {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })
    }
    const agora = new Date()
    const sugestoes = produtos.map(p => sugerirConteudoProduto(p, agora))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 10)
    return NextResponse.json({ sugestoes, origem: "regras-v1" }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar as sugestões. Tente novamente." }, { status: 503 })
  }
}
