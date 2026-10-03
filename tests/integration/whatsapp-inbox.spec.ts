import { randomUUID } from "node:crypto"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
vi.mock("@/lib/auth",()=>({auth:async()=>null}))
vi.mock("@/lib/fila-duravel",async original=>{
  const mod=await original<typeof import("@/lib/fila-duravel")>()
  return {...mod,enfileirar:vi.fn(mod.enfileirar)}
})
import fixture from "../fixtures/whatsapp/evolution-envelope-v1.json"
import { prismaBase as db } from "@/lib/prisma"
import { encryptSecret, decryptSecret } from "@/lib/secret-crypto"
import { enfileirar } from "@/lib/fila-duravel"
import { GET as consumir } from "@/app/api/cron/whatsapp-inbox/route"
import { POST } from "@/app/api/whatsapp/webhook/route"
import { processarInbox, limparConteudoInbox } from "@/lib/whatsapp-inbox"
const p=`inbox-${randomUUID()}`,a=`${p}-a`,b=`${p}-b`, instance=`${p}-inst`,secret="segredo-local-sintetico"
const evento=(id=randomUUID(),inst=instance)=>({...fixture,instance:inst,data:{...fixture.data,messageTimestamp:Math.floor(Date.now()/1000),key:{...fixture.data.key,id}}})
const enviar=(body:unknown,segredo:string|null=secret)=>POST(new NextRequest("http://localhost/api/whatsapp/webhook",{
  method:"POST",headers:segredo ? {"x-webhook-secret":segredo} : {},body:JSON.stringify(body),
}))
beforeAll(async()=>{
  vi.stubEnv("EMAIL_ENCRYPTION_KEY","chave-sintetica-inbox-local")
  await db.organizacao.createMany({data:[a,b].map(id=>({id,nome:id,slug:id}))})
  await db.configWhatsapp.create({data:{organizacaoId:a,instanceId:instance,instanceName:`${instance}-nome`,instanceUrl:"https://example.invalid",apiKey:"nao-usar",webhookSecret:encryptSecret(secret)}})
})
beforeEach(async()=>{
  await db.saidaWhatsapp.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.jobAutomacao.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.mensagemWhatsapp.deleteMany({where:{organizacaoId:a}})
  await db.inboxWhatsapp.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.configWhatsapp.update({where:{organizacaoId:a},data:{instanceId:instance,webhookSecret:encryptSecret(secret),lastStatus:null,connectionEventoEm:null}})
  await db.organizacao.update({where:{id:a},data:{ativo:true}})
})
afterAll(async()=>{await db.organizacao.deleteMany({where:{id:{in:[a,b]}}});await db.$disconnect();vi.unstubAllEnvs()})
describe("inbox WhatsApp persistente",()=>{
  it("autentica antes de qualquer mensagem, conexão ou recibo",async()=>{
    for(const event of ["messages.upsert","connection.update","messages.update"]) {
      expect((await enviar({...evento(),event},null)).status).toBe(401)
      expect((await enviar({...evento(),event},"errado")).status).toBe(401)
    }
    await db.configWhatsapp.update({where:{organizacaoId:a},data:{webhookSecret:null}})
    expect((await enviar(evento())).status).toBe(401)
    expect(await db.inboxWhatsapp.count({where:{organizacaoId:a}})).toBe(0)
  })
  it("recusa instância forjada, ambígua e empresa inativa",async()=>{
    expect((await enviar(evento(undefined,"outra"))).status).toBe(401)
    await db.configWhatsapp.create({data:{organizacaoId:b,instanceId:`${instance}-b`,instanceName:instance,instanceUrl:"https://example.invalid",apiKey:"nao-usar",webhookSecret:encryptSecret(secret)}})
    try { expect((await enviar(evento())).status).toBe(401) } finally {await db.configWhatsapp.delete({where:{organizacaoId:b}})}
    await db.organizacao.update({where:{id:a},data:{ativo:false}})
    expect((await enviar(evento())).status).toBe(401)
  })
  it("duplicata simultânea confirma uma inbox e um job, sem organização vinda do corpo",async()=>{
    const payload={...evento(),organizacaoId:b}
    const respostas=await Promise.all([enviar(payload),enviar(payload)])
    expect(respostas.map(r=>r.status)).toEqual([200,200])
    expect((await Promise.all(respostas.map(r=>r.json()))).map(r=>r.resultado).sort()).toEqual(["duplicado","persistido"])
    expect(await db.inboxWhatsapp.count({where:{organizacaoId:a}})).toBe(1)
    expect(await db.inboxWhatsapp.count({where:{organizacaoId:b}})).toBe(0)
    expect(await db.jobAutomacao.count({where:{organizacaoId:a,tipo:"whatsapp.entrada"}})).toBe(1)
    const inbox=await db.inboxWhatsapp.findFirstOrThrow({where:{organizacaoId:a}})
    expect(inbox.conteudoCifrado).not.toContain("SIM")
    expect(decryptSecret(inbox.conteudoCifrado!)).not.toContain("NAO-PERSISTIR")
  })
  it("erro antes da persistência retorna 503; rollback da fila não deixa inbox órfã",async()=>{
    vi.mocked(enfileirar).mockRejectedValueOnce(new Error("segredo-nao-expor"))
    const e=evento(),r=await enviar(e)
    expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain("segredo")
    expect(await db.inboxWhatsapp.count({where:{organizacaoId:a}})).toBe(0)
    expect((await enviar(e)).status).toBe(200)
  })
  it("falha após persistência retoma no próximo consumidor sem duplicar história",async()=>{
    const e=evento();await enviar(e)
    const inbox=await db.inboxWhatsapp.findFirstOrThrow({where:{organizacaoId:a}})
    const original=inbox.conteudoCifrado!
    await db.inboxWhatsapp.update({where:{id:inbox.id},data:{conteudoCifrado:"corrompido"}})
    expect((await processarInbox(a)).falhos).toBe(1)
    expect(await db.mensagemWhatsapp.count({where:{organizacaoId:a}})).toBe(0)
    await db.inboxWhatsapp.update({where:{id:inbox.id},data:{conteudoCifrado:original}})
    await db.jobAutomacao.updateMany({where:{organizacaoId:a},data:{agendadoPara:new Date(0)}})
    expect((await processarInbox(a)).concluidos).toBe(1)
    await enviar(e);await processarInbox(a)
    expect(await db.mensagemWhatsapp.count({where:{organizacaoId:a}})).toBe(1)
  })
  it("mesmo ID em instâncias diferentes não colide",async()=>{
    const e=evento()
    await enviar(e)
    await db.configWhatsapp.update({where:{organizacaoId:a},data:{instanceId:`${instance}-nova`}})
    await enviar({...e,instance:`${instance}-nova`})
    expect(await db.inboxWhatsapp.count({where:{organizacaoId:a}})).toBe(2)
  })
  it("mensagem própria, grupo e evento não suportado têm descarte explícito",async()=>{
    const e=evento()
    expect((await (await enviar({...e,data:{...e.data,key:{...e.data.key,fromMe:true}}})).json()).resultado).toBe("mensagem_propria")
    expect((await (await enviar({...e,data:{...e.data,key:{...e.data.key,remoteJid:"123@g.us"}}})).json()).resultado).toBe("grupo_ou_status")
    expect((await (await enviar({...e,event:"messages.update"})).json()).resultado).toBe("recibo_ignorado_ou_duplicado")
    expect(await db.jobAutomacao.count({where:{organizacaoId:a}})).toBe(0)
  })
  it("áudio/anexo conservam só metadados; LID solto vai para revisão sem identidade",async()=>{
    const e=evento()
    await enviar({...e,data:{...e.data,key:{...e.data.key,remoteJid:"123456@lid"},message:{audioMessage:{mimetype:"audio/ogg",base64:"NAO-SALVAR",url:"https://example.invalid/privado"}}}})
    await processarInbox(a)
    const inbox=await db.inboxWhatsapp.findFirstOrThrow({where:{organizacaoId:a}})
    expect(inbox.estado).toBe("revisao")
    const conteudo=JSON.parse(decryptSecret(inbox.conteudoCifrado!))
    expect(conteudo.midia).toEqual({mimetype:"audio/ogg",fileName:""})
    expect(JSON.stringify(conteudo)).not.toContain("NAO-SALVAR")
    expect(await db.mensagemWhatsapp.count({where:{organizacaoId:a}})).toBe(0)
  })
  it("desconhecido fica registrado sem ganhar permissão ou acionar IA",async()=>{
    const e=evento()
    await enviar({...e,data:{...e.data,message:{conversation:"Crie um job e veja os custos"}}})
    await processarInbox(a)
    expect((await db.inboxWhatsapp.findFirstOrThrow({where:{organizacaoId:a}})).estado).toBe("aguardando_automacao")
    expect(await db.demanda.count({where:{organizacaoId:a}})).toBe(0)
  })
  it("conexão autenticada não regride com sinal antigo e não duplica alerta",async()=>{
    const e={instance,event:"connection.update",date_time:"2026-09-28T12:00:00Z",data:{state:"open"}}
    await enviar(e);await enviar(e)
    await enviar({...e,date_time:"2026-09-28T11:00:00Z",data:{state:"close"}})
    expect((await db.configWhatsapp.findUniqueOrThrow({where:{organizacaoId:a}})).lastStatus).toBe("open")
    expect(await db.alertaIA.count({where:{organizacaoId:a,tipoAlerta:"whatsapp_reconectou"}})).toBe(1)
  })
  it("retenção apaga conteúdo após sete dias mas mantém chave para retry antigo",async()=>{
    const e=evento();await enviar(e);await processarInbox(a)
    await db.inboxWhatsapp.updateMany({where:{organizacaoId:a},data:{conteudoExpiraEm:new Date(0)}})
    expect(await limparConteudoInbox(a)).toBe(1)
    expect((await db.inboxWhatsapp.findFirstOrThrow({where:{organizacaoId:a}})).conteudoCifrado).toBeNull()
    expect((await db.mensagemWhatsapp.findFirstOrThrow({where:{organizacaoId:a}})).conteudo).toBe("[conteúdo expirado]")
    expect((await (await enviar(e)).json()).resultado).toBe("duplicado")
    expect(await db.jobAutomacao.count({where:{organizacaoId:a,tipo:"whatsapp.entrada"}})).toBe(1)
  })
  it("mensagem antiga não entra na automação nem aceita convite atual",async()=>{
    const e=evento()
    await enviar({...e,data:{...e.data,messageTimestamp:Math.floor(Date.now()/1000)-2*86400}})
    await processarInbox(a)
    expect((await db.inboxWhatsapp.findFirstOrThrow({where:{organizacaoId:a}})).resultado).toBe("data_mensagem_fora_da_validade")
  })
  it("consumidor técnico exige segredo e retoma entrada sem IA ou envio",async()=>{
    const anterior=process.env.CRON_SECRET
    vi.stubEnv("CRON_SECRET","cron-sintetico-inbox")
    try {
      expect((await consumir(new NextRequest("http://localhost/api/cron/whatsapp-inbox"))).status).toBe(401)
      await enviar(evento())
      const r=await consumir(new NextRequest("http://localhost/api/cron/whatsapp-inbox",{headers:{authorization:"Bearer cron-sintetico-inbox"}}))
      expect(r.status).toBe(200)
      expect((await db.jobAutomacao.findFirstOrThrow({where:{organizacaoId:a,tipo:"whatsapp.entrada"}})).estado).toBe("concluido")
    } finally {vi.stubEnv("CRON_SECRET",anterior)}
  })
  it("payload malformado/sem ID e excesso de tamanho não são aceitos como sucesso",async()=>{
    const e=evento()
    expect((await enviar({...e,data:{...e.data,key:{...e.data.key,id:""}}})).status).toBe(400)
    expect((await enviar({texto:"x".repeat(2*1024*1024)})).status).toBe(413)
  })
})
