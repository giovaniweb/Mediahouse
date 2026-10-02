import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "@prisma/client"
import { comOrg } from "@/lib/org-contexto"
import { registrarAuditoria, type AtorAuditoria } from "@/lib/auditoria"
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto"

type Tx = Prisma.TransactionClient
export class PagamentoInvalido extends Error {
  constructor(message: string, public status = 409) { super(message) }
}
export const valorConhecido = (c: {valor:number;valorConfirmadoEm:Date|null}) => Number.isFinite(c.valor) && c.valor>=0 && (c.valor>0 || c.valorConfirmadoEm!==null)
export function conferirPagamentoAberto(c: {pago:boolean;statusPagamento:string}) {
  if(c.pago || c.statusPagamento==="pago") throw new PagamentoInvalido("Pagamento registrado ou em conflito. Não é permitido reabrir ou substituir seus documentos.")
}
export async function custoUnicoDoJob(tx: Pick<Tx,"custoVideomaker">, organizacaoId:string, demandaId:string, videomakerId:string) {
  const custos=await tx.custoVideomaker.findMany({where:{organizacaoId,demandaId,videomakerId},take:2})
  if(custos.length>1) throw new PagamentoInvalido("Há vários lançamentos neste job. Selecione o custo na área financeira.")
  return custos[0] ?? null
}
export async function decidirPagamento(db: PrismaClient, ator: AtorAuditoria, custoId:string, acao:"aprovar_pagamento"|"contestar") {
  return comOrg(ator.organizacaoId,()=>db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM custos_videomaker WHERE id=${custoId} AND "organizacaoId"=${ator.organizacaoId} FOR UPDATE`
    const c=await tx.custoVideomaker.findFirst({where:{id:custoId,organizacaoId:ator.organizacaoId},include:{videomaker:{select:{nome:true}},demanda:{select:{id:true,codigo:true,titulo:true}}}})
    if(!c) throw new PagamentoInvalido("Custo não encontrado",404)
    conferirPagamentoAberto(c)
    const alvo=acao==="aprovar_pagamento" ? "aguardando_pagamento" : "contestado"
    if(c.statusPagamento===alvo) return {alterado:false,custo:c,fiscais:null}
    let fiscais:{chavePix:string;cpfCnpj:string|null}|null=null
    if(acao==="aprovar_pagamento") {
      if(c.statusPagamento!=="nf_enviada" || !c.notaFiscalUrl) throw new PagamentoInvalido("Aprovação exige nota fiscal recebida.")
      if(!valorConhecido(c)) throw new PagamentoInvalido("Confirme o valor do serviço antes de aprovar o pagamento.")
      const f=await tx.videomakerDadosFiscais.findUnique({where:{organizacaoId_videomakerId:{organizacaoId:ator.organizacaoId,videomakerId:c.videomakerId}}})
      let chavePix=""
      try {if(f?.chavePix) chavePix=decryptSecret(f.chavePix)} catch { /* segredo inválido não pode autorizar pagamento */ }
      if(!chavePix) throw new PagamentoInvalido("Cadastre uma chave PIX válida nesta empresa antes de aprovar.",422)
      fiscais={chavePix,cpfCnpj:f?.cpfCnpj ?? null}
    }
    const atualizado=await tx.custoVideomaker.update({where:{id:c.id,organizacaoId:ator.organizacaoId},data:{statusPagamento:alvo,emailFinanceiroAt:null}})
    await registrarAuditoria(tx,ator,{acao:"manutencao.custos",recurso:"custo",recursoId:c.id,correlationId:randomUUID(),depois:{operacao:"editar",alterados:1,decisao:acao==="aprovar_pagamento" ? "aprovado" : "reprovado"}})
    if(c.demandaId) await tx.alertaIA.updateMany({where:{organizacaoId:ator.organizacaoId,demandaId:c.demandaId,status:"ativo",tipoAlerta:{in:["pagamento_pendente","nf_recebida"]}},data:{status:"resolvido",resolvedAt:new Date()}})
    return {alterado:true,custo:{...c,...atualizado},fiscais}
  }))
}

/** Recebimento e documento usam um único commit. Upload remoto ocorre antes,
 * em caminho exclusivo, e nunca substitui o arquivo de uma tentativa anterior. */
export async function receberNotaFiscal(tx:Tx, e:{organizacaoId:string;notaId:string;url:string;nomeArquivo:string;ator:AtorAuditoria;chavePix?:string}) {
  if(e.ator.organizacaoId!==e.organizacaoId || !e.url.startsWith(`/api/midia/org/${e.organizacaoId}/nf/`)) throw new PagamentoInvalido("Documento fora da empresa",403)
  if(!await tx.organizacao.findFirst({where:{id:e.organizacaoId,ativo:true},select:{id:true}})) throw new PagamentoInvalido("Empresa indisponível",403)
  const nf=await tx.notaFiscalUpload.findFirst({where:{id:e.notaId,demanda:{organizacaoId:e.organizacaoId}}})
  if(!nf) throw new PagamentoInvalido("Nota fiscal não encontrada",404)
  await tx.$queryRaw`SELECT id FROM demandas WHERE id=${nf.demandaId} AND "organizacaoId"=${e.organizacaoId} FOR UPDATE`
  const d=await tx.demanda.findFirst({where:{id:nf.demandaId,organizacaoId:e.organizacaoId,videomakerId:nf.videomakerId}})
  const vinculo=await tx.videomakerOrganizacao.findFirst({where:{organizacaoId:e.organizacaoId,videomakerId:nf.videomakerId,status:{in:["ativo","preferencial"]},emListaNegra:false,videomaker:{OR:[{usuarioId:null},{usuario:{status:"ativo"}}]}}})
  if(!d || !vinculo) throw new PagamentoInvalido("Profissional não está autorizado para este job",403)
  if(!d.linkBrutos && !d.linkFolderBrutos && !["brutos_enviados","editor_atribuido","fila_edicao","editando","edicao_finalizada","revisao_pendente","ajuste_solicitado","aprovado","postagem_pendente","postado","entregue_cliente","contagem_15_dias_iniciada","lembrete_15_dias_enviado","expirado","encerrado"].includes(d.statusInterno)) throw new PagamentoInvalido("Registre a entrega do material antes de enviar a nota fiscal.")
  const atual=await tx.notaFiscalUpload.findUniqueOrThrow({where:{id:nf.id}})
  if(atual.status!=="pendente") throw new PagamentoInvalido("Nota fiscal já enviada. Solicite revisão à equipe.")
  let c=await custoUnicoDoJob(tx,e.organizacaoId,d.id,nf.videomakerId)
  if(c) {
    // Mesma ordem: job antes de custo. Aprovação só bloqueia o custo.
    await tx.$queryRaw`SELECT id FROM custos_videomaker WHERE id=${c.id} AND "organizacaoId"=${e.organizacaoId} FOR UPDATE`
    c=await tx.custoVideomaker.findUniqueOrThrow({where:{id:c.id,organizacaoId:e.organizacaoId}})
    conferirPagamentoAberto(c)
    if(!["pendente_nf","contestado"].includes(c.statusPagamento)) throw new PagamentoInvalido("A nota fiscal deste custo já está em análise ou aprovada.")
    c=await tx.custoVideomaker.update({where:{id:c.id,organizacaoId:e.organizacaoId},data:{notaFiscalUrl:e.url,statusPagamento:"nf_enviada",emailFinanceiroAt:null}})
  } else {
    c=await tx.custoVideomaker.create({data:{organizacaoId:e.organizacaoId,demandaId:d.id,videomakerId:nf.videomakerId,
      fatoOrigem:`nf:${nf.id}`,tipo:"projeto",valor:0,valorConfirmadoEm:null,notaFiscalUrl:e.url,statusPagamento:"nf_enviada",dataReferencia:d.finalizadaEm ?? new Date(),descricao:`Valor a confirmar — ${d.codigo}`}})
  }
  if(e.chavePix) {
    const chavePix=encryptSecret(e.chavePix)
    await tx.videomakerDadosFiscais.upsert({where:{organizacaoId_videomakerId:{organizacaoId:e.organizacaoId,videomakerId:nf.videomakerId}},create:{organizacaoId:e.organizacaoId,videomakerId:nf.videomakerId,chavePix},update:{chavePix}})
  }
  await tx.notaFiscalUpload.update({where:{id:nf.id},data:{url:e.url,nomeArquivo:e.nomeArquivo,status:"enviada"}})
  await registrarAuditoria(tx,e.ator,{acao:"manutencao.custos",recurso:"nota_fiscal",recursoId:nf.id,correlationId:randomUUID(),depois:{operacao:"editar",alterados:1,decisao:"enviado"}})
  await tx.alertaIA.create({data:{organizacaoId:e.organizacaoId,demandaId:d.id,tipoAlerta:"nf_recebida",mensagem:`Nota fiscal recebida para ${d.codigo}. Confira o valor e aprove o pagamento.`,severidade:"aviso",acaoSugerida:"Aprovações → Pagamentos"}})
  return c
}
