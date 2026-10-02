import { acompanharConsumidor } from "@/lib/automacoes-saude"
import { processarSaidas } from "@/lib/whatsapp-outbox"
import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { processarInbox, limparConteudoInbox } from "@/lib/whatsapp-inbox"

export const maxDuration = 60
// Consumidor técnico sem IA; envio pela outbox. Agendador deve seguir nextCursor até null.
export async function GET(req: NextRequest) {
  const segredo=process.env.CRON_SECRET
  if(!segredo) return NextResponse.json({error:"cron_nao_configurado"},{status:500})
  const a=Buffer.from(req.headers.get("authorization") ?? ""),b=Buffer.from(`Bearer ${segredo}`)
  if(a.length!==b.length || !timingSafeEqual(a,b)) return NextResponse.json({error:"nao_autorizado"},{status:401})
  const cursor=req.nextUrl.searchParams.get("cursor")?.slice(0,128)
  const orgs=await prisma.organizacao.findMany({where:cursor ? {id:{gt:cursor}} : {},select:{id:true,ativo:true},orderBy:{id:"asc"},take:21})
  const pagina=orgs.slice(0,20), resultados=[]
  const inicio=Date.now()
  let ultima:string|null=null
  for(const org of pagina) {
    if(Date.now()-inicio>20_000) break
    ultima=org.id
    try {
      // Retenção vale inclusive para empresas pausadas; efeito de negócio não.
      const dados=await acompanharConsumidor(org.id,"whatsapp-inbox",async()=>{
      const removidos=await limparConteudoInbox(org.id)
      const fila=org.ativo ? await processarInbox(org.id) : null
      const saidas=await processarSaidas(org.id)
      return {dados:{organizacaoId:org.id,fila,saidas,conteudosRemovidos:removidos},contadores:{concluidos:(fila?.concluidos??0)+saidas.aceitos,falhos:(fila?.falhos??0)+saidas.falhos+saidas.desconhecidos,pendentes:0}}
      })
      resultados.push(dados)
    } catch {resultados.push({organizacaoId:org.id,erro:"falha_local"})}
  }
  const parcial=resultados.some(r=>"erro" in r || ("saidas" in r && (r.saidas.falhos+r.saidas.desconhecidos+(r.fila?.falhos??0))>0))
  return NextResponse.json({ok:!parcial,parcial,resultados,nextCursor:ultima && (resultados.length<orgs.length) ? ultima : null})
}
