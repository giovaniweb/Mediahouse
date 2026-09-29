import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { comOrg } from "@/lib/org-contexto"
import { prisma } from "@/lib/prisma"
import { executarRotina, ROTINAS, type Rotina } from "@/lib/automacoes-regras"
import { processarInbox, limparConteudoInbox } from "@/lib/whatsapp-inbox"
import { processarSaidas } from "@/lib/whatsapp-outbox"
import { recuperarExecucoesDuravel } from "@/lib/fila-manutencao"
export const maxDuration = 300

/** Rotinas determinísticas; agendador deve consumir nextCursor. Sem cliente de IA. */
export async function GET(req:NextRequest) {
  const segredo=process.env.CRON_SECRET
  if(!segredo) return NextResponse.json({error:"cron_nao_configurado"},{status:500})
  const a=Buffer.from(req.headers.get("authorization")??""),b=Buffer.from(`Bearer ${segredo}`)
  if(a.length!==b.length || !timingSafeEqual(a,b)) return NextResponse.json({error:"nao_autorizado"},{status:401})
  const agente=req.nextUrl.searchParams.get("agente")??"alertas"
  if(!ROTINAS.includes(agente as Rotina)) return NextResponse.json({error:"rotina_invalida"},{status:400})
  const cursor=req.nextUrl.searchParams.get("cursor")?.slice(0,128)
  const orgs=await prisma.organizacao.findMany({where:{ativo:true,ambienteTeste:false,...(cursor?{id:{gt:cursor}}:{})},select:{id:true},orderBy:{id:"asc"},take:11})
  const resultados=[],inicio=Date.now()
  for(const org of orgs.slice(0,10)) {
    if(Date.now()-inicio>240_000) break
    try {
      const fila=await recuperarExecucoesDuravel(org.id)
      const inbox=await processarInbox(org.id)
      await limparConteudoInbox(org.id)
      const regras=await comOrg(org.id,()=>executarRotina(org.id,agente as Rotina))
      const saidas=await processarSaidas(org.id)
      resultados.push({organizacaoId:org.id,fila,inbox,regras,saidas})
    } catch {resultados.push({organizacaoId:org.id,erro:"falha_local"})}
  }
  const parcial=resultados.some(r=>"erro" in r)
  return NextResponse.json({ok:!parcial,parcial,agente,organizacoes:resultados.length,resultados,
    nextCursor:resultados.length<orgs.length?resultados.at(-1)?.organizacaoId??cursor??null:null})
}
