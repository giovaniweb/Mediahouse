import { NextRequest, NextResponse } from "next/server"
import { computeRelatorioExecutivo } from "@/lib/relatorio-executivo"

// GET /api/publico/relatorio-executivo?mes=YYYY-MM&area=audiovisual  (sem auth)
// Resumo executivo do mês: produção (lançada + NuFlow), total e frentes presenciais.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const data = await computeRelatorioExecutivo(sp.get("mes"), sp.get("area"))
  return NextResponse.json(data)
}
