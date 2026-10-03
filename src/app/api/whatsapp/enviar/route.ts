import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { criarSaida, processarSaidas } from "@/lib/whatsapp-outbox"
import { after, NextResponse } from "next/server"
import { z } from "zod"

const schema=z.object({telefone:z.string().min(8).max(40),mensagem:z.string().min(1).max(4096),chave:z.string().uuid()})
export async function POST(req:Request) {
  const acesso=await requireAcesso("gerenciarConfig")
  if(acesso instanceof NextResponse) return acesso
  const parsed=schema.safeParse(await req.json().catch(()=>null))
  if(!parsed.success) return NextResponse.json({error:"Dados inválidos"},{status:400})
  try {
    const s=await comOrg(acesso.organizacaoId,()=>prisma.$transaction(tx=>criarSaida(tx,{
      organizacaoId:acesso.organizacaoId,chave:`manual:${parsed.data.chave}`,origem:"manual",referencia:acesso.usuarioId,
      telefone:parsed.data.telefone,texto:parsed.data.mensagem,expiraEm:new Date(Date.now()+86400_000),
    })))
    try {after(async()=>{await processarSaidas(acesso.organizacaoId).catch(()=>undefined)})} catch { /* fila persistida */ }
    return NextResponse.json({id:s.id,status:s.estado},{status:202})
  } catch {return NextResponse.json({error:"Não foi possível agendar. Confira o destinatário e tente novamente."},{status:400})}
}
