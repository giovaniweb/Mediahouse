import { prisma } from "@/lib/prisma"
import { decidirPagamento } from "@/lib/pagamentos"
import { sendEmailFinanceiro } from "@/lib/email"
import { comOrg } from "@/lib/org-contexto"

/** Fronteira exige gestão + verCustos. A decisão já está persistida antes da rede. */
export async function executarDecisaoPagamento(ator:{organizacaoId:string;usuarioId:string},custoId:string,acao:"aprovar_pagamento"|"contestar") {
  const r=await decidirPagamento(prisma,ator,custoId,acao)
  if(!r.alterado) return {ok:true,emailEnviado:Boolean(r.custo.emailFinanceiroAt),mensagem:r.custo.statusPagamento==="aguardando_pagamento" && !r.custo.emailFinanceiroAt ? "Pagamento já aprovado. Aviso ao financeiro não confirmado; confira antes de reenviar." : "Decisão já registrada. Nenhum aviso duplicado."}
  if(!r.fiscais) return {ok:true,mensagem:"Custo contestado. O pagamento permanece pendente."}
  let emailEnviado=false
  try {
    const result=await sendEmailFinanceiro({nomeVideomaker:r.custo.videomaker.nome,cpfCnpj:r.fiscais.cpfCnpj ?? undefined,
      valorDiaria:r.custo.valor,chavePix:r.fiscais.chavePix,notaFiscalUrl:r.custo.notaFiscalUrl ?? undefined,
      codigoDemanda:r.custo.demanda?.codigo ?? "S/D",tituloDemanda:r.custo.demanda?.titulo ?? "Sem demanda",custoId:r.custo.id},ator.organizacaoId)
    emailEnviado=result.ok
  } catch { /* Falha de aviso não desfaz nem repete a decisão financeira. */ }
  await comOrg(ator.organizacaoId,async()=>{
    if(emailEnviado) await prisma.custoVideomaker.updateMany({where:{id:custoId,organizacaoId:ator.organizacaoId,statusPagamento:"aguardando_pagamento",updatedAt:r.custo.updatedAt},data:{emailFinanceiroAt:new Date()}})
    else await prisma.alertaIA.create({data:{organizacaoId:ator.organizacaoId,demandaId:r.custo.demandaId,tipoAlerta:"financeiro_email_pendente",mensagem:"Pagamento aprovado, mas o aviso ao financeiro não foi confirmado. Confira o custo antes de reenviar.",severidade:"aviso",acaoSugerida:"Custos → Pagamentos externos"}})
  })
  return {ok:true,emailEnviado,mensagem:emailEnviado ? "Pagamento aprovado. Aviso enviado ao financeiro." : "Pagamento aprovado. Aviso ao financeiro pendente de conferência."}
}
