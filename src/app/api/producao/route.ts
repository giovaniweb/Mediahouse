import { recorteMetricas, RecorteInvalido } from "@/lib/metricas-recorte"
import { carregarConcluidas } from "@/lib/metricas-operacionais"
import { contarEntregaveis } from "@/lib/metricas-entregaveis"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"

// Compatibilidade operacional. Não converte volume em receita ou retorno salarial.
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso("verCustos")
  if (acesso instanceof NextResponse) return acesso
  try {
    const recorte=recorteMetricas(new URLSearchParams({periodo:"12meses",...Object.fromEntries(req.nextUrl.searchParams)}))
    const demandas=await carregarConcluidas(acesso.organizacaoId,recorte)
    return NextResponse.json({totalDemandas:demandas.length,totalVideos:demandas.reduce((n,d)=>n+contarEntregaveis(d),0),periodo:recorte,
      aviso:"Indicadores operacionais. Custos por competência disponíveis em /api/custos-setor."},{headers:{"Cache-Control":"private, no-store"}})
  }catch(e){if(e instanceof RecorteInvalido)return NextResponse.json({error:e.message},{status:400});throw e}
}
