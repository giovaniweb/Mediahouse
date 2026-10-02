import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { PagamentoInvalido, custoUnicoDoJob } from "@/lib/pagamentos"
import { executarDecisaoPagamento } from "@/lib/pagamento-decisao-http"
const resposta=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}})
type Params={params:Promise<{id:string}>}
function erro(e:unknown) {
  if(e instanceof PagamentoInvalido)return resposta({error:e.message},e.status)
  if(e instanceof ZodError || e instanceof SyntaxError)return resposta({error:"Ação inválida"},400)
  throw e
}
export async function GET(_req:NextRequest,{params}:Params) {
  const acesso=await requireAcesso("verCustos");if(acesso instanceof NextResponse)return acesso
  try {
    return await comOrg(acesso.organizacaoId,async()=>{
      const demanda=await prisma.demanda.findFirst({where:{id:(await params).id,organizacaoId:acesso.organizacaoId},select:{id:true,codigo:true,titulo:true,statusInterno:true,videomakerId:true}})
      if(!demanda)return resposta({error:"Demanda não encontrada"},404)
      const custo=demanda.videomakerId ? await custoUnicoDoJob(prisma,acesso.organizacaoId,demanda.id,demanda.videomakerId) : null
      return resposta({custo,demanda})
    })
  }catch(e){return erro(e)}
}
export async function POST(req:NextRequest,{params}:Params) {
  const acesso=await requireAcesso();if(acesso instanceof NextResponse)return acesso
  try {
    const body=await req.json()
    // O cliente antigo enviava uma URL arbitrária e alterava PIX/custo. Uma única
    // entrada privada agora valida arquivo, profissional, empresa e lançamento.
    if(body?.acao==="enviar_nf")return resposta({error:"Envie a nota fiscal pelo formulário do seu job.",codigo:"usar_upload_privado",destino:"/jobs"},410)
    if(!acesso.permissoes.verCustos || !["admin","gestor"].includes(acesso.papel))return resposta({error:"Sem permissão para alterar custos"},403)
    const {acao}=z.object({acao:z.enum(["aprovar_pagamento","contestar"])}).strict().parse(body)
    const custo=await comOrg(acesso.organizacaoId,async()=>{
      const d=await prisma.demanda.findFirst({where:{id:(await params).id,organizacaoId:acesso.organizacaoId},select:{id:true,videomakerId:true}})
      if(!d?.videomakerId)throw new PagamentoInvalido("Demanda não encontrada",404)
      const c=await custoUnicoDoJob(prisma,acesso.organizacaoId,d.id,d.videomakerId)
      if(!c)throw new PagamentoInvalido("Custo não encontrado",404)
      return c
    })
    return resposta(await executarDecisaoPagamento(acesso,custo.id,acao))
  }catch(e){return erro(e)}
}
