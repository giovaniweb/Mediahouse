import { NextRequest, NextResponse, after } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { tentarNovamente, processarSaidas } from "@/lib/whatsapp-outbox"
export const dynamic="force-dynamic"

export async function GET(req:NextRequest) {
  const acesso=await requireAcesso("gerenciarConfig")
  if(acesso instanceof NextResponse) return acesso
  const {organizacaoId}=acesso
  const cursor=req.nextUrl.searchParams.get("cursor")?.slice(0,128)
  return comOrg(organizacaoId,()=>prisma.$transaction(async tx=>{
    const rows=await tx.saidaWhatsapp.findMany({where:{organizacaoId,...(cursor ? {id:{gt:cursor}} : {})},orderBy:{id:"asc"},take:51,
      select:{id:true,estado:true,motivo:true,tentativas:true,createdAt:true,expiraEm:true,proximaTentativa:true,
        registros:{orderBy:{numero:"desc"},take:1,select:{createdAt:true,finishedAt:true,httpStatus:true,resultado:true}}}})
    const total=await tx.saidaWhatsapp.count({where:{organizacaoId}})
    const tentativas=await tx.tentativaWhatsapp.count({where:{organizacaoId}})
    const legado=await tx.mensagemWhatsapp.count({where:{organizacaoId,direcao:"saida"}})
    const mensagens=rows.slice(0,50).map(s=>({...s,podeTentar:s.estado==="falhou" && s.tentativas<5 && s.expiraEm.getTime()>Date.now()+20_000}))
    return NextResponse.json({mensagens,total,tentativas,legado,nextCursor:rows.length>50 ? mensagens.at(-1)!.id : null},{headers:{"Cache-Control":"private, no-store"}})
  }))
}
export async function POST(req:NextRequest) {
  const acesso=await requireAcesso("gerenciarConfig")
  if(acesso instanceof NextResponse) return acesso
  const b=await req.json().catch(()=>null)
  if(!b || typeof b.id!=="string" || b.id.length>128 || typeof b.motivo!=="string") return NextResponse.json({error:"Informe uma saída e um motivo."},{status:400})
  try {
    const s=await tentarNovamente(acesso.organizacaoId,b.id,acesso.usuarioId,b.motivo)
    try {after(async()=>{await processarSaidas(acesso.organizacaoId).catch(()=>undefined)})} catch { /* persistido */ }
    return NextResponse.json({id:s.id,status:s.estado},{status:202})
  } catch {return NextResponse.json({error:"Nova tentativa não permitida. Confira estado, validade, conexão e destinatário."},{status:409})}
}
