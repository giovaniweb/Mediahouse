import { NextRequest, NextResponse } from "next/server"
import { ZodError, z } from "zod"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { cancelarCustoSetor, CustoInvalido, registrarCustoSetor, resumoCustosSetor } from "@/lib/custos-setor"
const resposta=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}})
function erro(e:unknown) {
  if(e instanceof ZodError || e instanceof SyntaxError) return resposta({error:"Confira competência, valor (use ponto para centavos), fonte e identificação da origem."},400)
  if(e instanceof CustoInvalido) return resposta({error:e.message},e.status)
  throw e
}
export async function GET(req:NextRequest) {
  const acesso=await requireAcesso("verCustos");if(acesso instanceof NextResponse)return acesso
  try {return resposta({...await resumoCustosSetor(prisma,acesso.organizacaoId,req.nextUrl.searchParams.get("competencia")??""),podeEditar:["admin","gestor"].includes(acesso.papel)})} catch(e){return erro(e)}
}
export async function POST(req:NextRequest) {
  const acesso=await requireAcesso("verCustos");if(acesso instanceof NextResponse)return acesso
  if(!["admin","gestor"].includes(acesso.papel))return resposta({error:"Sem permissão para alterar custos"},403)
  try {return resposta(await registrarCustoSetor(prisma,acesso,await req.json()),201)} catch(e){return erro(e)}
}
export async function PATCH(req:NextRequest) {
  const acesso=await requireAcesso("verCustos");if(acesso instanceof NextResponse)return acesso
  if(!["admin","gestor"].includes(acesso.papel))return resposta({error:"Sem permissão para alterar custos"},403)
  try {
    const {id}=z.object({id:z.string().min(1).max(128)}).strict().parse(await req.json())
    return resposta(await cancelarCustoSetor(prisma,acesso,id))
  }catch(e){return erro(e)}
}
