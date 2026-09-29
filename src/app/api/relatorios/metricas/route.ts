import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { recorteMetricas, RecorteInvalido } from "@/lib/metricas-recorte"
import { metricasRelatorio } from "@/lib/metricas-relatorio"
import { comOrg } from "@/lib/org-contexto"
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso("verRelatorios")
  if (acesso instanceof NextResponse) return acesso
  try {
    const recorte = recorteMetricas(req.nextUrl.searchParams)
    const dados = await comOrg(acesso.organizacaoId, () => metricasRelatorio(acesso.organizacaoId, recorte, acesso.permissoes.verCustos))
    return NextResponse.json(dados, { headers: { "Cache-Control": "private, no-store" } })
  } catch (e) {
    if (e instanceof RecorteInvalido) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
