import { NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { executarRotina, type Rotina } from "@/lib/automacoes-regras"
/** Rotinas operacionais por regras: capacidade do destino e gestão da empresa. */
export async function executarRotinaManual(rotina:Rotina) {
  const acesso=await requireAcesso(rotina === "vistoria" ? "verRelatorios" : "verAlertas")
  if(acesso instanceof NextResponse) return acesso
  const gestao=await requireAcesso("gerenciarConfig")
  if(gestao instanceof NextResponse) return gestao
  try {
    const resultado=await executarRotina(acesso.organizacaoId,rotina,acesso.usuarioId)
    const resumo=`Verificação por regras: ${resultado.analisados} registros, ${resultado.alertasCriados} alertas novos e ${resultado.intencoesCriadas} mensagens agendadas. ${resultado.relatoriosCriados} relatórios criados. Entrega depende do provedor.`
    return NextResponse.json({sucesso:true,...resultado,alertasGerados:resultado.alertasCriados,resumo,analise:resumo})
  } catch {return NextResponse.json({error:"Não foi possível concluir a verificação. A execução pode ser retomada."},{status:500})}
}
