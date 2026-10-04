import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireAcesso } from "@/lib/acesso"
import { PagamentoInvalido } from "@/lib/pagamentos"
import { executarDecisaoPagamento } from "@/lib/pagamento-decisao-http"
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const acesso=await requireAcesso("verCustos")
  if(acesso instanceof NextResponse)return acesso
  if(!["admin","gestor"].includes(acesso.papel))return NextResponse.json({error:"Sem permissão para alterar custos"},{status:403})
  try {
    const {acao}=z.object({acao:z.enum(["aprovar_pagamento","contestar"])}).strict().parse(await req.json())
    return NextResponse.json(await executarDecisaoPagamento(acesso,(await params).id,acao),{headers:{"Cache-Control":"private, no-store"}})
  }catch(e){
    if(e instanceof PagamentoInvalido)return NextResponse.json({error:e.message},{status:e.status})
    if(e instanceof ZodError || e instanceof SyntaxError)return NextResponse.json({error:"Ação inválida"},{status:400})
    throw e
  }
}
