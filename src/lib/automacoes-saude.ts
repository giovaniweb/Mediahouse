import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { ROTINAS } from "@/lib/automacoes-regras"
export const CONSUMIDORES=["whatsapp-inbox",...ROTINAS.map(r=>`agentes:${r}`),"drive-copias"]
export type ContadoresSaude={concluidos:number;falhos:number;pendentes:number}
/** Sem cadência configurada não se inventa diagnóstico de cron atrasado. */
export function cadenciaMinutos(consumidor:string,config=process.env.AUTOMACOES_CADENCIAS_MINUTOS) {
  try {
    const valor=JSON.parse(config??"{}")[consumidor]
    return Number.isInteger(valor) && valor>=1 && valor<=10080?valor as number:null
  } catch {return null}
}
export function estadoBatida(inicio:Date|null,status:string|null,cadencia:number|null,agora=new Date()) {
  if(!inicio) return "sem_registro"
  if(cadencia && agora.getTime()-inicio.getTime()>cadencia*2*60000) return "atrasado"
  if(status==="executando" && agora.getTime()-inicio.getTime()>10*60000) return "interrompido"
  return status??"desconhecido"
}
/** Heartbeat técnico distinto de execução comercial: início persistido antes do trabalho. */
export async function acompanharConsumidor<T>(org:string,consumidor:string,executar:()=>Promise<{dados:T;contadores:ContadoresSaude}>) {
  if(!CONSUMIDORES.includes(consumidor)) throw new Error("Consumidor inválido")
  return comOrg(org,async()=>{
    const e=await prisma.agenteExecucao.create({data:{organizacaoId:org,agente:`heartbeat:${consumidor}`,status:"executando",tokens:0}})
    try {
      const {dados,contadores}=await executar()
      const pendentes=await prisma.jobAutomacao.count({where:{organizacaoId:org,estado:"pendente"}})
      const seguro=Object.fromEntries(Object.entries({...contadores,pendentes}).map(([k,v])=>[k,Number.isSafeInteger(v)&&v>=0?v:0]))
      await prisma.agenteExecucao.update({where:{id:e.id,organizacaoId:org},data:{status:contadores.falhos?"parcial":"concluido",resultado:seguro,finishedAt:new Date()}})
      return dados
    } catch {
      await prisma.agenteExecucao.update({where:{id:e.id,organizacaoId:org},data:{status:"erro",erro:"falha_local",finishedAt:new Date()}}).catch(()=>undefined)
      throw new Error("falha_local")
    }
  })
}
async function ultimoRecibo(org:string,nivel:number) {
  const [r]=await prisma.$queryRaw<{data:Date|null}[]>`SELECT max(r."ocorridoEm") AS data FROM recibos_whatsapp r
    JOIN saidas_whatsapp s ON s."organizacaoId"=r."organizacaoId" AND s."instanceId"=r."instanceId"
      AND s."providerMessageId"=r."providerMessageId" AND s."telefoneHash"=r."telefoneHash"
    WHERE r."organizacaoId"=${org} AND (r.estado='lido' OR (${nivel}<=2 AND r.estado='entregue') OR (${nivel}<=1 AND r.estado='aceito'))`
  return r?.data??null
}
export async function saudeWhatsapp(org:string) {
  return comOrg(org,async()=>{
    const [cfg,entrada,aceita,reciboAceite,entrega,leitura,fila,pendentes,atencao,pausadas]=await Promise.all([
      prisma.configWhatsapp.findUnique({where:{organizacaoId:org},select:{ativo:true,lastStatus:true,telefoneConectado:true,connectionEventoEm:true}}),
      prisma.inboxWhatsapp.findFirst({where:{organizacaoId:org},orderBy:{createdAt:"desc"},select:{createdAt:true}}),
      prisma.tentativaWhatsapp.findFirst({where:{organizacaoId:org,resultado:"aceito"},orderBy:{finishedAt:"desc"},select:{finishedAt:true}}),
      ultimoRecibo(org,1),
      ultimoRecibo(org,2),
      ultimoRecibo(org,3),
      prisma.eventoJob.findFirst({where:{organizacaoId:org,evento:{in:["concluido","falhou","cancelado","expirado"]}},orderBy:{createdAt:"desc"},select:{createdAt:true}}),
      prisma.saidaWhatsapp.count({where:{organizacaoId:org,estado:"aguardando",pausada:false}}),
      prisma.saidaWhatsapp.count({where:{organizacaoId:org,estado:{in:["falhou","desconhecido","expirado"]}}}),
      prisma.saidaWhatsapp.count({where:{organizacaoId:org,estado:"aguardando",pausada:true}}),
    ])
    const conexao=!cfg?.ativo?"sem_configuracao":cfg.lastStatus==="open" && cfg.telefoneConectado?"conectada":cfg.lastStatus && cfg.lastStatus!=="open"?"desconectada":"desconhecida"
    return {conexao,conexaoEm:cfg?.connectionEventoEm??null,ultimaEntrada:entrada?.createdAt??null,ultimaAceita:aceita?.finishedAt && reciboAceite ? new Date(Math.max(aceita.finishedAt.getTime(),reciboAceite.getTime())) : aceita?.finishedAt??reciboAceite,
      ultimaEntrega:entrega,ultimaLeitura:leitura,ultimoProcessamento:fila?.createdAt??null,pendentes,atencao,pausadas}
  })
}
export async function saudeConsumidores(org:string) {
  return comOrg(org,()=>Promise.all(CONSUMIDORES.map(async consumidor=>{
    const e=await prisma.agenteExecucao.findFirst({where:{organizacaoId:org,agente:`heartbeat:${consumidor}`},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{createdAt:true,finishedAt:true,status:true,resultado:true}})
    const cadencia=cadenciaMinutos(consumidor)
    return {consumidor,inicio:e?.createdAt??null,fim:e?.finishedAt??null,estado:estadoBatida(e?.createdAt??null,e?.status??null,cadencia),cadenciaMinutos:cadencia,contadores:e?.resultado??null}
  })))
}
