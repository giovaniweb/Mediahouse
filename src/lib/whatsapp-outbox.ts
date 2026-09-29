import { createHash, randomUUID } from "node:crypto"
import type { Prisma, SaidaWhatsapp } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { encryptSecret, decryptSecret } from "@/lib/secret-crypto"
import { criarFila, enfileirar } from "@/lib/fila-duravel"
import { identidadeWhatsApp, telefoneCompleto, jidRecebidoVerificado } from "@/lib/whatsapp-identidade"
import { objeto, type ConteudoEntrada } from "@/lib/whatsapp-inbox-contrato"

import { contextoRegraValido, type ContextoRegra } from "@/lib/regras-operacionais"

type Tx=Prisma.TransactionClient
const TIPO="whatsapp.saida"
export const hashTelefone=(telefone:string)=>createHash("sha256").update(telefone).digest("hex")
export async function destinoAutorizado(tx:Tx,organizacaoId:string,telefone:string) {
  const i=await identidadeWhatsApp(organizacaoId,telefone,tx)
  const destino=i.usuario ? {tipo:"usuario",id:i.usuario.id} : i.editor ? {tipo:"editor",id:i.editor.id} :
    i.videomaker ? {tipo:"videomaker",id:i.videomaker.id} : null
  return destino
}
async function agendar(tx:Tx,s:SaidaWhatsapp,agendadoPara=new Date()) {
  await enfileirar(tx,{organizacaoId:s.organizacaoId,tipo:TIPO,referencia:s.id,
    chave:`${s.id}:${s.revisao}:${s.tentativas}`,payload:{revisao:s.revisao},agendadoPara,expiraEm:s.expiraEm})
}
/** Intenção + negócio no mesmo tx. Autoridade do produtor é validada na fronteira. */
export async function criarSaida(tx:Tx,e:{organizacaoId:string;chave:string;origem:"inbox"|"manual"|"legado"|"regra";regraContexto?:ContextoRegra;referencia:string;telefone:string;texto:string;expiraEm:Date}) {
  const telefone=telefoneCompleto(e.telefone)
  if(!telefone || !e.texto.trim() || e.texto.length>4096 || !e.chave || e.chave.length>128 || !e.referencia || e.referencia.length>128 ||
    !Number.isFinite(e.expiraEm.getTime()) || e.expiraEm<=new Date()) throw new Error("Intenção de saída inválida")
  if(e.origem==="regra" && (!e.regraContexto || !await contextoRegraValido(tx,e.organizacaoId,e.regraContexto,new Date()))) throw new Error("Regra não vigente")
  let destino:{tipo:string;id:string}|null=null
  if(e.origem==="inbox") {
    const inbox=await tx.inboxWhatsapp.findFirst({where:{id:e.referencia,organizacaoId:e.organizacaoId,conteudoExpiraEm:{gt:new Date()}},select:{conteudoCifrado:true}})
    if(inbox?.conteudoCifrado) {
      const c=JSON.parse(decryptSecret(inbox.conteudoCifrado)) as ConteudoEntrada
      if(jidRecebidoVerificado(c.remoteJid,c.remoteJidAlt)?.telefone===telefone) destino={tipo:"inbox",id:e.referencia}
    }
  } else destino=await destinoAutorizado(tx,e.organizacaoId,telefone)
  if(!destino) throw new Error("Destinatário não autorizado")
  const id=randomUUID(),criado=await tx.saidaWhatsapp.createMany({data:{
    id,organizacaoId:e.organizacaoId,chave:e.chave,origem:e.origem,referencia:e.referencia,regraContexto:e.regraContexto,
    destinatarioTipo:destino.tipo,destinatarioId:destino.id,telefoneHash:hashTelefone(telefone),
    telefoneCifrado:encryptSecret(telefone),conteudoCifrado:encryptSecret(e.texto),
    expiraEm:e.expiraEm,conteudoExpiraEm:new Date(Date.now()+7*86400_000),
  },skipDuplicates:true})
  const s=await tx.saidaWhatsapp.findUniqueOrThrow({where:{organizacaoId_chave:{organizacaoId:e.organizacaoId,chave:e.chave}}})
  if(criado.count) await agendar(tx,s)
  return s
}
async function destinoContinuaValido(tx:Tx,s:SaidaWhatsapp,telefone:string,instanceId:string) {
  if(s.destinatarioTipo==="inbox") {
    const i=await tx.inboxWhatsapp.findFirst({where:{id:s.destinatarioId,organizacaoId:s.organizacaoId,instanceId,conteudoExpiraEm:{gt:new Date()}},select:{conteudoCifrado:true}})
    if(!i?.conteudoCifrado) return false
    const c=JSON.parse(decryptSecret(i.conteudoCifrado)) as ConteudoEntrada
    return jidRecebidoVerificado(c.remoteJid,c.remoteJidAlt)?.telefone===telefone
  }
  const d=await destinoAutorizado(tx,s.organizacaoId,telefone)
  return d?.tipo===s.destinatarioTipo && d.id===s.destinatarioId
}
const niveis:Record<string,number>={aceito:1,entregue:2,lido:3}
export async function reconciliarRecibos(tx:Tx,s:SaidaWhatsapp) {
  if(!s.instanceId || !s.providerMessageId) return
  const recibos=await tx.reciboWhatsapp.findMany({where:{organizacaoId:s.organizacaoId,instanceId:s.instanceId,providerMessageId:s.providerMessageId,telefoneHash:s.telefoneHash}})
  const melhor=recibos.sort((a,b)=>(niveis[b.estado]??0)-(niveis[a.estado]??0))[0]
  if(melhor && (niveis[melhor.estado]??0)>(niveis[s.estado]??0))
    await tx.saidaWhatsapp.update({where:{id:s.id,organizacaoId:s.organizacaoId},data:{estado:melhor.estado,motivo:null,proximaTentativa:null}})
}
/** Chamado somente após autenticar o envelope e revalidar a configuração. */
export async function registrarRecibos(tx:Tx,organizacaoId:string,instanceId:string,data:unknown,dataEvento:unknown) {
  const eventos=Array.isArray(data) ? data : [data]
  if(eventos.length>50) throw new Error("Lote de recibos inválido")
  const ocorridoEm=typeof dataEvento==="string" ? new Date(dataEvento) : new Date()
  if(!Number.isFinite(ocorridoEm.getTime()) || ocorridoEm.getTime()>Date.now()+300_000) throw new Error("Data inválida")
  let registrados=0
  for(const valor of eventos) {
    const e=objeto(valor)
    const mapa:Record<string,string>={SERVER_ACK:"aceito",DELIVERY_ACK:"entregue",READ:"lido",PLAYED:"lido"}
    const estado=typeof e.status==="string" ? mapa[e.status] : undefined
    const telefone=jidRecebidoVerificado(e.remoteJid,undefined)?.telefone
    if(e.fromMe!==true || !estado || !telefone || typeof e.keyId!=="string" || !e.keyId || e.keyId.length>128) continue
    const telefoneHash=hashTelefone(telefone)
    const chave=createHash("sha256").update(JSON.stringify([instanceId,e.keyId,estado,ocorridoEm.toISOString(),telefoneHash])).digest("hex")
    const r=await tx.reciboWhatsapp.createMany({data:{organizacaoId,instanceId,providerMessageId:e.keyId,telefoneHash,chave,estado,ocorridoEm},skipDuplicates:true})
    registrados+=r.count
    // Mesmo lock de organização usado pelo worker evita perder recibo anterior à resposta HTTP.
    const s=await tx.saidaWhatsapp.findFirst({where:{organizacaoId,instanceId,providerMessageId:e.keyId,telefoneHash}})
    if(s) await reconciliarRecibos(tx,s)
  }
  return registrados
}
type RespostaEnvio={estado:"aceito"|"falhou"|"aguardando"|"desconhecido";motivo:string|null;httpStatus?:number;providerMessageId?:string;esperaMs?:number}
export async function enviarEvolution(config:{instanceUrl:string;instanceId:string;apiKey:string},telefone:string,texto:string):Promise<RespostaEnvio> {
  try {
    const r=await fetch(`${config.instanceUrl.replace(/\/$/,"")}/message/sendText/${encodeURIComponent(config.instanceId)}`,{
      method:"POST",headers:{"Content-Type":"application/json",apikey:config.apiKey},
      body:JSON.stringify({number:telefone,text:texto}),signal:AbortSignal.timeout(15_000),redirect:"error",
    })
    const body=objeto(await r.json().catch(()=>null)),key=objeto(body.key)
    const providerMessageId=typeof key.id==="string" && key.id.length>0 && key.id.length<=128 ? key.id : undefined
    if(r.ok && providerMessageId) return {estado:"aceito",motivo:null,httpStatus:r.status,providerMessageId}
    if(r.ok || providerMessageId) return {estado:"desconhecido",motivo:"resposta_inconclusiva",httpStatus:r.status,providerMessageId}
    if(r.status===429 || r.status>=500) {
      const retry=r.headers.get("retry-after")
      const segundos=retry && /^\d+$/.test(retry) ? Number(retry)*1000 : retry ? new Date(retry).getTime()-Date.now() : 0
      return {estado:"aguardando",motivo:r.status===429 ? "limite_provedor" : "erro_provedor",httpStatus:r.status,
        esperaMs:Number.isFinite(segundos) ? Math.max(0,Math.min(segundos,86400_000)) : 0}
    }
    return {estado:"falhou",motivo:"rejeitado_provedor",httpStatus:r.status}
  } catch { return {estado:"desconhecido",motivo:"timeout_ou_rede"} }
}

export async function processarSaidas(organizacaoId:string) {
  // Reconciliar estados sem envio também para empresa pausada/validade vencida.
  await comOrg(organizacaoId,()=>prisma.saidaWhatsapp.updateMany({where:{organizacaoId,estado:"aguardando",expiraEm:{lte:new Date()}},
    data:{estado:"expirado",motivo:"validade_expirada",proximaTentativa:null}}))
  await comOrg(organizacaoId,async()=>{
    const org=await prisma.organizacao.findUnique({where:{id:organizacaoId},select:{ativo:true}})
    if(!org?.ativo) await prisma.saidaWhatsapp.updateMany({where:{organizacaoId,estado:"aguardando"},data:{estado:"cancelado",motivo:"empresa_inativa",proximaTentativa:null}})
    // Retenção da cópia de saída: sete dias, conservando chave/tentativas/recibos.
    await prisma.saidaWhatsapp.updateMany({where:{organizacaoId,conteudoExpiraEm:{lte:new Date()}},data:{telefoneCifrado:null,conteudoCifrado:null}})
  })
  const fila=criarFila(prisma),jobs=await fila.reivindicar(organizacaoId,1,[TIPO])
  const resumo={reivindicados:jobs.length,aceitos:0,falhos:0,desconhecidos:0,semEnvio:0}
  for(const job of jobs) {
    const lease={id:job.id,organizacaoId,leaseToken:job.leaseToken!}
    let envioIniciado=false
    try {
      const preparado=await fila.comLease(lease,async(tx,j)=>{
        const s=await tx.saidaWhatsapp.findFirst({where:{id:j.referencia,organizacaoId}})
        if(!s || s.pausada || s.estado!=="aguardando" || objeto(j.payload).revisao!==s.revisao) return null
        const falhar=async(estado:string,motivo:string)=>{await tx.saidaWhatsapp.update({where:{id:s.id,organizacaoId},data:{estado,motivo,proximaTentativa:null}});return null}
        if(j.versao!==1) return falhar("falhou","versao_nao_suportada")
        if(s.expiraEm.getTime()<=Date.now()+20_000) return falhar("expirado","validade_expirada")
        if(s.tentativas>=5) return falhar("falhou","tentativas_esgotadas")
        if(process.env.WHATSAPP_EVOLUTION_CONTRATO!=="2.3.7") return falhar("falhou","contrato_nao_validado")
        const cfg=await tx.configWhatsapp.findFirst({where:{organizacaoId,ativo:true}})
        if(!cfg) return falhar("falhou","sem_config")
        if(!s.telefoneCifrado || !s.conteudoCifrado) return falhar("expirado","conteudo_expirado")
        if(s.origem==="legado" && s.referencia!=="aviso") {
          const d=await tx.demanda.findFirst({where:{id:s.referencia,organizacaoId},select:{updatedAt:true}})
          if(!d || d.updatedAt>s.createdAt) return falhar("cancelado","objeto_alterado")
        }
        if(s.origem==="regra" && (!s.regraContexto || !await contextoRegraValido(tx,organizacaoId,s.regraContexto as ContextoRegra,new Date()))) return falhar("cancelado","regra_resolvida")
        const telefone=decryptSecret(s.telefoneCifrado),texto=decryptSecret(s.conteudoCifrado)
        if(!await destinoContinuaValido(tx,s,telefone,cfg.instanceId)) return falhar("cancelado","destinatario_alterado")
        const tentativa=await tx.tentativaWhatsapp.create({data:{organizacaoId,saidaId:s.id,numero:s.tentativas+1,leaseToken:lease.leaseToken,resultado:"iniciada"}})
        // Persistir incerteza ANTES da rede. Crash aqui jamais autoriza reenvio cego.
        await tx.saidaWhatsapp.update({where:{id:s.id,organizacaoId},data:{estado:"desconhecido",motivo:"envio_iniciado",
          instanceId:cfg.instanceId,tentativas:{increment:1},proximaTentativa:null}})
        return {s,cfg,telefone,texto,tentativa}
      })
      if(!preparado) {
        await fila.concluirLocal(lease,async()=>{})
        const atual=await comOrg(organizacaoId,()=>prisma.saidaWhatsapp.findFirst({where:{id:job.referencia,organizacaoId},select:{estado:true}}))
        if(atual?.estado==="falhou") resumo.falhos++
        else if(atual?.estado==="desconhecido") resumo.desconhecidos++
        else resumo.semEnvio++
        continue
      }
      envioIniciado=true
      // Rede fora da transação. Nunca alternar número como reação a HTTP/timeout.
      const resposta=await enviarEvolution(preparado.cfg,preparado.telefone,preparado.texto)
      const salvo=await fila.concluirLocal(lease,async tx=>{
        const atual=await tx.saidaWhatsapp.findFirstOrThrow({where:{id:preparado.s.id,organizacaoId}})
        const proxima=new Date(Date.now()+Math.max(resposta.esperaMs??0,30_000*2**(atual.tentativas-1)))
        let estado=resposta.estado,motivo=resposta.motivo
        if(estado==="aguardando" && (atual.tentativas>=5 || proxima>=atual.expiraEm)) {estado="falhou";motivo="tentativas_esgotadas"}
        await tx.tentativaWhatsapp.update({where:{id:preparado.tentativa.id,organizacaoId,leaseToken:lease.leaseToken},data:{
          resultado:estado,motivo,httpStatus:resposta.httpStatus,providerMessageId:resposta.providerMessageId,finishedAt:new Date()}})
        const s=await tx.saidaWhatsapp.update({where:{id:atual.id,organizacaoId},data:{estado,motivo,
          providerMessageId:resposta.providerMessageId,proximaTentativa:estado==="aguardando" ? proxima : null}})
        if(resposta.providerMessageId) await reconciliarRecibos(tx,s)
        if(estado==="aguardando") await agendar(tx,s,proxima)
      })
      if(salvo && resposta.estado==="aceito") resumo.aceitos++
      else if(resposta.estado==="desconhecido" || !salvo) resumo.desconhecidos++
      else resumo.falhos++
    } catch {
      // Se já houve preparação, permanece desconhecido. A retomada não fará nova rede.
      await fila.falhar(lease).catch(()=>false)
      if(envioIniciado) resumo.desconhecidos++; else resumo.falhos++
    }
  }
  return resumo
}

export const MOTIVOS_REENVIO=["config_corrigida","provedor_normalizado","destinatario_revalidado"] as const
export async function tentarNovamente(organizacaoId:string,id:string,usuarioId:string,motivo:string) {
  if(!MOTIVOS_REENVIO.includes(motivo as typeof MOTIVOS_REENVIO[number])) throw new Error("Informe o motivo da nova tentativa")
  return comOrg(organizacaoId,()=>prisma.$transaction(async tx=>{
    const [org]=await tx.$queryRaw<{ativo:boolean}[]>`SELECT ativo FROM organizacoes WHERE id=${organizacaoId} FOR UPDATE`
    const s=await tx.saidaWhatsapp.findFirst({where:{id,organizacaoId}})
    if(!org?.ativo || !s) throw new Error("Saída indisponível")
    if(s.estado==="aguardando") return s
    // Desconhecido/aceito/entregue/lido jamais ganham retry por botão.
    if(s.estado!=="falhou" || s.tentativas>=5 || s.expiraEm.getTime()<=Date.now()+20_000) throw new Error("Esta saída não permite nova tentativa")
    const cfg=await tx.configWhatsapp.findFirst({where:{organizacaoId,ativo:true},select:{instanceId:true}})
    if(!cfg || !s.telefoneCifrado || !s.conteudoCifrado || !await destinoContinuaValido(tx,s,decryptSecret(s.telefoneCifrado),cfg.instanceId)) throw new Error("Revalide conexão e destinatário")
    const nova=await tx.saidaWhatsapp.update({where:{id,organizacaoId},data:{estado:"aguardando",motivo:null,revisao:{increment:1},proximaTentativa:new Date()}})
    await agendar(tx,nova)
    const {registrarAuditoria,correlacaoAuditoria}=await import("@/lib/auditoria")
    await registrarAuditoria(tx,{organizacaoId,usuarioId},{acao:"whatsapp.retentativa",recurso:"saida_whatsapp",recursoId:id,correlationId:correlacaoAuditoria(),resultado:"intencao",depois:{motivo}})
    return nova
  }))
}

/** Serializado com a preparação do worker; nenhuma ação depois do início da rede. */
export async function controlarSaida(organizacaoId:string,id:string,usuarioId:string,acao:"pausar"|"retomar"|"cancelar") {
  return comOrg(organizacaoId,()=>prisma.$transaction(async tx=>{
    const [org]=await tx.$queryRaw<{ativo:boolean}[]>`SELECT ativo FROM organizacoes WHERE id=${organizacaoId} FOR UPDATE`
    const s=await tx.saidaWhatsapp.findFirst({where:{id,organizacaoId}})
    if(!org?.ativo || !s || !["aguardando","falhou"].includes(s.estado)) throw new Error("Ação indisponível")
    if(acao!=="cancelar" && (s.estado!=="aguardando" || s.expiraEm.getTime()<=Date.now()+20_000)) throw new Error("Ação indisponível")
    if((acao==="pausar" && s.pausada) || (acao==="retomar" && !s.pausada)) return s
    const nova=await tx.saidaWhatsapp.update({where:{id,organizacaoId},data:acao==="cancelar"?
      {estado:"cancelado",pausada:false,motivo:"cancelado_operador",proximaTentativa:null}:
      {pausada:acao==="pausar",revisao:{increment:1}}})
    if(acao==="retomar") await agendar(tx,nova,nova.proximaTentativa && nova.proximaTentativa>new Date()?nova.proximaTentativa:new Date())
    const {registrarAuditoria,correlacaoAuditoria}=await import("@/lib/auditoria")
    await registrarAuditoria(tx,{organizacaoId,usuarioId},{acao:`whatsapp.${acao}`,recurso:"saida_whatsapp",recursoId:id,correlationId:correlacaoAuditoria()})
    return nova
  }))
}
