import { NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { videomakerPedeNota } from "@/lib/videomaker-pede-nota"
export async function POST(req:Request) {
  const acesso=await requireAcesso();if(acesso instanceof NextResponse)return acesso
  try {
    const {demandaId}=z.object({demandaId:z.string().min(1).max(128)}).strict().parse(await req.json())
    return await comOrg(acesso.organizacaoId,()=>prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM demandas WHERE id=${demandaId} AND "organizacaoId"=${acesso.organizacaoId} FOR UPDATE`
      const d=await tx.demanda.findFirst({where:{id:demandaId,organizacaoId:acesso.organizacaoId,videomaker:{usuarioId:acesso.usuarioId,vinculos:{some:{organizacaoId:acesso.organizacaoId,status:{in:["ativo","preferencial"]},emListaNegra:false}}}},select:{id:true,videomakerId:true}})
      if(!d?.videomakerId)return NextResponse.json({error:"Gravação não encontrada ou não pertence a você"},{status:404})
      // Interno não manda nota (12/11/2026).
      if(!await videomakerPedeNota(tx,acesso.organizacaoId,d.videomakerId))return NextResponse.json({error:"Videomaker interno não envia nota fiscal."},{status:403})
      const existente=await tx.notaFiscalUpload.findFirst({where:{demandaId,videomakerId:d.videomakerId},orderBy:[{createdAt:"desc"},{id:"asc"}]})
      const contestado=existente?.status!=="pendente" && await tx.custoVideomaker.findFirst({where:{organizacaoId:acesso.organizacaoId,demandaId,videomakerId:d.videomakerId,statusPagamento:"contestado",pago:false},select:{id:true}})
      // Nova submissão preserva o arquivo e o token da revisão anterior.
      const nf=(!contestado && existente) || await tx.notaFiscalUpload.create({data:{demandaId,videomakerId:d.videomakerId}})
      return NextResponse.json({token:nf.token,status:nf.status},{headers:{"Cache-Control":"private, no-store"}})
    }))
  }catch(e){if(e instanceof ZodError || e instanceof SyntaxError)return NextResponse.json({error:"Gravação inválida"},{status:400});throw e}
}
