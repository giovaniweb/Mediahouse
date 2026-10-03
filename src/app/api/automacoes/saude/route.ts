import { NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { saudeWhatsapp,saudeConsumidores } from "@/lib/automacoes-saude"
export async function GET() {
  const a=await requireAcesso("gerenciarConfig")
  if(a instanceof NextResponse) return a
  try {
    const [whatsapp,consumidores]=await Promise.all([saudeWhatsapp(a.organizacaoId),saudeConsumidores(a.organizacaoId)])
    return NextResponse.json({whatsapp,consumidores},{headers:{"Cache-Control":"private, no-store"}})
  } catch {return NextResponse.json({error:"Não foi possível consultar a saúde das automações."},{status:503})}
}
