import { NextRequest, NextResponse } from "next/server"
import { computeRelatorioExecutivo, orgPorRelatorioToken } from "@/lib/relatorio-executivo"

// Relatório tem que refletir o banco agora. Sem isto o Next pode servir uma
// resposta cacheada — já foi observado devolver 1 vídeo onde havia 6.
export const dynamic = "force-dynamic"

// GET /api/publico/relatorio-executivo?token=...&mes=YYYY-MM&area=audiovisual
// Leitura externa do resumo executivo. O token identifica a EMPRESA — sem ele a
// rota não responde (antes agregava a produção de todas as empresas do banco).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const organizacaoId = await orgPorRelatorioToken(sp.get("token"))
  if (!organizacaoId) {
    return NextResponse.json({ error: "Link inválido ou revogado" }, { status: 404 })
  }
  const data = await computeRelatorioExecutivo(organizacaoId, sp.get("mes"), sp.get("area"))
  return NextResponse.json(data)
}
