import { processarSaidas } from "@/lib/whatsapp-outbox"
import { NextRequest, NextResponse, after } from "next/server"
import { receberEntrada, EntradaRecusada, processarInbox } from "@/lib/whatsapp-inbox"

export const maxDuration = 60
const LIMITE = 2*1024*1024

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    // Limite real no stream, não confiar só em Content-Length.
    const reader=req.body?.getReader()
    if(!reader) return NextResponse.json({error:"payload_invalido"},{status:400})
    const chunks: Uint8Array[]=[]; let tamanho=0
    for(;;) {
      const {done,value}=await reader.read()
      if(done) break
      tamanho+=value.length
      if(tamanho>LIMITE) { await reader.cancel(); return NextResponse.json({error:"payload_excedido"},{status:413}) }
      chunks.push(value)
    }
    body=JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch { return NextResponse.json({error:"payload_invalido"},{status:400}) }
  try {
    const resultado=await receberEntrada(body,req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("s"))
    // Otimização de latência, nunca a garantia de execução. Cron retoma a mesma fila.
    if(resultado.organizacaoId) {
      try { after(async()=>{ await processarInbox(resultado.organizacaoId!).catch(()=>undefined); await processarSaidas(resultado.organizacaoId!).catch(()=>undefined) }) } catch { /* cron retoma a intenção já persistida */ }
    }
    return NextResponse.json({ok:true,resultado:resultado.resultado})
  } catch(e) {
    if(e instanceof EntradaRecusada) return NextResponse.json({error:e.motivo},{status:e.status})
    return NextResponse.json({error:"entrada_nao_persistida"},{status:503})
  }
}

export async function GET() {
  return NextResponse.json({ok:true,webhook:"recebimento_persistente",secretaria:"aguardando_saida_controlada"})
}
