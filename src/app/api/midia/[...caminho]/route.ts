import { NextRequest, NextResponse } from "next/server"
import { urlAssinadaDeLeitura, caminhoMidiaValido } from "@/lib/midia"
import { podeLerMidia } from "@/lib/midia-acesso"
import { SEM_CACHE_MIDIA } from "@/lib/publicacao-midia"

export async function GET(req: NextRequest, { params }: { params: Promise<{ caminho: string[] }> }) {
  const { caminho: partes } = await params
  const caminho = partes.join("/")
  if (!caminhoMidiaValido(caminho) || !await podeLerMidia(caminho, req.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404, headers: SEM_CACHE_MIDIA })
  }
  const assinada = await urlAssinadaDeLeitura(caminho)
  if (!assinada) return NextResponse.json({ error: "Arquivo indisponível" }, { status: 502, headers: SEM_CACHE_MIDIA })
  return NextResponse.redirect(assinada, { status: 302, headers: SEM_CACHE_MIDIA })
}
