import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { randomBytes } from "node:crypto"
import pg from "pg"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { prismaBase as adminDb } from "@/lib/prisma"
import { comRls } from "@/lib/prisma-rls"
import { comOrg } from "@/lib/org-contexto"
import { emitirConvite, responderConvite } from "@/lib/convites"
const prefix=`convites-${randomBytes(5).toString("hex")}`,org=`${prefix}-a`,outra=`${prefix}-b`,user=`${prefix}-u`,vm=`${prefix}-vm`,vm2=`${prefix}-vm2`
const ator={organizacaoId:org,usuarioId:user},role=`teste_conv_${randomBytes(5).toString("hex")}`,senha=randomBytes(16).toString("hex")
const admin=new pg.Client({connectionString:process.env.DATABASE_URL_TEST})
let db:PrismaClient,raw:PrismaClient
const emitir=(id:string,profissional=vm)=>comOrg(org,()=>db.$transaction(tx=>emitirConvite(tx,ator,id,profissional)))
const responder=(token:string,acao:"aceitar"|"recusar"="aceitar",empresa=org,profissional=vm)=>comOrg(empresa,()=>db.$transaction(tx=>responderConvite(tx,{organizacaoId:empresa,token,acao,origem:"automacao",videomakerId:profissional})))
const job=(extra={})=>adminDb.demanda.create({data:{organizacaoId:org,codigo:`${prefix}-${randomBytes(4).toString("hex")}`,titulo:"Job sintético",descricao:"Teste",cidade:"Teste",departamento:"growth",tipoVideo:"reels",solicitanteId:user,statusInterno:"videomaker_notificado",...extra}})
beforeAll(async()=>{
  vi.stubEnv("EMAIL_ENCRYPTION_KEY","chave-sintetica-convites")
  await admin.connect();await admin.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${senha}'`);await admin.query(`GRANT app_user TO "${role}"`)
  const url=new URL(process.env.DATABASE_URL_TEST!);url.username=role;url.password=senha;raw=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});db=comRls(raw)
  await adminDb.organizacao.createMany({data:[org,outra].map(id=>({id,nome:id,slug:id}))});await adminDb.usuario.create({data:{id:user,nome:user,tipo:"admin",senhaHash:"sem-login",telefone:"5511998884321"}})
  await adminDb.usuarioOrganizacao.create({data:{usuarioId:user,organizacaoId:org,papel:"admin",areas:[]}})
  for(const id of [vm,vm2]) {
    await adminDb.videomaker.create({data:{id,nome:"Profissional sintético",redesSociais:[],areasAtuacao:[],habilidades:[],equipamentos:[]}})
    await adminDb.videomakerOrganizacao.create({data:{videomakerId:id,organizacaoId:org,valorDiaria:500}})
  }
})
beforeEach(async()=>{
  await adminDb.demanda.deleteMany({where:{organizacaoId:org}})
  await adminDb.saidaWhatsapp.deleteMany({where:{organizacaoId:org}})
  await adminDb.videomakerOrganizacao.updateMany({where:{organizacaoId:org},data:{valorDiaria:500,status:"ativo"}})
})
afterAll(async()=>{await raw?.$disconnect();await adminDb.organizacao.deleteMany({where:{id:{in:[org,outra]}}});await adminDb.videomaker.deleteMany({where:{id:{in:[vm,vm2]}}});await adminDb.usuario.delete({where:{id:user}});await adminDb.$disconnect();await admin.query(`DROP ROLE IF EXISTS "${role}"`);await admin.end()})
it("emissão concorrente é única e preserva condição após mudar diária",async()=>{
  const d=await job();const [a,b]=await Promise.all([emitir(d.id),emitir(d.id)]);expect(a.id).toBe(b.id)
  await adminDb.videomakerOrganizacao.updateMany({where:{organizacaoId:org},data:{valorDiaria:900}})
  await responder(a.token)
  const c=await adminDb.conviteVideomaker.findUniqueOrThrow({where:{id:a.id}});expect(c.tarifaDiaria?.toFixed(2)).toBe("500.00")
  await expect(comOrg(org,()=>db.conviteVideomaker.update({where:{id:a.id},data:{tarifaDiaria:900}}))).rejects.toThrow("imutável")
  expect(await adminDb.custoVideomaker.count({where:{demandaId:d.id}})).toBe(0)
})
it("dois profissionais simultâneos não ocupam a mesma vaga; retry não repete aviso",async()=>{
  const d=await job();const a=await emitir(d.id),b=await emitir(d.id,vm2)
  const results=await Promise.allSettled([responder(a.token),responder(b.token,"aceitar",org,vm2)])
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1)
  const atual=await adminDb.demanda.findUniqueOrThrow({where:{id:d.id}})
  const c=atual.videomakerId===vm ? a : b
  await responder(c.token,"aceitar",org,atual.videomakerId!)
  expect(await adminDb.historicoStatus.count({where:{demandaId:d.id}})).toBe(1)
  // Um aviso só, mesmo com a resposta repetida: o da gravação (lib/avisos-gravacao.ts), que tem a gravação como referência.
  expect(await adminDb.saidaWhatsapp.count({where:{organizacaoId:org,referencia:d.id}})).toBe(1)
  expect(await adminDb.eventoAuditoria.count({where:{organizacaoId:org,recursoId:c.id,acao:"convite.responder"}})).toBe(1)
  expect(fetch).not.toHaveBeenCalled()
})
it("recusa de convite antigo não remove o profissional atual nem altera sua etapa",async()=>{
  const d=await job();const c=await emitir(d.id)
  await adminDb.demanda.update({where:{id:d.id},data:{videomakerId:vm2,statusInterno:"captacao_agendada"}})
  await responder(c.token,"recusar")
  expect(await adminDb.demanda.findUniqueOrThrow({where:{id:d.id}})).toMatchObject({videomakerId:vm2,statusInterno:"captacao_agendada"})
  expect(await adminDb.historicoStatus.count({where:{demandaId:d.id}})).toBe(0)
})
it("expiração, empresa, destinatário e vínculo são revalidados",async()=>{
  const d=await job()
  const c=await adminDb.conviteVideomaker.create({data:{demandaId:d.id,videomakerId:vm,expiresAt:new Date(Date.now()-1000)}})
  await expect(responder(c.token)).rejects.toThrow("expirado")
  const valido=await emitir(d.id)
  await expect(responder(valido.token,"aceitar",outra)).rejects.toThrow("não encontrado")
  await expect(responder(valido.token,"aceitar",org,vm2)).rejects.toThrow("Destinatário")
  await adminDb.videomakerOrganizacao.updateMany({where:{organizacaoId:org,videomakerId:vm},data:{status:"inativo"}})
  await expect(responder(valido.token)).rejects.toThrow("indisponível")
  expect((await adminDb.demanda.findUniqueOrThrow({where:{id:d.id}})).videomakerId).toBeNull()
})
it("resposta WhatsApp anterior à emissão não aceita o novo convite",async()=>{
  const d=await job();const antes=new Date(Date.now()-1000),c=await emitir(d.id)
  await expect(comOrg(org,()=>db.$transaction(tx=>responderConvite(tx,{organizacaoId:org,token:c.token,acao:"aceitar",videomakerId:vm,recebidoEm:antes,origem:"whatsapp"})))).rejects.toThrow("após a mensagem")
})
it("falha de auditoria reverte aceite, atribuição e histórico no mesmo commit",async()=>{
  const d=await job();const c=await emitir(d.id)
  await expect(comOrg(org,()=>db.$transaction(tx=>responderConvite(tx,{organizacaoId:org,token:c.token,acao:"aceitar",origem:"manual",usuarioId:"x".repeat(129)})))).rejects.toThrow("auditoria inválido")
  expect((await adminDb.conviteVideomaker.findUniqueOrThrow({where:{id:c.id}})).status).toBe("pendente")
  expect((await adminDb.demanda.findUniqueOrThrow({where:{id:d.id}})).videomakerId).toBeNull()
  expect(await adminDb.historicoStatus.count({where:{demandaId:d.id}})).toBe(0)
})
it("zero cadastral e legado não viram contrato gratuito",async()=>{
  const d=await job();await adminDb.videomakerOrganizacao.updateMany({where:{organizacaoId:org},data:{valorDiaria:0}})
  const c=await emitir(d.id);expect(c.tarifaDiaria).toBeNull()
  await responder(c.token);expect((await adminDb.conviteVideomaker.findUniqueOrThrow({where:{id:c.id}})).tarifaDiaria).toBeNull()
})

it("WhatsApp usa o convite formal e registra sua resposta, sem escolher entre dois",async()=>{
  const { receberEntrada, processarInbox }=await import("@/lib/whatsapp-inbox")
  const { encryptSecret }=await import("@/lib/secret-crypto")
  const telefone="5511988876543",instance=`${prefix}-instance`,segredo="segredo-sintetico"
  await adminDb.videomaker.update({where:{id:vm},data:{telefone}})
  await adminDb.configWhatsapp.create({data:{organizacaoId:org,instanceId:instance,instanceUrl:"https://example.invalid",apiKey:"sintetica",webhookSecret:encryptSecret(segredo)}})
  const a=await job(),b=await job();const ca=await emitir(a.id),cb=await emitir(b.id)
  const enviar=()=>receberEntrada({instance,event:"messages.upsert",data:{key:{id:randomBytes(16).toString("hex"),fromMe:false,remoteJid:`${telefone}@s.whatsapp.net`},message:{conversation:"SIM"}}},segredo)
  try {
    await enviar();await processarInbox(org)
    expect((await adminDb.conviteVideomaker.findUniqueOrThrow({where:{id:ca.id}})).status).toBe("pendente")
    expect((await adminDb.conviteVideomaker.findUniqueOrThrow({where:{id:cb.id}})).status).toBe("pendente")
    // Seleção explícita pelo link encerra um dos convites. O próximo SIM fica inequívoco.
    await responder(cb.token,"recusar")
    await enviar();await processarInbox(org)
    expect((await adminDb.conviteVideomaker.findUniqueOrThrow({where:{id:ca.id}})).status).toBe("aceito")
    expect((await adminDb.demanda.findUniqueOrThrow({where:{id:a.id}})).videomakerId).toBe(vm)
    expect(await adminDb.historicoStatus.count({where:{demandaId:a.id}})).toBe(1)
  } finally {
    await adminDb.configWhatsapp.deleteMany({where:{organizacaoId:org}})
    await adminDb.videomaker.update({where:{id:vm},data:{telefone:null}})
  }
})
it("Onda 3: aceitar pela página grava a prova dos termos na mesma transação; WhatsApp e recusa não gravam",async()=>{
  const pela=await job();const c=await emitir(pela.id)
  await comOrg(org,()=>db.$transaction(tx=>responderConvite(tx,{organizacaoId:org,token:c.token,acao:"aceitar",origem:"automacao",videomakerId:vm,aceiteTermos:{ipHash:"hash-sintetico"}})))
  const provas=await adminDb.aceiteTermos.findMany({where:{organizacaoId:org,titularTipo:"videomaker",titularId:vm}})
  expect(provas).toHaveLength(1)
  expect(provas[0]).toMatchObject({origem:"convite_videomaker",documentos:["profissionais@1.0","privacidade@1.0"],ipHash:"hash-sintetico"})
  expect(await adminDb.eventoAuditoria.count({where:{organizacaoId:org,acao:"termos.aceite",recursoId:vm}})).toBe(1)
  // Reenvio do mesmo aceite não duplica a prova.
  await comOrg(org,()=>db.$transaction(tx=>responderConvite(tx,{organizacaoId:org,token:c.token,acao:"aceitar",origem:"automacao",videomakerId:vm,aceiteTermos:{ipHash:"hash-sintetico"}})))
  expect(await adminDb.aceiteTermos.count({where:{organizacaoId:org,titularId:vm}})).toBe(1)
  // Aceite pelo WhatsApp (sem a linha dos termos à vista) e recusa não geram prova.
  const zap=await job();const z=await emitir(zap.id,vm2);await responder(z.token,"aceitar",org,vm2)
  const nao=await job();const n=await emitir(nao.id,vm2)
  await comOrg(org,()=>db.$transaction(tx=>responderConvite(tx,{organizacaoId:org,token:n.token,acao:"recusar",origem:"automacao",videomakerId:vm2,aceiteTermos:{ipHash:null}})))
  expect(await adminDb.aceiteTermos.count({where:{organizacaoId:org,titularId:vm2}})).toBe(0)
})
it("aceite põe na fila o resumo do job para o videomaker, mesmo quando ele aceita logado (Gabriel, 13/11/2026)",async()=>{
  const telefone="5511977765432",vmUser=`${prefix}-vmu`
  await adminDb.videomaker.update({where:{id:vm},data:{telefone}})
  const resumos=(demandaId:string)=>adminDb.saidaWhatsapp.findMany({where:{organizacaoId:org,referencia:demandaId,chave:{contains:":confirmada:"}},select:{chave:true,destinatarioTipo:true}})
  try {
    // Pelo link (sem login): o videomaker recebe, a operação também.
    const a=await job({dataCaptacao:new Date("2026-11-20T17:00:00.000Z"),localGravacao:"Rua das Flores, 120"});const ca=await emitir(a.id)
    await responder(ca.token)
    const pelaPagina=await resumos(a.id)
    expect(pelaPagina.filter(s=>s.chave.includes(":videomaker:"))).toHaveLength(1)
    expect(pelaPagina.find(s=>s.chave.includes(":videomaker:"))?.destinatarioTipo).toBe("videomaker")
    // Reenvio do mesmo aceite não manda o resumo de novo.
    await responder(ca.token);expect(await resumos(a.id)).toHaveLength(pelaPagina.length)
    // Logado (pela área dele), o autor é ele: ainda assim recebe o resumo.
    await adminDb.usuario.create({data:{id:vmUser,nome:"Profissional sintético",tipo:"videomaker",senhaHash:"sem-login",telefone}})
    await adminDb.usuarioOrganizacao.create({data:{usuarioId:vmUser,organizacaoId:org,papel:"videomaker",areas:[]}})
    await adminDb.videomaker.update({where:{id:vm},data:{usuarioId:vmUser}})
    const b=await job();const cb=await emitir(b.id)
    await comOrg(org,()=>db.$transaction(tx=>responderConvite(tx,{organizacaoId:org,token:cb.token,acao:"aceitar",origem:"manual",videomakerId:vm,usuarioId:vmUser})))
    expect((await resumos(b.id)).filter(s=>s.chave.includes(":videomaker:"))).toHaveLength(1)
    // A recusa não manda resumo ao videomaker.
    const c=await job();const cc=await emitir(c.id);await responder(cc.token,"recusar")
    expect(await adminDb.saidaWhatsapp.count({where:{organizacaoId:org,referencia:c.id,chave:{contains:":videomaker:"}}})).toBe(0)
  } finally {
    await adminDb.videomaker.update({where:{id:vm},data:{telefone:null,usuarioId:null}})
    await adminDb.usuarioOrganizacao.deleteMany({where:{usuarioId:vmUser}})
    await adminDb.usuario.deleteMany({where:{id:vmUser}})
  }
})
