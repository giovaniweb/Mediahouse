import { criarSaida, registrarRecibos } from "@/lib/whatsapp-outbox"
import { createHash, randomUUID, timingSafeEqual } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma, prismaBase } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { encryptSecret, decryptSecret } from "@/lib/secret-crypto"
import { criarFila, enfileirar } from "@/lib/fila-duravel"
import { identidadeWhatsApp, jidRecebidoVerificado } from "@/lib/whatsapp-identidade"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { normalizarEntrada, objeto, type ConteudoEntrada } from "@/lib/whatsapp-inbox-contrato"

const TIPO = "whatsapp.entrada"
export class EntradaRecusada extends Error {
  constructor(public status: number, public motivo: string) { super(motivo) }
}
async function autenticar(instancia: unknown, segredo: string | null) {
  if (typeof instancia !== "string" || !instancia || instancia.length>128 || !segredo || segredo.length>512) throw new EntradaRecusada(401,"nao_autorizado")
  // A função retorna só empresa/configuração, nunca o segredo ou conteúdo.
  const [r] = await prismaBase.$queryRaw<{ organizacaoId: string; configId: string }[]>`SELECT * FROM public.whatsapp_instancia_org(${instancia})`
  if (!r) throw new EntradaRecusada(401,"nao_autorizado")
  return comOrg(r.organizacaoId,async()=>{
    const cfg = await prisma.configWhatsapp.findFirst({where:{id:r.configId,organizacaoId:r.organizacaoId},select:{id:true,organizacaoId:true,instanceId:true,webhookSecret:true}})
    let esperado = ""
    try { if(cfg?.webhookSecret) esperado = decryptSecret(cfg.webhookSecret) } catch { /* falha fechada */ }
    const a = Buffer.from(segredo), b = Buffer.from(esperado)
    if (!cfg || !esperado || a.length!==b.length || !timingSafeEqual(a,b)) throw new EntradaRecusada(401,"nao_autorizado")
    return cfg
  })
}

export async function receberEntrada(body: unknown, segredo: string | null): Promise<{resultado:string;organizacaoId?:string}> {
  const b = objeto(body)
  const cfg = await autenticar(b.instance ?? b.instanceName,segredo)
  const evento = typeof b.event==="string" ? b.event.toLowerCase().replace(/_/g,".") : ""
  return comOrg(cfg.organizacaoId,async()=>{
    if (evento === "connection.update") {
      const d = objeto(b.data), estado = d.state ?? d.status
      if (!["open","close","connecting","disconnected"].includes(String(estado))) throw new EntradaRecusada(400,"estado_invalido")
      const dataEvento = typeof b.date_time==="string" ? new Date(b.date_time) : null
      if (!dataEvento || !Number.isFinite(dataEvento.getTime()) || dataEvento.getTime()>Date.now()+300_000) throw new EntradaRecusada(400,"data_evento_invalida")
      await prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM config_whatsapp WHERE id=${cfg.id} AND "organizacaoId"=${cfg.organizacaoId} FOR UPDATE`
        const anterior=await tx.configWhatsapp.findFirst({where:{id:cfg.id,organizacaoId:cfg.organizacaoId,
          instanceId:cfg.instanceId,webhookSecret:cfg.webhookSecret,organizacao:{ativo:true}},
          select:{lastStatus:true,connectionEventoEm:true}})
        if(!anterior) throw new EntradaRecusada(401,"nao_autorizado")
        if(anterior.connectionEventoEm && anterior.connectionEventoEm>=dataEvento) return
        await tx.configWhatsapp.update({where:{id:cfg.id,organizacaoId:cfg.organizacaoId},
          data:{connectionEventoEm:dataEvento,lastStatus:String(estado),ativo:estado==="open",
            ...(estado==="open" ? {connectedAt:dataEvento} : {})}})
        if(anterior.lastStatus!==estado && estado!=="connecting") {
          const conectado=estado==="open"
          await tx.alertaIA.create({data:{organizacaoId:cfg.organizacaoId,status:"ativo",severidade:conectado ? "info" : "critico",
            tipoAlerta:conectado ? "whatsapp_reconectou" : "whatsapp_desconectado",
            mensagem:conectado ? "WhatsApp conectado." : "WhatsApp desconectado. Verifique a conexão em Configurações.",
            acaoSugerida:"Configurações › WhatsApp"}})
        }
      })
      return { resultado:"conexao_registrada" }
    }
    if(evento==="messages.update") {
      const registrados=await prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM organizacoes WHERE id=${cfg.organizacaoId} FOR UPDATE`
        const atual=await tx.configWhatsapp.findFirst({where:{id:cfg.id,organizacaoId:cfg.organizacaoId,instanceId:cfg.instanceId,
          webhookSecret:cfg.webhookSecret,organizacao:{ativo:true}},select:{id:true}})
        if(!atual) throw new EntradaRecusada(401,"nao_autorizado")
        try { return await registrarRecibos(tx,cfg.organizacaoId,cfg.instanceId,b.data,b.date_time) }
        catch(e) { if(e instanceof Error && ["Lote de recibos inválido","Data inválida"].includes(e.message)) throw new EntradaRecusada(400,"recibo_invalido");throw e }
      })
      return {resultado:registrados ? "recibos_persistidos" : "recibo_ignorado_ou_duplicado"}
    }
    if (evento !== "messages.upsert") return { resultado:"evento_nao_suportado" }
    let entrada: ReturnType<typeof normalizarEntrada>
    try { entrada = normalizarEntrada(b.data) } catch { throw new EntradaRecusada(400,"mensagem_invalida") }
    if ("ignorado" in entrada) return { resultado:entrada.ignorado }
    const e = entrada
    return prisma.$transaction(async tx=>{
      // Revalida configuração/empresa dentro da persistência (inclusive rotação de segredo).
      const atual = await tx.configWhatsapp.findFirst({where:{id:cfg.id,organizacaoId:cfg.organizacaoId,instanceId:cfg.instanceId,
        webhookSecret:cfg.webhookSecret,organizacao:{ativo:true}},select:{id:true}})
      if(!atual) throw new EntradaRecusada(401,"nao_autorizado")
      const id = randomUUID(), expiraEm = new Date(Date.now()+7*86400_000)
      const criado = await tx.inboxWhatsapp.createMany({data:{id,organizacaoId:cfg.organizacaoId,instanceId:cfg.instanceId,
        providerMessageId:e.providerMessageId,conteudoCifrado:encryptSecret(JSON.stringify(e.conteudo)),conteudoExpiraEm:expiraEm},skipDuplicates:true})
      const inbox = await tx.inboxWhatsapp.findUniqueOrThrow({where:{organizacaoId_instanceId_providerMessageId:{
        organizacaoId:cfg.organizacaoId,instanceId:cfg.instanceId,providerMessageId:e.providerMessageId}}})
      if(criado.count) await enfileirar(tx,{organizacaoId:cfg.organizacaoId,tipo:TIPO,referencia:inbox.id,
        chave:createHash("sha256").update(JSON.stringify([cfg.instanceId,e.providerMessageId])).digest("hex"),
        expiraEm:new Date(inbox.createdAt.getTime()+86400_000)})
      return { resultado:criado.count ? "persistido" : "duplicado", organizacaoId:cfg.organizacaoId }
    })
  })
}

async function processarLocal(tx: Prisma.TransactionClient, organizacaoId: string, id: string) {
  const inbox = await tx.inboxWhatsapp.findFirst({where:{id,organizacaoId,estado:"pendente"}})
  if(!inbox) return
  const cfg = await tx.configWhatsapp.findFirst({where:{organizacaoId,instanceId:inbox.instanceId},select:{id:true}})
  if(!cfg || !inbox.conteudoCifrado || inbox.conteudoExpiraEm<=new Date()) {
    await tx.inboxWhatsapp.update({where:{id,organizacaoId},data:{estado:"revisao",resultado:"config_ou_conteudo_indisponivel"}})
    return
  }
  const c = JSON.parse(decryptSecret(inbox.conteudoCifrado)) as ConteudoEntrada
  const remetente = jidRecebidoVerificado(c.remoteJid,c.remoteJidAlt)
  let resultado = "aguardando_automacao", demandaId: string | null = null
  if(!remetente) resultado="remetente_nao_verificado"
  else {
    // História é criada exatamente uma vez no mesmo commit do efeito e do job.
    await tx.mensagemWhatsapp.create({data:{inboxId:id,organizacaoId,telefone:remetente.telefone,
      conteudo:c.texto || "[mídia]",tipoMensagem:c.tipo,mediaType:c.midia?.mimetype || null,direcao:"entrada",status:"recebido"}})
    const sim = /^(SIM|CONFIRMAR|TOPO|TOPEI)[.!,\s]*$/i.test(c.texto)
    const nao = /^(N[ÃA]O|RECUSAR|RECUSO)[.!,\s]*$/i.test(c.texto)
    const enviadoEm=c.enviadoEm ? new Date(c.enviadoEm) : inbox.createdAt
    if(enviadoEm.getTime()<inbox.createdAt.getTime()-86400_000 || enviadoEm.getTime()>inbox.createdAt.getTime()+300_000) resultado="data_mensagem_fora_da_validade"
    else if(sim || nao) {
      const ident = await identidadeWhatsApp(organizacaoId,remetente.telefone,tx)
      const vm = ident.videomaker
      if(!vm) resultado="remetente_sem_convite"
      else {
        // Não aceitar um convite criado/alterado DEPOIS do recebimento.
        const demandas = await tx.demanda.findMany({where:{organizacaoId,videomakerId:vm.id,statusInterno:"videomaker_notificado"},take:2})
        if(demandas.length!==1 || demandas[0].updatedAt.getTime()>Math.min(inbox.createdAt.getTime(),enviadoEm.getTime()+(c.enviadoEm ? 999 : 0))) resultado="convite_ausente_ou_ambiguo"
        else {
          const d=demandas[0], status=sim ? "videomaker_aceitou" : "videomaker_recusou"
          const mudou=await tx.demanda.updateMany({where:{id:d.id,organizacaoId,videomakerId:vm.id,statusInterno:"videomaker_notificado",updatedAt:d.updatedAt},
            data:{statusInterno:status,statusVisivel:STATUS_PARA_COLUNA[status],...(!sim ? {videomakerId:null} : {})}})
          if(mudou.count) {
            await tx.historicoStatus.create({data:{demandaId:d.id,statusAnterior:"videomaker_notificado",statusNovo:status,origem:"whatsapp",observacao:"Resposta via inbox WhatsApp verificada"}})
            resultado=status; demandaId=d.id
          } else resultado="convite_alterado"
        }
      }
    }
  }
  await tx.inboxWhatsapp.update({where:{id,organizacaoId},data:{estado:resultado==="remetente_nao_verificado" ? "revisao" :
    resultado==="aguardando_automacao" ? "aguardando_automacao" : "processado",resultado,demandaId,processadoEm:new Date()}})
  const respostas:Record<string,string>={
    videomaker_aceitou:"Captação confirmada. A equipe dará continuidade aos detalhes.",
    videomaker_recusou:"Recusa registrada. A equipe poderá escalar outro profissional.",
    convite_ausente_ou_ambiguo:"Não encontrei um convite único para confirmar. Consulte a equipe.",
    convite_alterado:"O convite mudou. Consulte a equipe antes de confirmar.",
    remetente_sem_convite:"Não encontrei um convite autorizado para este número. Consulte a equipe.",
  }
  if(remetente && respostas[resultado]) await criarSaida(tx,{organizacaoId,chave:`inbox:${id}:resposta`,origem:"inbox",referencia:id,
    telefone:remetente.telefone,texto:respostas[resultado],expiraEm:new Date(inbox.createdAt.getTime()+86400_000)})
}

export async function processarInbox(organizacaoId: string) {
  const fila=criarFila(prisma), jobs=await fila.reivindicar(organizacaoId,2,[TIPO])
  const resumo={reivindicados:jobs.length,concluidos:0,falhos:0,obsoletos:0}
  for(const job of jobs) {
    const lease={id:job.id,organizacaoId,leaseToken:job.leaseToken!}
    try {
      if(job.versao!==1) { await fila.falhar(lease,"tipo_desconhecido",false); resumo.falhos++; continue }
      if(await fila.concluirLocal(lease,tx=>processarLocal(tx,organizacaoId,job.referencia))) resumo.concluidos++
      else resumo.obsoletos++
    } catch { if(await fila.falhar(lease)) resumo.falhos++; else resumo.obsoletos++ }
  }
  return resumo
}

/** Retém a chave idempotente; elimina conteúdo e contato da cópia de entrada. */
export async function limparConteudoInbox(organizacaoId: string) {
  return comOrg(organizacaoId,()=>prisma.$transaction(async tx=>{
    const vencidas=await tx.inboxWhatsapp.findMany({where:{organizacaoId,conteudoExpiraEm:{lte:new Date()},conteudoCifrado:{not:null}},take:100,orderBy:{conteudoExpiraEm:"asc"},select:{id:true}})
    const ids=vencidas.map(i=>i.id)
    await tx.mensagemWhatsapp.updateMany({where:{organizacaoId,inboxId:{in:ids}},data:{conteudo:"[conteúdo expirado]",telefone:"",mediaType:null,mediaUrl:null}})
    await tx.inboxWhatsapp.updateMany({where:{organizacaoId,id:{in:ids}},data:{conteudoCifrado:null}})
    return vencidas.length
  }))
}
