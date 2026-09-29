import { NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { saudeWhatsapp } from "@/lib/automacoes-saude"
// Leitura local: status reportado por evento autenticado, sem consulta paga/rede no polling.
export async function GET() {
  const a=await requireAcesso()
  if(a instanceof NextResponse) return a
  try {
    const s=await saudeWhatsapp(a.organizacaoId)
    return NextResponse.json({connected:s.conexao==="conectada",state:s.conexao,connectionEventoEm:s.conexaoEm,
      naoEnviadas:s.atencao,ultimaEntrada:s.ultimaEntrada,diasSemResposta:s.ultimaEntrada?Math.floor((Date.now()-s.ultimaEntrada.getTime())/86400_000):null},
      {headers:{"Cache-Control":"private, no-store"}})
  } catch {return NextResponse.json({error:"Não foi possível consultar o status."},{status:503})}
}
