import type { Prisma } from "@prisma/client"
import { resolverAlertas } from "@/lib/alertas"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { criarSaida, destinoAutorizado } from "@/lib/whatsapp-outbox"
import { telefoneCompleto } from "@/lib/whatsapp-identidade"
import { contextoRegraValido, cobrancaValida, hashRegra, regrasDemanda, revisaoEvento, type ContextoRegra, type RegraDemanda } from "@/lib/regras-operacionais"
import { dataEmSaoPaulo, somarDias } from "@/lib/datas"
import { recorteMetricas } from "@/lib/metricas-recorte"
import { metricasRelatorio, snapshotDoRelatorio } from "@/lib/metricas-relatorio"
import { criarRelatorioV1 } from "@/lib/relatorio-contrato"

export const ROTINAS = ["alertas","monitor","prazos","lembretes","cobranca","briefing","vistoria","limpeza"] as const
export type Rotina = typeof ROTINAS[number]
type Tx = Prisma.TransactionClient
const rotulos: Record<RegraDemanda,string> = {
  prazo_vencido:"Prazo vencido",prazo_proximo:"Prazo até amanhã",sem_movimento:"Sem atualização há pelo menos três dias",
  aprovacao_pendente:"Aguardando aprovação interna",sem_final:"Finalizada sem arquivo final",captacao:"Captação nas próximas 24 horas",
}
const LOTE = 100
const resumoInicial = () => ({analisados:0,alertasCriados:0,alertasResolvidos:0,alertasReabertos:0,intencoesCriadas:0,semDestinatario:0,relatoriosCriados:0,tokens:0})
type Resumo = ReturnType<typeof resumoInicial>
async function transacao<T>(org:string, efeito:(tx:Tx)=>Promise<T>) {
  return prisma.$transaction(async tx=>{
    const [empresa]=await tx.$queryRaw<{ativo:boolean;ambienteTeste:boolean}[]>`SELECT ativo,"ambienteTeste" FROM organizacoes WHERE id=${org} FOR UPDATE`
    if(!empresa?.ativo || empresa.ambienteTeste) return null
    return efeito(tx)
  },{timeout:20_000})
}
async function agendar(tx:Tx,org:string,c:ContextoRegra,telefone:string|null,texto:string,expiraEm:Date,r:Resumo) {
  const tel=telefoneCompleto(telefone)
  if(!tel || !await destinoAutorizado(tx,org,tel)) {r.semDestinatario++;return}
  const chave=`regra:v1:${hashRegra([c,tel,c.tipo==="evento" ? null : dataEmSaoPaulo(new Date())])}`
  const ja=await tx.saidaWhatsapp.findUnique({where:{organizacaoId_chave:{organizacaoId:org,chave}},select:{id:true}})
  if(ja) return
  await criarSaida(tx,{organizacaoId:org,origem:"regra",regraContexto:c,referencia:c.id,chave,telefone:tel,texto,expiraEm})
  r.intencoesCriadas++
}
async function cancelarAntigas(tx:Tx,org:string,id:string) {
  const saidas=await tx.saidaWhatsapp.findMany({where:{organizacaoId:org,origem:"regra",referencia:id,estado:"aguardando"}})
  for(const s of saidas) if(!s.regraContexto || !await contextoRegraValido(tx,org,s.regraContexto as ContextoRegra,new Date()))
    await tx.saidaWhatsapp.update({where:{id:s.id,organizacaoId:org},data:{estado:"cancelado",motivo:"regra_resolvida",proximaTentativa:null}})
}
/** Resolve responsáveis explícitos. Perfil externo nunca vira usuário por adivinhação. */
async function telefones(tx:Tx,org:string,d:{editorId:string|null;videomakerId:string|null;usuarioId?:string|null}) {
  const valores:string[]=[]
  if(d.editorId) {
    const e=await tx.editor.findFirst({where:{id:d.editorId,vinculos:{some:{organizacaoId:org,status:"ativo"}}},select:{telefone:true,whatsapp:true}})
    if(e?.whatsapp || e?.telefone) valores.push((e.whatsapp || e.telefone)!)
  }
  if(d.videomakerId) {
    const v=await tx.videomaker.findFirst({where:{id:d.videomakerId,vinculos:{some:{organizacaoId:org,status:{in:["ativo","preferencial"]},emListaNegra:false}}},select:{telefone:true}})
    if(v?.telefone) valores.push(v.telefone)
  }
  if(!d.editorId && !d.videomakerId && d.usuarioId) {
    const u=await tx.usuario.findFirst({where:{id:d.usuarioId,status:"ativo",organizacoes:{some:{organizacaoId:org}}},select:{telefone:true}})
    if(u?.telefone) valores.push(u.telefone)
  }
  return [...new Set(valores.map(telefoneCompleto).filter((v):v is string=>!!v))]
}
async function demandas(org:string,rotina:Rotina,r:Resumo) {
  let cursor=""
  for(;;) {
    const pagina=await prisma.demanda.findMany({where:{organizacaoId:org,...(cursor?{id:{gt:cursor}}:{})},select:{id:true},orderBy:{id:"asc"},take:LOTE})
    if(!pagina.length) break
    for(const item of pagina) await transacao(org,async tx=>{
      const d=await tx.demanda.findFirst({where:{id:item.id,organizacaoId:org},include:{arquivos:{where:{tipoArquivo:"final"},select:{id:true},take:1}}})
      if(!d) return
      r.analisados++
      const agora=new Date(), regras=regrasDemanda(d,d.arquivos.length>0,agora)
      await cancelarAntigas(tx,org,d.id)
      if(rotina!=="lembretes") {
        const existentes=await tx.alertaIA.findMany({where:{organizacaoId:org,demandaId:d.id,chaveRegra:{not:null}}})
        for(const a of existentes) if(!regras.some(regra=>a.chaveRegra===`v1:${d.id}:${regra}`) && a.status==="ativo") {
          await tx.alertaIA.update({where:{id:a.id,organizacaoId:org},data:{status:"resolvido",resolvedAt:agora}});r.alertasResolvidos++
        }
        for(const regra of regras.filter(v=>v!=="captacao")) {
          const chaveRegra=`v1:${d.id}:${regra}`,anterior=existentes.find(a=>a.chaveRegra===chaveRegra)
          if(!anterior) {
            await tx.alertaIA.create({data:{organizacaoId:org,demandaId:d.id,chaveRegra,tipoAlerta:`regra_${regra}`,mensagem:`${d.codigo}: ${rotulos[regra]}.`,severidade:regra==="prazo_vencido"?"critico":"aviso",acaoSugerida:regra==="sem_final"?"Confira e anexe a entrega final.":"Abra a demanda e confira a próxima ação."}});r.alertasCriados++
          } else if(anterior.status==="resolvido") {
            await tx.alertaIA.update({where:{id:anterior.id,organizacaoId:org},data:{status:"ativo",resolvedAt:null,lida:false,snoozeAte:null}});r.alertasReabertos++
          }
        }
      }
      // Um aviso prioritário por demanda/dia/revisão; aprovação é trabalho do gestor, não cobrança ao prestador.
      const regra=rotina==="lembretes" ? regras.find(v=>v==="captacao") : rotina==="prazos" ? regras.find(v=>["prazo_vencido","prazo_proximo","sem_movimento"].includes(v)) : undefined
      if(!regra) return
      const destinos=await telefones(tx,org,d)
      if(!destinos.length) r.semDestinatario++
      for(const tel of destinos) await agendar(tx,org,{tipo:"demanda",id:d.id,revisao:d.updatedAt.toISOString(),regra},tel,
        `${d.codigo}: ${rotulos[regra]}. Confira o trabalho no Flow.`,regra==="captacao"?d.dataCaptacao!:new Date(agora.getTime()+86400_000),r)
    })
    cursor=pagina.at(-1)!.id
  }
}
async function eventos(org:string,r:Resumo) {
  let cursor=""
  for(;;) {
    // Inclui passados/cancelados para invalidar intenções antigas, em páginas sem teto silencioso.
    const pagina=await prisma.evento.findMany({where:{organizacaoId:org,...(cursor?{id:{gt:cursor}}:{})},select:{id:true},orderBy:{id:"asc"},take:LOTE})
    if(!pagina.length) break
    for(const item of pagina) await transacao(org,async tx=>{
      const e=await tx.evento.findFirst({where:{id:item.id,organizacaoId:org}})
      if(!e) return
      r.analisados++;await cancelarAntigas(tx,org,e.id)
      const c:ContextoRegra={tipo:"evento",id:e.id,revisao:revisaoEvento(e),regra:"lembrete"}
      if(!e.notificarEm || e.notificarEm>new Date() || !await contextoRegraValido(tx,org,c,new Date())) return
      const destinos=await telefones(tx,org,e)
      if(!destinos.length) r.semDestinatario++
      const horario=e.inicio.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})
      for(const tel of destinos) await agendar(tx,org,c,tel,`Lembrete: ${e.titulo.slice(0,200)}. Início: ${horario}. Confira sua agenda no Flow.`,e.inicio,r)
    })
    cursor=pagina.at(-1)!.id
  }
}
async function cobrancas(org:string,r:Resumo) {
  let cursor=""
  for(;;) {
    const pagina=await prisma.custoVideomaker.findMany({where:{organizacaoId:org,...(cursor?{id:{gt:cursor}}:{})},select:{id:true},orderBy:{id:"asc"},take:LOTE})
    if(!pagina.length) break
    for(const item of pagina) await transacao(org,async tx=>{
      const c=await tx.custoVideomaker.findFirst({where:{id:item.id,organizacaoId:org},include:{videomaker:{select:{telefone:true}}}})
      if(!c) return
      r.analisados++;await cancelarAntigas(tx,org,c.id)
      if(!cobrancaValida(c,new Date())) return
      await agendar(tx,org,{tipo:"custo",id:c.id,revisao:c.updatedAt.toISOString(),regra:"nota_fiscal_pendente"},c.videomaker.telefone,
        "Há uma nota fiscal pendente no Flow. Confira os detalhes e envie a documentação pelo sistema.",new Date(Date.now()+86400_000),r)
    })
    cursor=pagina.at(-1)!.id
  }
}
async function gestores(tx:Tx,org:string) {
  return tx.usuario.findMany({where:{status:"ativo",telefone:{not:null},organizacoes:{some:{organizacaoId:org,papel:{in:["admin","gestor"]}}}},select:{id:true,telefone:true}})
}
async function briefing(org:string,r:Resumo) {
  await transacao(org,async tx=>{
    const pendencias=await tx.alertaIA.count({where:{organizacaoId:org,status:"ativo"}})
    for(const g of await gestores(tx,org)) await agendar(tx,org,{tipo:"gestor",id:g.id,revisao:dataEmSaoPaulo(new Date()),regra:"briefing"},g.telefone,
      `O Flow tem ${pendencias} alertas ativos. Abra a central para conferir responsáveis e próximas ações.`,new Date(Date.now()+86400_000),r)
  })
}
async function relatorios(org:string,r:Resumo) {
  const hoje=dataEmSaoPaulo(new Date()),dia=new Date(`${hoje}T12:00:00Z`).getUTCDay()
  const segunda=somarDias(hoje,-((dia+6)%7))
  for(const area of ["audiovisual","design"] as const) {
    const recorte=recorteMetricas(new URLSearchParams({periodo:"custom",de:somarDias(segunda,-7),ate:somarDias(segunda,-1),area}))
    const chaveRegra=`semanal:v1:${area}:${recorte.de}:${recorte.ate}`
    if(await prisma.relatorioIA.findUnique({where:{organizacaoId_chaveRegra:{organizacaoId:org,chaveRegra}},select:{id:true}})) continue
    const snapshot=snapshotDoRelatorio(await metricasRelatorio(org,recorte,false))
    const analise=`Resumo operacional de ${area}: ${snapshot.demandasCriadas} demandas criadas, ${snapshot.concluidas} concluídas no período. Indicadores atuais e produção manual estão separados no snapshot. Sem análise de IA.`
    await transacao(org,async tx=>{
      const criado=await tx.relatorioIA.createMany({data:{organizacaoId:org,chaveRegra,tipo:"semanal",periodo:`${recorte.de} a ${recorte.ate}`,tokens:0,modelo:"regras-v1",
        conteudo:criarRelatorioV1({analise},{tipo:"semanal",periodo:`${recorte.de} a ${recorte.ate}`,area,origem:"agente",geradoEm:snapshot.metricas.geradoEm,inicio:recorte.inicio,fim:recorte.fim},snapshot)},skipDuplicates:true})
      r.relatoriosCriados+=criado.count
      if(!criado.count) return
      for(const g of await gestores(tx,org)) await agendar(tx,org,{tipo:"gestor",id:g.id,revisao:hoje,regra:chaveRegra},g.telefone,
        `Resumo semanal de ${area} disponível no Flow (${recorte.de} a ${recorte.ate}).`,new Date(Date.now()+86400_000),r)
    })
  }
}
/** Só iniciar rotinas com objetos elegíveis ou pendências que precisam ser encerradas. */
async function atividadeElegivel(org:string,rotina:Rotina) {
  if(await prisma.saidaWhatsapp.count({where:{organizacaoId:org,origem:"regra",estado:"aguardando"}})) return true
  if(rotina==="cobranca") return !!await prisma.custoVideomaker.count({where:{organizacaoId:org,pago:false,statusPagamento:"pendente_nf",dataVencimento:{lte:new Date(`${dataEmSaoPaulo(new Date())}T23:59:59.999Z`)}}})
  if(rotina==="lembretes") return !!(await prisma.evento.count({where:{organizacaoId:org,status:{in:["agendado","confirmado"]},inicio:{gt:new Date()},notificarEm:{lte:new Date()}}}) || await prisma.demanda.count({where:{organizacaoId:org,dataCaptacao:{gt:new Date(),lte:new Date(Date.now()+86400_000)},statusVisivel:{not:"finalizado"},statusInterno:{notIn:["encerrado","expirado","videomaker_recusou","postado","entregue_cliente"]}}}))
  if(await prisma.alertaIA.count({where:{organizacaoId:org,status:"ativo"}})) return true
  const condicoes:Prisma.DemandaWhereInput[]=[
    {statusVisivel:{not:"finalizado"},statusInterno:{notIn:["encerrado","expirado","videomaker_recusou","postado","entregue_cliente"]}},
    {area:"audiovisual",statusVisivel:"finalizado",OR:[{linkFinal:null},{linkFinal:""}],arquivos:{none:{tipoArquivo:"final"}}},
  ]
  if(rotina==="vistoria") {
    // Até 14 dias cobre a semana fechada anterior em qualquer dia da semana corrente.
    condicoes.push({createdAt:{gte:new Date(Date.now()-14*86400_000)}},{finalizadaEm:{gte:new Date(Date.now()-14*86400_000)}})
  }
  return !!await prisma.demanda.count({where:{organizacaoId:org,OR:condicoes}})
}
/** Sem rede/LLM. Páginas e efeitos pequenos; repetição usa chaves persistidas. */
export async function executarRotina(org:string,rotina:Rotina,usuarioId?:string) {
  return comOrg(org,async()=>{
    const r=resumoInicial()
    const empresa=await prisma.organizacao.findUnique({where:{id:org},select:{ativo:true,ambienteTeste:true}})
    if(!empresa?.ativo || empresa.ambienteTeste) return {...r,ignorada:"empresa_inativa_ou_teste"}
    const atividade=await atividadeElegivel(org,rotina)
    if(!atividade) return {...r,ignorada:"sem_atividade"}
    // Remover referências não pode depender de notificação apenas agendada. Política de mídia em M04.
    if(rotina==="limpeza") return {...r,ignorada:"retencao_sem_exclusao_automatica"}
    const execucao=await prisma.agenteExecucao.create({data:{organizacaoId:org,agente:`${rotina}-regras`,criadoPor:usuarioId,status:"executando",tokens:0}})
    try {
      if(["alertas","monitor","prazos","briefing"].includes(rotina)) await resolverAlertas(org)
      if(["alertas","monitor","prazos","lembretes","briefing"].includes(rotina)) await demandas(org,rotina,r)
      if(rotina==="lembretes") await eventos(org,r)
      if(rotina==="cobranca") await cobrancas(org,r)
      if(rotina==="briefing") await briefing(org,r)
      if(rotina==="vistoria") await relatorios(org,r)
      await prisma.agenteExecucao.update({where:{id:execucao.id,organizacaoId:org},data:{status:"concluido",resultado:r,alertasGerados:r.alertasCriados,finishedAt:new Date()}})
      return r
    } catch {
      await prisma.agenteExecucao.update({where:{id:execucao.id,organizacaoId:org},data:{status:"erro",erro:"falha_local_regras",finishedAt:new Date()}}).catch(()=>undefined)
      throw new Error("falha_local_regras")
    }
  })
}
